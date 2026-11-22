import { Usuario } from '../types';
import { getMachineFingerprint } from './licensing';
import { fetchApi } from './apiFetch';

const SESSION_TOKEN_KEY = 'pos_api_session_token_v1';
const SESSION_META_KEY = 'pos_api_session_meta_v1';

interface CachedSessionMeta {
  userId: number;
  rol: string;
  expiresAt: number;
}

let inMemoryToken: string | null = null;
let inflightRequest: Promise<string | null> | null = null;

export function getCachedPosSessionToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null;
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const metaRaw = sessionStorage.getItem(SESSION_META_KEY);
    if (!token || !metaRaw) return null;
    const meta = JSON.parse(metaRaw) as CachedSessionMeta;
    if (!meta || typeof meta.expiresAt !== 'number' || meta.expiresAt <= Date.now() + 30_000) {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_META_KEY);
      return null;
    }
    inMemoryToken = token;
    return token;
  } catch {
    return null;
  }
}

export function clearPosSessionToken(): void {
  inMemoryToken = null;
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_META_KEY);
  } catch {}
}

export async function ensurePosSessionToken(
  user: Usuario | null,
  options?: { forceRefresh?: boolean; pin?: string }
): Promise<string | null> {
  if (!user || typeof window === 'undefined') return null;

  if (!options?.forceRefresh && !options?.pin) {
    const existing = getCachedPosSessionToken();
    try {
      const metaRaw = sessionStorage.getItem(SESSION_META_KEY);
      if (existing && metaRaw) {
        const meta = JSON.parse(metaRaw) as CachedSessionMeta;
        if (meta.userId === user.id && meta.rol === user.rol && meta.expiresAt > Date.now() + 60_000) {
          return existing;
        }
      }
    } catch {}
  }

  if (inflightRequest && !options?.forceRefresh && !options?.pin) {
    return inflightRequest;
  }

  const run = async (): Promise<string | null> => {
    try {
      const resp = await fetchApi('/api/auth/pos-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          rol: user.rol,
          machineId: getMachineFingerprint(),
          ...(options?.pin ? { pin: options.pin } : {}),
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (data?.success && typeof data.token === 'string') {
        inMemoryToken = data.token;
        try {
          sessionStorage.setItem(SESSION_TOKEN_KEY, data.token);
          sessionStorage.setItem(
            SESSION_META_KEY,
            JSON.stringify({
              userId: user.id,
              rol: user.rol,
              expiresAt: Number(data.expiresAt) || Date.now() + 11 * 3600 * 1000,
            } satisfies CachedSessionMeta)
          );
        } catch {}
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflightRequest = null;
    }
  };

  inflightRequest = run();
  return inflightRequest;
}

export function buildPosAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getCachedPosSessionToken();
  return {
    ...(extra || {}),
    ...(token ? { 'x-pos-session': token } : {}),
  };
}
