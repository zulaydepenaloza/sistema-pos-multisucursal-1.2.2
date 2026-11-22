export type SyncOpType =
  | 'sync_state'
  | 'pedido_create'
  | 'pedido_patch'
  | 'firestore_empresa'
  | 'firestore_tienda'
  | 'firestore_product'
  | 'firestore_delete_product'
  | 'firestore_inventario'
  | 'firestore_sucursales'
  | 'firestore_usuarios';

export interface PendingSyncOp {
  opId: string;
  type: SyncOpType;
  dedupeKey: string;
  payload: any;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

const SYNC_QUEUE_STORAGE_KEY = 'pos_pending_sync_ops_v1';
const MAX_QUEUE_SIZE = 250;

export function getPendingSyncOps(): PendingSyncOp[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingSyncOps(ops: PendingSyncOp[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed = ops.slice(-MAX_QUEUE_SIZE);
    localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors safely
  }
}

export function getPendingSyncCount(): number {
  return getPendingSyncOps().length;
}

/**
 * Enqueues an idempotent sync operation cleanly, coalescing updates that share the same dedupeKey.
 */
export function enqueueSyncOp(
  type: SyncOpType,
  dedupeKey: string,
  payload: any,
  lastError?: string
): PendingSyncOp {
  const existing = getPendingSyncOps();
  const op: PendingSyncOp = {
    opId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    dedupeKey,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...(lastError ? { lastError } : {}),
  };

  const filtered = existing.filter((item) => item.dedupeKey !== dedupeKey);
  filtered.push(op);
  savePendingSyncOps(filtered);
  return op;
}

export function removeSyncOp(opId: string): void {
  const existing = getPendingSyncOps();
  const next = existing.filter((item) => item.opId !== opId);
  savePendingSyncOps(next);
}

export function clearPendingSyncOps(): void {
  savePendingSyncOps([]);
}

/**
 * Flushes pending operations sequentially using the caller-provided executor.
 * Confirmed ops are removed; failed ops stay persisted for automatic retry on reconnect.
 */
export async function flushSyncQueue(
  executor: (op: PendingSyncOp) => Promise<boolean>
): Promise<{ processed: number; succeeded: number; remaining: number }> {
  const queue = getPendingSyncOps();
  if (queue.length === 0) {
    return { processed: 0, succeeded: 0, remaining: 0 };
  }

  let succeeded = 0;
  const remainingOps: PendingSyncOp[] = [];

  for (const op of queue) {
    try {
      const ok = await executor(op);
      if (ok) {
        succeeded++;
      } else {
        remainingOps.push({
          ...op,
          attempts: op.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: op.lastError || 'Confirmación pendiente del servidor/nube',
        });
      }
    } catch (err: any) {
      remainingOps.push({
        ...op,
        attempts: op.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: err?.message ? String(err.message).slice(0, 150) : 'Error de conexión',
      });
    }
  }

  savePendingSyncOps(remainingOps);
  return {
    processed: queue.length,
    succeeded,
    remaining: remainingOps.length,
  };
}
