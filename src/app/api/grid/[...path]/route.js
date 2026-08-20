/**
 * Himawari satellite-grid proxy.
 *
 * The browser requests same-origin /api/grid or /api/grid/{frame}.png; this
 * handler forwards to the (public, no-token-required) Nirmala grid API.
 * Frame files are PNG binaries — the generic /api/[...path] catch-all reads
 * every upstream body as .text(), which corrupts binary PNG bytes, so this
 * route is deliberately more specific and matched first by Next.
 *
 * GET /api/grid            -> JSON manifest { region, bounds, frames[], ... }
 * GET /api/grid/{frame}.png -> PNG passthrough
 */

export const dynamic = 'force-dynamic';

const BACKEND = process.env.NIRMALA_BACKEND_URL || 'https://c4c-nirmala.api.bignet.host';

export async function GET(request, ctx) {
  const { path = [] } = await ctx.params;
  const upstreamPath = path.length ? `/api/grid/${path.join('/')}` : '/api/grid';

  try {
    const upstream = await fetch(`${BACKEND}${upstreamPath}`, { cache: 'no-store' });
    if (!upstream.ok) return new Response(null, { status: upstream.status });

    if (path.length === 0) {
      const json = await upstream.json();
      return Response.json(json, { headers: { 'cache-control': 'no-store' } });
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'image/png',
        'cache-control': upstream.headers.get('cache-control') || 'public, max-age=14400',
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
