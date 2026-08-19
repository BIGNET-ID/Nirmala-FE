/**
 * Transparent proxy for the official Nirmala backend (c4c-nirmala.api.bignet.host).
 *
 * The backend is public and currently requires no auth, but the client still
 * calls same-origin `/api/*` (see lib/axios baseURL '') and this server-side
 * handler forwards to the real backend — keeping CORS out of the picture and
 * leaving room to inject a token later without touching client code.
 *
 * Request `/api/sensors` -> params.path = ['sensors'] -> `${BACKEND}/api/sensors`.
 * On upstream failure returns 502 so the client falls back to the /fixtures copy.
 *
 * Env (server-only, NOT NEXT_PUBLIC):
 *   NIRMALA_BACKEND_URL  base URL of the backend (default: the official public host)
 *   NIRMALA_API_TOKEN    bearer token, if the backend ever requires one (optional)
 */

export const dynamic = 'force-dynamic';

const BACKEND = process.env.NIRMALA_BACKEND_URL || 'https://c4c-nirmala.api.bignet.host';
const TOKEN = process.env.NIRMALA_API_TOKEN || '';
// /api/sensors (4.500+ stations, ~1.2MB) measured ~8.7s against the live
// backend, well above the PRD's claimed ~300ms — keep this comfortably above
// that, and below the client axios timeout (20s, see lib/axios.js) so the
// client always gets a clean 502 -> fixture fallback rather than aborting first.
const TIMEOUT_MS = 15000;

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
