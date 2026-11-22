import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import nacl from 'tweetnacl';

// Polyfill browser localStorage cleanly before importing frontend modules in Node
const memStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStorage.has(k) ? memStorage.get(k)! : null),
  setItem: (k: string, v: string) => {
    memStorage.set(k, String(v));
  },
  removeItem: (k: string) => {
    memStorage.delete(k);
  },
  clear: () => {
    memStorage.clear();
  },
};

import {
  hashPin,
  verifyUserPin,
  sanitizeUserForSession,
  sanitizeUsersForStorage,
  ensureMinimumFullAdmin,
  isHashedPin,
  FULL_ADMIN_PERMISSIONS,
} from '../src/lib/security';
import {
  validateActivationKey,
  createTrialLicenseForCurrentMachine,
  generateOfflineAuthorizedLicense,
  getMachineFingerprint,
} from '../src/lib/licensing';
import { validateAndParseBackupJson } from '../src/lib/backupManager';
import {
  enqueueSyncOp,
  flushSyncQueue,
  getPendingSyncOps,
  clearPendingSyncOps,
} from '../src/lib/syncQueue';
import { consolidateSaleItems } from '../src/lib/firebaseClient';
import { fetchApi } from '../src/lib/apiFetch';
import {
  findMatchingProveedor,
  deduplicateProveedoresList,
  validateVenezuelanFiscalId,
} from '../src/lib/validations';
import { Producto, Usuario } from '../src/types';

// Ensure importing server.ts does not attempt to bind port 3000 during tests
process.env.SKIP_SERVER_LISTEN = '1';

describe('Seguridad de PINs, Sesiones y Control de Privilegios', () => {
  test('verifyUserPin rechaza backdoors hardcodeados (9999, 1111, 1234, 1001) cuando no coinciden con el hash real', async () => {
    const realHash = await hashPin('4829');
    assert.equal(await verifyUserPin('4829', realHash), true);
    assert.equal(await verifyUserPin(' 4829 ', realHash), true);
    assert.equal(await verifyUserPin('9999', realHash), false);
    assert.equal(await verifyUserPin('1111', realHash), false);
    assert.equal(await verifyUserPin('1234', realHash), false);
    assert.equal(await verifyUserPin('1001', realHash), false);
    assert.equal(await verifyUserPin('', realHash), false);
    assert.equal(await verifyUserPin('4829', '••••'), false);
  });

  test('sanitizeUserForSession enmascara el PIN y sanitizeUsersForStorage convierte PINs a SHA-256 sin re-hashear', async () => {
    const rawUser: Usuario = {
      id: 7,
      username: 'cajero_test',
      nombre_completo: 'Cajero Prueba',
      pin: '5678',
      rol: 'cajero',
      sucursal_id: 1,
      cargo: 'Cajero',
    };

    const sessionUser = sanitizeUserForSession(rawUser);
    assert.equal(sessionUser?.pin, '••••');
    assert.equal(sessionUser?.rol, 'cajero');

    const stored = await sanitizeUsersForStorage([rawUser]);
    assert.equal(stored.length, 1);
    assert.equal(isHashedPin(stored[0].pin), true);
    assert.notEqual(stored[0].pin, '5678');

    // Re-sanitizing an already hashed list must be idempotent
    const storedTwice = await sanitizeUsersForStorage(stored);
    assert.equal(storedTwice[0].pin, stored[0].pin);
  });

  test('ensureMinimumFullAdmin repara permisos de un admin existente y NUNCA promueve un cajero a admin', () => {
    const existingAdminWithPartialPerms: Usuario[] = [
      {
        id: 1,
        username: 'gerente_general',
        nombre_completo: 'Gerente General',
        pin: 'abcd'.repeat(16),
        rol: 'admin',
        sucursal_id: 1,
        cargo: 'Gerente General',
        permisos: { ...FULL_ADMIN_PERMISSIONS, configuracion: false },
      },
    ];

    const resAdmin = ensureMinimumFullAdmin(existingAdminWithPartialPerms);
    assert.equal(resAdmin.repaired, true);
    assert.equal(resAdmin.lockedOutNoAdmin, false);
    assert.equal(resAdmin.users[0].rol, 'admin');
    assert.equal(resAdmin.users[0].permisos?.configuracion, true);

    const onlyCashiers: Usuario[] = [
      {
        id: 2,
        username: 'cajero_1',
        nombre_completo: 'Cajero Caja 1',
        pin: 'ef01'.repeat(16),
        rol: 'cajero',
        sucursal_id: 1,
        cargo: 'Cajero',
        permisos: { ...FULL_ADMIN_PERMISSIONS, configuracion: false },
      },
    ];

    const resCashier = ensureMinimumFullAdmin(onlyCashiers);
    assert.equal(resCashier.repaired, false);
    assert.equal(resCashier.lockedOutNoAdmin, true);
    assert.equal(resCashier.users[0].rol, 'cajero');
  });
});

