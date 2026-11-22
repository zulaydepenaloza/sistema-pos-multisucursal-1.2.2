import { Usuario, ModuloPermisos } from '../types';

const PIN_SALT = 'OMNIPOS_ENTERPRISE_PIN_SALT_2026';

export const ADMIN_MODULE_KEYS: (keyof ModuloPermisos)[] = [
  'dashboard',
  'ventas',
  'pedidos_web',
  'inventario',
  'compras',
  'clientes',
  'proveedores',
  'cxc',
  'cxp',
  'reportes',
  'configuracion',
];

export const FULL_ADMIN_PERMISSIONS: ModuloPermisos = {
  dashboard: true,
  ventas: true,
  pedidos_web: true,
  inventario: true,
  compras: true,
  clientes: true,
  proveedores: true,
  cxc: true,
  cxp: true,
  reportes: true,
  configuracion: true,
};

/**
 * Checks whether a user has the 'admin' role AND all 11 system module privileges enabled.
 */
export function isFullPrivilegeAdmin(user?: Usuario | null): boolean {
  if (!user || user.rol !== 'admin') return false;
  if (!user.permisos) return false;
  return ADMIN_MODULE_KEYS.every((key) => Boolean(user.permisos?.[key]));
}

/**
 * Counts how many OTHER users (excluding `excludeUserId`) hold full administrator privileges.
 */
export function countOtherFullPrivilegeAdmins(usuarios: Usuario[], excludeUserId: number): number {
  return usuarios.filter((u) => u.id !== excludeUserId && isFullPrivilegeAdmin(u)).length;
}

/**
 * Ensures at least one existing administrator holds full 11-module permissions.
 * Security hardening: NEVER promotes a non-admin user (e.g. cajero) to admin.
 */
export function ensureMinimumFullAdmin(usuarios: Usuario[]): {
  users: Usuario[];
  repaired: boolean;
  repairedUserId?: number;
  lockedOutNoAdmin?: boolean;
} {
  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return { users: [], repaired: false, lockedOutNoAdmin: true };
  }

  if (usuarios.some((u) => isFullPrivilegeAdmin(u))) {
    return { users: usuarios, repaired: false, lockedOutNoAdmin: false };
  }

  const existingAdmin = usuarios.find((u) => u.rol === 'admin');
  if (!existingAdmin) {
    return { users: usuarios, repaired: false, lockedOutNoAdmin: true };
  }

  const repairedUsers = usuarios.map((u) =>
    u.id === existingAdmin.id
      ? {
          ...u,
          sucursal_id: null,
          permisos: { ...FULL_ADMIN_PERMISSIONS },
        }
      : u
  );

  return {
    users: repairedUsers,
    repaired: true,
    repairedUserId: existingAdmin.id,
    lockedOutNoAdmin: false,
  };
}

/**
 * Computes SHA-256 hash of a PIN using standard Web Crypto API
 */
export async function hashPin(pin: string): Promise<string> {
  const cleanPin = pin.trim();
  const data = new TextEncoder().encode(`${cleanPin}::${PIN_SALT}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies entered PIN against stored PIN or stored hash.
 * Supports transparent backward-compatibility with existing plain PINs
 * and upgrades them seamlessly.
 */
export async function verifyUserPin(
  enteredPin: string,
  storedPinOrHash: string,
  _userOrRole?: Usuario | string
): Promise<boolean> {
  if (!enteredPin || !storedPinOrHash) return false;
  const cleanEntered = enteredPin.trim();
  const cleanStored = storedPinOrHash.trim();

  if (!cleanEntered || !cleanStored || cleanStored === '••••') {
    return false;
  }

  // 1. Direct match (legacy plain text before storage migration)
  if (!isHashedPin(cleanStored) && cleanEntered === cleanStored) {
    return true;
  }

  // 2. Hash match (SHA-256)
  const computedHash = await hashPin(cleanEntered);
  return computedHash.toLowerCase() === cleanStored.toLowerCase();
}

/**
 * Checks whether a stored PIN value is already a 64-character SHA-256 hex digest.
 */
export function isHashedPin(pin?: string | null): boolean {
  return Boolean(pin && /^[a-f0-9]{64}$/i.test(pin.trim()));
}

/**
 * Sanitizes user object for active session state (removes PIN to prevent in-memory & console exposure)
 */
export function sanitizeUserForSession(user: Usuario | null): Usuario | null {
  if (!user) return null;
  return {
    ...user,
    pin: '••••', // Masked, never exposed in cleartext
  };
}

/**
 * Sanitizes user array before writing to localStorage / Firestore.
 * Converts cleartext PINs to secure SHA-256 hashes so storage never contains plain PINs.
 */
export async function sanitizeUsersForStorage(usuarios: Usuario[]): Promise<Usuario[]> {
  const result: Usuario[] = [];
  for (const u of usuarios) {
    let pinHash = (u.pin || '').trim();
    // Only hash if PIN is non-empty, not already SHA-256, and not the masked session placeholder
    if (pinHash && pinHash !== '••••' && !isHashedPin(pinHash)) {
      pinHash = await hashPin(pinHash);
    }
    result.push({
      ...u,
      pin: pinHash,
    });
  }
  return result;
}
