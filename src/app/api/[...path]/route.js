/**
 * Transparent proxy for the Rainvision/Nirmala backend.
 *
 * Why: the browser must not call the private backend directly — that hits CORS
 * and would expose any auth token. Instead the client calls same-origin
 * `/api/*` (see lib/axios baseURL ''), this server-side handler forwards to the
 * real backend, injecting the token from a SERVER-ONLY env var so it never
 * reaches the browser bundle.
 *
 * Request `/api/sensors` -> params.path = ['sensors'] -> `${BACKEND}/api/sensors`.
 * On upstream failure returns 502 so the client falls back to the /fixtures copy.
 *
 * Env (server-only, NOT NEXT_PUBLIC):
 *   NIRMALA_BACKEND_URL  base URL of the backend (default: the known private IP)
 *   NIRMALA_API_TOKEN    bearer token, if the backend requires one (optional)
 */

export const dynamic = 'force-dynamic';

const BACKEND = process.env.NIRMALA_BACKEND_URL || 'http://172.18.188.154:8000';
const TOKEN = process.env.NIRMALA_API_TOKEN || '';
const TIMEOUT_MS = 5000; // < client axios timeout (6s) so the client gets a clean 502 -> fixture fast

export async function GET(request, ctx) {
  const { path = [] } = await ctx.params;
  const segments = Array.isArray(path) ? path.join('/') : String(path);
  const search = new URL(request.url).search;
  const target = `${BACKEND}/api/${segments}${search}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

    const upstream = await fetch(target, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    return Response.json(
      { error: 'upstream_unreachable', message: String(err?.message || err) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