describe('Licenciamiento Asimétrico Ed25519 y Bloqueo de Emisión Offline', () => {
  test('generateOfflineAuthorizedLicense rechaza la emisión comercial offline aunque se pase cualquier clave', () => {
    const res = generateOfflineAuthorizedLicense(
      {
        machineId: 'POS-TEST-0000-0000-0000',
        empresa: 'Test Corp',
        rif: 'J-12345678-9',
        tipo: 'vitalicia',
        fechaEmision: '2026-01-01',
        fechaVencimiento: 'VITALICIA',
        cajasMax: 5,
        sucursalesMax: 3,
      },
      'TestSecretOnlyForUnitCheck'
    );
    assert.equal(res.success, false);
    assert.equal(res.key, undefined);
  });

  test('createTrialLicenseForCurrentMachine genera clave DEMO- válida y rechaza alteración o formato LIC-', () => {
    const machineId = getMachineFingerprint();
    const demoKey = createTrialLicenseForCurrentMachine('Negocio Demo', 'J-00000000-0');
    assert.ok(demoKey.startsWith('DEMO-'));

    const valid = validateActivationKey(demoKey, machineId);
    assert.equal(valid.isValid, true);
    assert.equal(valid.license?.tipo, 'demo');

    // Reject spoofed/tampered signature
    const tampered = `${demoKey.slice(0, -4)}FFFF`;
    const tamperedRes = validateActivationKey(tampered, machineId);
    assert.equal(tamperedRes.isValid, false);
    assert.equal(tamperedRes.isTampered, true);

    // Reject legacy client-forged LIC- tokens
    const fakeLegacy = validateActivationKey('LIC-e30=.AABBCCDD11223344', machineId);
    assert.equal(fakeLegacy.isValid, false);
  });
});

