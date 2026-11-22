/**
 * Wrapper around fetch() for backend API calls.
 * Ensures same-origin credentials are always attached and recovers cleanly if an
 * upstream auth/session proxy issues a 302 redirect during a non-GET request
 * (which browsers convert into GET on the redirected hop, hitting 404 on POST routes).
 */
export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const opts: RequestInit = {
    credentials: 'same-origin',
    ...init,
  };

  let resp = await fetch(input, opts);
  const method = (opts.method || 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD' && (resp.redirected || resp.status === 404)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let shouldRetry = resp.redirected && resp.status === 404;

      if (!shouldRetry && resp.status === 404) {
        try {
          const cloned = resp.clone();
          const ct = cloned.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const json = await cloned.json();
            if (typeof json?.error === 'string' && json.error.includes('Ruta de API no encontrada: GET ')) {
              shouldRetry = true;
            }
          }
        } catch {
          // Ignore clone/json parse error
        }
      }

      if (!shouldRetry) break;
      resp = await fetch(input, opts);
    }
  }

  return resp;
}
