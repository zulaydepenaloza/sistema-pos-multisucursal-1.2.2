import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';

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
import {
  findMatchingProveedor,
  deduplicateProveedoresList,
  validateVenezuelanFiscalId,
} from '../src/lib/validations';
import { Usuario } from '../src/types';

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

  test('ensureMinimumFullAdmin repara automáticamente si no queda ningún administrador con los 11 permisos', () => {
    const users: Usuario[] = [
      {
        id: 1,
        username: 'gerente_general',
        nombre_completo: 'Gerente General',
        pin: 'abcd'.repeat(16),
        rol: 'cajero',
        sucursal_id: 1,
        cargo: 'Operador',
        permisos: { ...FULL_ADMIN_PERMISSIONS, configuracion: false },
      },
    ];

    const res = ensureMinimumFullAdmin(users);
    assert.equal(res.repaired, true);
    assert.equal(res.users[0].rol, 'admin');
    assert.equal(res.users[0].permisos?.configuracion, true);
  });
});

describe('Licenciamiento Asimétrico Ed25519 y Bloqueo de Emisión Offline', () => {
  test('generateOfflineAuthorizedLicense rechaza la emisión comercial offline aunque pasen clave maestra', () => {
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
      'OmniPosDev2026MasterKey'
    );
    assert.equal(res.success, false);
    assert.equal(res.key, undefined);
  });

  test('createTrialLicenseForCurrentMachine genera clave DEMO- válida y rechaza alteración de fechas o formato LIC-', () => {
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

describe('Respaldos JSON, Cola Offline Idempotente y Deduplicación de Proveedores', () => {
  test('validateAndParseBackupJson preserva stock_minimo individual y rechaza JSON corrupto', () => {
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
        inventario: [{ producto_id: 1, sucursal_id: 1, stock: 30 }],
        ventas: [],
        usuarios: [],
      },
    });

    const parsed = validateAndParseBackupJson(payloadJson);
    assert.equal(parsed.isValid, true);
    assert.equal(parsed.payload?.datos.productos.length, 1);
    assert.equal(parsed.payload?.datos.productos[0].stock_minimo, 12);
    assert.equal(parsed.payload?.datos.inventario.length, 1);
  });

  test('syncQueue encola idempotente por dedupeKey y reintenta manteniendo fallidos', async () => {
    clearPendingSyncOps();
    enqueueSyncOp('sync_state', 'sync_state:latest', { step: 1 });
    enqueueSyncOp('sync_state', 'sync_state:latest', { step: 2 });
    enqueueSyncOp('pedido_create', 'pedido_create:ped_99', { id: 'ped_99' });

    const opsBefore = getPendingSyncOps();
    assert.equal(opsBefore.length, 2);
    assert.equal(opsBefore[0].payload.step, 2);

    const firstFlush = await flushSyncQueue(async (op) => {
      return op.type === 'pedido_create'; // sync_state fails once, pedido_create succeeds
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

describe('Seguridad Backend HTTP, CORS, Autorización y Licenciamiento Ed25519', () => {
  let server: http.Server;
  let baseUrl = '';
  const dbPath = path.join(process.cwd(), 'data', 'server_db.json');
  let originalDbContent: string | null = null;

  before(async () => {
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

  test('Exige sesión autenticada y roles en endpoints operativos y bloquea /api/download-zip por query string', async () => {
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

    const queryTokenZip = await fetch(
      `${baseUrl}/api/download-zip?token=OmniPosDev2026MasterKey`
    );
    assert.equal(queryTokenZip.status, 403);

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
  });

  test('Valida PIN hash de administrador en factory-reset y sanitiza campos sensibles en /api/sync/state', async () => {
    const adminSessionRes = await fetch(`${baseUrl}/api/auth/pos-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1, rol: 'admin', machineId: 'POS-ADMIN-0001' }),
    });
    const adminSession = (await adminSessionRes.json()) as { token: string };
    const realAdminPinHash = await hashPin('4917');

    const syncRes = await fetch(`${baseUrl}/api/sync/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': adminSession.token,
      },
      body: JSON.stringify({
        empresaConfig: {
          nombreEmpresa: 'Empresa Test Seguro',
          tasaCambio: 50,
          fiscalUpdatedAt: new Date().toISOString(),
          apiKey: 'SHOULD_BE_STRIPPED',
          pin: 'SHOULD_BE_STRIPPED',
        },
        adminPinHashes: [{ id: 1, pinHash: realAdminPinHash }],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as { success: boolean };
    assert.equal(syncJson.success, true);

    const getStateRes = await fetch(`${baseUrl}/api/sync/state`);
    const getStateJson = (await getStateRes.json()) as any;
    assert.equal(getStateJson.empresaConfig.nombreEmpresa, 'Empresa Test Seguro');
    assert.equal(getStateJson.empresaConfig.apiKey, undefined);
    assert.equal(getStateJson.empresaConfig.pin, undefined);
    assert.equal(getStateJson.adminPinHashes, undefined);

    // Wrong PIN must be rejected with 403 even with valid admin session token
    const badPinReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': adminSession.token,
      },
      body: JSON.stringify({
        confirmWord: 'REINICIAR',
        adminPin: '9999',
      }),
    });
    assert.equal(badPinReset.status, 403);

    // Genuine admin PIN succeeds cleanly
    const okPinReset = await fetch(`${baseUrl}/api/system/factory-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-session': adminSession.token,
      },
      body: JSON.stringify({
        confirmWord: 'REINICIAR',
        adminPin: '4917',
      }),
    });
    assert.equal(okPinReset.status, 200);
  });

  test('Emite licencia Ed25519 válida con token de desarrollador correcto y rechaza token inválido; tienda pública conserva creación de pedidos', async () => {
    const machineId = 'POS-1234-5678-ABCD-EF01';
    const badLicRes = await fetch(`${baseUrl}/api/developer/license/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'CLAVE_INCORRECTA',
      },
      body: JSON.stringify({ machineId, empresa: 'Mi Empresa', devSecret: 'CLAVE_INCORRECTA' }),
    });
    assert.equal(badLicRes.status, 403);

    const validSecret = process.env.ADMIN_DEV_KEY || 'OmniPosDev2026MasterKey';
    const okLicRes = await fetch(`${baseUrl}/api/developer/license/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': validSecret,
      },
      body: JSON.stringify({ machineId, empresa: 'Mi Empresa', devSecret: validSecret }),
    });
    assert.equal(okLicRes.status, 200);
    const licJson = (await okLicRes.json()) as { success: boolean; key: string };
    assert.equal(licJson.success, true);
    assert.ok(licJson.key.startsWith('ED2-'));

    const verified = validateActivationKey(licJson.key, machineId);
    assert.equal(verified.isValid, true);
    assert.equal(verified.algorithm, 'Ed25519 Asymmetric');

    // Public storefront order validation & creation
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
  });
});