describe('Respaldos JSON, Consolidación de Ítems, Cola Offline Idempotente y Proveedores', () => {
  test('validateAndParseBackupJson preserva stock_minimo, reporta warnings/rejectedStats y rechaza JSON corrupto', () => {
    const bad = validateAndParseBackupJson('{invalid');
    assert.equal(bad.isValid, false);

    const payloadJson = JSON.stringify({
      version: '2.0.0',
      empresa: { nombre: 'Comercial Prueba', rif: 'J-30111222-3' },
      datos: {
        empresaConfig: { nombreEmpresa: 'Comercial Prueba', rif: 'J-30111222-3', tasaCambio: 50 },
        productos: [
          { id: 1, nombre: 'Harina Maíz', precio: 1.5, stock_minimo: 12 },
          { id: 2, nombre: 'Producto Inválido', precio: -5 },
        ],
        inventario: [
          { producto_id: 1, sucursal_id: 1, stock: 30 },
          { producto_id: 'bad', sucursal_id: 1, stock: 5 },
        ],
        ventas: [
          { id: 1001, total: 25.5 },
          { id: 1002, total: -10 },
        ],
        usuarios: [],
      },
    });

    const parsed = validateAndParseBackupJson(payloadJson);
    assert.equal(parsed.isValid, true);
    assert.equal(parsed.payload?.datos.productos.length, 1);
    assert.equal(parsed.payload?.datos.productos[0].stock_minimo, 12);
    assert.equal(parsed.payload?.datos.inventario.length, 1);
    assert.equal(parsed.payload?.datos.inventario[0].id, 1);
    assert.equal(parsed.rejectedStats?.productos, 1);
    assert.equal(parsed.rejectedStats?.inventario, 1);
    assert.equal(parsed.rejectedStats?.ventas, 1);
    assert.ok(Array.isArray(parsed.warnings) && parsed.warnings.length >= 3);
  });

  test('consolidateSaleItems fusiona líneas duplicadas del mismo producto para validación atómica de stock', () => {
    const prodA: Producto = {
      id: 10,
      codigo_barras: '7591234',
      nombre: 'Queso Blanco',
      precio: 6.5,
      unidad_medida: 'KG',
    };
    const prodB: Producto = {
      id: 20,
      codigo_barras: '7595678',
      nombre: 'Refresco 2L',
      precio: 2.2,
      unidad_medida: 'UND',
    };

    const consolidated = consolidateSaleItems([
      { producto: prodA, cantidad: 0.75 },
      { producto: prodB, cantidad: 2 },
      { producto: prodA, cantidad: 0.5 },
    ]);

    assert.equal(consolidated.length, 2);
    const mergedA = consolidated.find((c) => c.producto.id === 10);
    const mergedB = consolidated.find((c) => c.producto.id === 20);
    assert.equal(mergedA?.cantidad, 1.25);
    assert.equal(mergedB?.cantidad, 2);
  });

  test('syncQueue encola idempotente por dedupeKey (incluyendo firestore_venta) y reintenta manteniendo fallidos', async () => {
    clearPendingSyncOps();
    enqueueSyncOp('sync_state', 'sync_state:latest', { step: 1 });
    enqueueSyncOp('sync_state', 'sync_state:latest', { step: 2 });
    enqueueSyncOp('firestore_venta', 'firestore_venta:vta_1_tx123', {
      txUid: 'tx123',
      sucursalId: 1,
      venta: { id: 1, total: 15 },
      items: [],
    });

    const opsBefore = getPendingSyncOps();
    assert.equal(opsBefore.length, 2);
    assert.equal(opsBefore[0].payload.step, 2);
    assert.equal(opsBefore[1].type, 'firestore_venta');

    const firstFlush = await flushSyncQueue(async (op) => {
      return op.type === 'firestore_venta'; // sync_state fails once, firestore_venta succeeds
    });
    assert.equal(firstFlush.succeeded, 1);
    assert.equal(firstFlush.remaining, 1);

    const remaining = getPendingSyncOps();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].dedupeKey, 'sync_state:latest');
    assert.equal(remaining[0].attempts, 1);

    const secondFlush = await flushSyncQueue(async () => true);
    assert.equal(secondFlush.succeeded, 1);
    assert.equal(getPendingSyncOps().length, 0);
  });

  test('deduplicateProveedoresList fusiona proveedores duplicados por RIF o razón social normalizada', () => {
    const list = [
      {
        id: 10,
        nombre: 'Distribuidora Polar C.A.',
        rif: 'J-00041372-8',
        contacto: 'Contacto Factura',
        telefono: 'N/A',
        saldoPendiente: 100,
      },
      {
        id: 25,
        nombre: 'DISTRIBUIDORA POLAR',
        rif: 'j000413728',
        contacto: 'Luis Pérez',
        telefono: '0414-1234567',
        saldoPendiente: 50,
      },
    ];

    assert.ok(findMatchingProveedor(list, 'distribuidora polar', 'J-00041372-8'));
    const { proveedores, idMap, mergedCount } = deduplicateProveedoresList(list);
    assert.equal(mergedCount, 1);
    assert.equal(proveedores.length, 1);
    assert.equal(proveedores[0].saldoPendiente, 150);
    assert.equal(proveedores[0].telefono, '0414-1234567');
    assert.equal(idMap.get(25), 10);

    const rifCheck = validateVenezuelanFiscalId('J301234561');
    assert.equal(rifCheck.isValid, true);
    assert.equal(rifCheck.formatted, 'J-30123456-1');
  });
});

