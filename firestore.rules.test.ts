/**
 * Payload-First Security Spec & Dirty Dozen Assertions for firestore.rules
 * Run static rule validation with: npx eslint firestore.rules
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid?: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated read/list on /ventas',
    collectionPath: '/ventas',
    operation: 'list',
    auth: null,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unauthenticated read/list on /usuarios (PIN hashes)',
    collectionPath: '/usuarios',
    operation: 'list',
    auth: null,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self privilege escalation on /admins/{uid}',
    collectionPath: '/admins/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { uid: 'attacker_uid', email: 'attacker@example.com', role: 'admin', createdAt: '2026-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified email spoofing bootstrapped admin email',
    collectionPath: '/empresa_config/main',
    operation: 'update',
    auth: { uid: 'spoof_uid', email: 'diomrondon@gmail.com', email_verified: false },
    payload: { nombreEmpresa: 'Hijacked', tasaCambio: 99 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow ghost field injection on /productos',
    collectionPath: '/productos/101',
    operation: 'create',
    auth: { uid: 'staff_uid', email: 'staff@negocio.com', email_verified: true },
    payload: { id: 101, nombre: 'Harina', precio: 2.5, ghostBypass: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'ID poisoning > 128 chars on /productos',
    collectionPath: `/productos/${'A'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: { id: 102, nombre: 'Arroz', precio: 2.0 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable audit log tampering attempt',
    collectionPath: '/auditoria/aud_1',
    operation: 'delete',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'POS invoice mutation attempt on /ventas',
    collectionPath: '/ventas/vta_1_1',
    operation: 'update',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: { total: 0.01 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Pre-reset stale fiscal data resurrection on /empresa_config/main',
    collectionPath: '/empresa_config/main',
    operation: 'update',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: {
      nombreEmpresa: 'Empresa Vieja',
      tasaCambio: 50,
      factoryResetAt: '2026-05-02T00:00:00.000Z',
      fiscalUpdatedAt: '2026-05-01T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Negative price value poisoning on /productos',
    collectionPath: '/productos/103',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: { id: 103, nombre: 'Aceite', precio: -5 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unbounded array injection on /pedidos_online',
    collectionPath: '/pedidos_online/ped_overflow',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: {
      id: 'ped_overflow',
      fecha: '2026-05-01T00:00:00.000Z',
      clienteNombre: 'Cliente',
      clienteTelefono: '04140000000',
      total: 10,
      estado: 'pendiente',
      detalles: new Array(250).fill({ productoId: 1, cantidad: 1 }),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Undocumented collection write attempt',
    collectionPath: '/hidden_secrets/doc1',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'diomrondon@gmail.com', email_verified: true },
    payload: { secret: '1234' },
    expectedResult: 'PERMISSION_DENIED',
  },
];

// Structural verification when executed standalone or via test runner
export function verifyHardenedRulesFile(rulesPath = path.join(process.cwd(), 'firestore.rules')): void {
  const content = fs.readFileSync(rulesPath, 'utf-8');
  assert.ok(content.includes("rules_version = '2';"), 'Debe declarar rules_version = 2');
  assert.ok(content.includes('match /{document=**} {\n      allow read, write: if false;'), 'Debe tener Master Gate default-deny al inicio');
  assert.ok(content.includes('email_verified == true'), 'Debe requerir email_verified == true');
  assert.ok(!content.includes('allow read: if true'), 'No debe existir allow read: if true');
  assert.ok(!content.includes('allow list: if true'), 'No debe existir allow list: if true');
  assert.equal(DIRTY_DOZEN_PAYLOADS.length, 12, 'Debe mantener los 12 payloads del Dirty Dozen');
}