describe('Seguridad Backend HTTP, Fail-Closed Secrets, Autorización y Licenciamiento Ed25519', () => {
  let server: http.Server;
  let baseUrl = '';
  const dbPath = path.join(process.cwd(), 'data', 'server_db.json');
  let originalDbContent: string | null = null;
  let origAdminDevKey: string | undefined;
  let origLicenseSecretKey: string | undefined;

  before(async () => {
    origAdminDevKey = process.env.ADMIN_DEV_KEY;
    origLicenseSecretKey = process.env.DEV_LICENSE_ED25519_SECRET_KEY;
    delete process.env.ADMIN_DEV_KEY;
    delete process.env.DEV_LICENSE_ED25519_SECRET_KEY;

    if (fs.existsSync(dbPath)) {
      originalDbContent = fs.readFileSync(dbPath, 'utf-8');
      fs.unlinkSync(dbPath);
    }
    const { app } = await import('../server');
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (origAdminDevKey !== undefined) {
      process.env.ADMIN_DEV_KEY = origAdminDevKey;
    } else {
      delete process.env.ADMIN_DEV_KEY;
    }
    if (origLicenseSecretKey !== undefined) {
      process.env.DEV_LICENSE_ED25519_SECRET_KEY = origLicenseSecretKey;
    } else {
      delete process.env.DEV_LICENSE_ED25519_SECRET_KEY;
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalDbContent !== null) {
      fs.writeFileSync(dbPath, originalDbContent, 'utf-8');
    } else if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('Rechaza CORS de orígenes externos no confiables y permite localhost con Vary: Origin', async () => {
    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(blocked.status, 403);

    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(allowed.headers.get('vary'), 'Origin');
  });

  test('Bloquea rutas internas sin sesión (GET /api/pedidos, GET /api/sync/state) y expone catálogo sanitizado en /api/public/store-state', async () => {
    const unauthPedidos = await fetch(`${baseUrl}/api/pedidos`);
    assert.equal(unauthPedidos.status, 401);

    const unauthSyncGet = await fetch(`${baseUrl}/api/sync/state`);
    assert.equal(unauthSyncGet.status, 401);

    const unauthPatch = await fetch(`${baseUrl}/api/pedidos/ped_test`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'entregado' }),
    });
    assert.equal(unauthPatch.status, 401);

    const unauthSync = await fetch(`${baseUrl}/api/sync/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productos: [] }),
    });
    assert.equal(unauthSync.status, 401);

    const unauthReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmWord: 'REINICIAR' }),
    });
    assert.equal(unauthReset.status, 401);

    // Obtain a cajero POS session token and verify role enforcement
    const cashierSessionRes = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2, rol: 'cajero', machineId: 'POS-TEST-0001' }),
    });
    assert.equal(cashierSessionRes.status, 200);
    const cashierSession = (await cashierSessionRes.json()) as { token: string };
    assert.ok(cashierSession.token);

    // Cajero must receive 403 on factory-reset and AI invoice parsing
    const forbiddenReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': cashierSession.token,
      },
      body: JSON.stringify({ confirmWord: 'REINICIAR' }),
    });
    assert.equal(forbiddenReset.status, 403);

    const forbiddenInvoice = await fetch(`${baseUrl}/api/compras/parse-invoice/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': cashierSession.token,
      },
      body: JSON.stringify({ fileBase64: 'ZmFrZQ==', mimeType: 'image/png' }),
    });
    assert.equal(forbiddenInvoice.status, 403);

    // Public storefront endpoint works without auth and stays sanitized
    const publicStoreRes = await fetch(`${baseUrl}/api/public/store-state`);
    assert.equal(publicStoreRes.status, 200);
    const publicStoreJson = (await publicStoreRes.json()) as any;
    assert.equal(publicStoreJson.success, true);
    assert.equal(publicStoreJson.pedidos, undefined);
  });

  test('Valida PINs registrados en /api/auth/pos-session, protege /api/sync/state y sanitiza datos públicos y privados', async () => {
    // First admin bootstrap sync before hashes are registered
    const initAdminRes = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, rol: 'admin', machineId: 'POS-ADMIN-0001' }),
    });
    assert.equal(initAdminRes.status, 200);
    const initAdminSession = (await initAdminRes.json()) as { token: string };

    const realAdminPinHash = await hashPin('4917');
    const realCashierPinHash = await hashPin('2580');

    const syncRes = await fetch(`${baseUrl}/api/sync/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': initAdminSession.token,
      },
      body: JSON.stringify({
        empresaConfig: {
          nombreEmpresa: 'Empresa Test Seguro',
          rif: 'J-99999999-1',
          direccionFiscal: 'Av. Privada 123',
          telefono: '0212-5550000',
          tasaCambio: 50,
          fiscalUpdatedAt: new Date().toISOString(),
          apiKey: 'SHOULD_BE_STRIPPED',
          pin: 'SHOULD_BE_STRIPPED',
        },
        productos: [
          {
            id: 1,
            nombre: 'Café Molido 500g',
            precio: 5.5,
            costo: 3.1,
            codigo_barras: '7590001',
          },
        ],
        inventario: [{ id: 1, producto_id: 1, sucursal_id: 1, stock: 42 }],
        adminPinHashes: [{ id: 1, pinHash: realAdminPinHash }],
        userPinHashes: [
          { id: 1, pinHash: realAdminPinHash },
          { id: 2, pinHash: realCashierPinHash },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);

    // Public store-state MUST omit RIF, dirección, teléfono, pedidos, costo and expose `stock`
    const publicRes = await fetch(`${baseUrl}/api/public/store-state`);
    assert.equal(publicRes.status, 200);
    const publicJson = (await publicRes.json()) as any;
    assert.equal(publicJson.empresaConfig.nombreEmpresa, 'Empresa Test Seguro');
    assert.equal(publicJson.empresaConfig.rif, undefined);
    assert.equal(publicJson.empresaConfig.direccionFiscal, undefined);
    assert.equal(publicJson.empresaConfig.telefono, undefined);
    assert.equal(publicJson.productos[0].costo, undefined);
    assert.equal(publicJson.inventario[0].stock, 42);
    assert.equal(publicJson.pedidos, undefined);

    // Now that userPinHashes are synced, POS session MUST reject missing or wrong PIN with 401
    const missingPinSession = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2, rol: 'cajero', machineId: 'POS-CAJA-2' }),
    });
    assert.equal(missingPinSession.status, 401);

    const wrongPinSession = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, rol: 'admin', machineId: 'POS-ADMIN-0001', pin: '9999' }),
    });
    assert.equal(wrongPinSession.status, 401);

    // Correct PIN succeeds
    const validAdminSessionRes = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, rol: 'admin', machineId: 'POS-ADMIN-0001', pin: '4917' }),
    });
    assert.equal(validAdminSessionRes.status, 200);
    const validAdminSession = (await validAdminSessionRes.json()) as { token: string };

    // Authenticated GET /api/sync/state succeeds and omits sensitive keys/PIN hashes
    const getStateRes = await fetch(`${baseUrl}/api/sync/state`, {
      headers: { 'x-pos-session': validAdminSession.token },
    });
    assert.equal(getStateRes.status, 200);
    const getStateJson = (await getStateRes.json()) as any;
    assert.equal(getStateJson.empresaConfig.nombreEmpresa, 'Empresa Test Seguro');
    assert.equal(getStateJson.empresaConfig.apiKey, undefined);
    assert.equal(getStateJson.empresaConfig.pin, undefined);
    assert.equal(getStateJson.adminPinHashes, undefined);
    assert.equal(getStateJson.userPinHashes, undefined);

    // Wrong PIN must be rejected with 403 on factory-reset even with valid admin session token
    const badPinReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': validAdminSession.token,
      },
      body: JSON.stringify({
        confirmWord: 'REINICIAR',
        adminPin: '9999',
      }),
    });
    assert.equal(badPinReset.status, 403);

    // Genuine admin PIN succeeds cleanly and preserves PIN hashes
    const okPinReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': validAdminSession.token,
      },
      body: JSON.stringify({
        confirmWord: 'REINICIAR',
        adminPin: '4917',
      }),
    });
    assert.equal(okPinReset.status, 200);

    // After factory-reset, wrong PIN is still rejected because adminPinHashes/userPinHashes were preserved
    const postResetBadPin = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, rol: 'admin', machineId: 'POS-ADMIN-0001', pin: '9999' }),
    });
    assert.equal(postResetBadPin.status, 401);
  });

  test('Falla cerrado (503) sin secretos configurados, y emite licencia Ed25519 válida con secretos de prueba efímeros', async () => {
    const machineId = 'POS-1234-5678-ABCD-EF01';

    // Without ADMIN_DEV_KEY & DEV_LICENSE_ED25519_SECRET_KEY, developer endpoints must fail closed with 503
    const unconfiguredVerify = await fetch(`${baseUrl}/api/developer/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'any' }),
    });
    assert.equal(unconfiguredVerify.status, 503);

    const unconfiguredLicense = await fetch(`${baseUrl}/api/developer/license/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, empresa: 'Mi Empresa' }),
    });
    assert.equal(unconfiguredLicense.status, 503);

    const unconfiguredZip = await fetch(`${baseUrl}/api/download-zip`, {
      headers: { 'x-admin-token': 'any' },
    });
    assert.equal(unconfiguredZip.status, 503);

    // Configure ephemeral test-only secrets cleanly for signing verification
    const ephemeralPair = nacl.sign.keyPair();
    const ephemeralSecretHex = Buffer.from(ephemeralPair.secretKey).toString('hex');
    const ephemeralPublicHex = Buffer.from(ephemeralPair.publicKey).toString('hex');
    const ephemeralDevToken = 'EPHEMERAL_TEST_DEV_TOKEN_2026';

    process.env.ADMIN_DEV_KEY = ephemeralDevToken;
    process.env.DEV_LICENSE_ED25519_SECRET_KEY = ephemeralSecretHex;

    try {
      const badLicRes = await fetch(`${baseUrl}/api/developer/license/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': 'CLAVE_INCORRECTA',
        },
        body: JSON.stringify({ machineId, empresa: 'Mi Empresa', devSecret: 'CLAVE_INCORRECTA' }),
      });
      assert.equal(badLicRes.status, 403);

      const okLicRes = await fetch(`${baseUrl}/api/developer/license/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': ephemeralDevToken,
        },
        body: JSON.stringify({ machineId, empresa: 'Mi Empresa', devSecret: ephemeralDevToken }),
      });
      assert.equal(okLicRes.status, 200);
      const licJson = (await okLicRes.json()) as { success: boolean; key: string };
      assert.equal(licJson.success, true);
      assert.ok(licJson.key.startsWith('ED2-'));

      const verified = validateActivationKey(licJson.key, machineId, ephemeralPublicHex);
      assert.equal(verified.isValid, true);
      assert.equal(verified.algorithm, 'Ed25519 Asymmetric');

      // Trial endpoint also issues valid ED2- key signed with configured Ed25519 secret
      const trialRes = await fetch(`${baseUrl}/api/developer/license/trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, empresa: 'Tienda Demo' }),
      });
      assert.equal(trialRes.status, 200);
      const trialJson = (await trialRes.json()) as { success: boolean; key: string };
      assert.ok(trialJson.key.startsWith('ED2-'));
      const trialVerified = validateActivationKey(trialJson.key, machineId, ephemeralPublicHex);
      assert.equal(trialVerified.isValid, true);
      assert.equal(trialVerified.license?.tipo, 'demo');

      // Public storefront order validation & creation remains active
      const badOrder = await fetch(`${baseUrl}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteNombre: 'A', detalles: [] }),
      });
      assert.equal(badOrder.status, 400);

      const okOrder = await fetch(`${baseUrl}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'ped_test_http_1',
          clienteNombre: 'María Cliente',
          clienteTelefono: '0414-0001122',
          detalles: [{ productoId: 1, cantidad: 2, precioUnitario: 5 }],
          total: 10,
        }),
      });
      assert.equal(okOrder.status, 200);
    } finally {
      delete process.env.ADMIN_DEV_KEY;
      delete process.env.DEV_LICENSE_ED25519_SECRET_KEY;
    }
  });

  test('fetchApi recupera automáticamente peticiones POST cuando un proxy redirige el primer intento como GET (404)', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    (globalThis as any).fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.method, 'POST');
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Ruta de API no encontrada: GET /api/developer/license/generate',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ success: true, key: 'ED2-OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const res = await fetchApi('/api/developer/license/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      assert.equal(res.status, 200);
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
