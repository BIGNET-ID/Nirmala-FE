/**
 * OpenWeather map-tile proxy.
 *
 * The browser requests same-origin /api/owm/{layer}/{z}/{x}/{y}; this handler
 * fetches the OpenWeather tile with the SERVER-ONLY key appended, so the key is
 * never exposed in the browser (network tab / bundle). Tiles are cached.
 *
 * More specific than the /api/[...path] backend proxy, so Next matches this first.
 * Env: OPENWEATHER_API_KEY (server-only).
 */

export const dynamic = 'force-dynamic';

const KEY = process.env.OPENWEATHER_API_KEY || '';
const LAYERS = new Set(['precipitation_new', 'clouds_new', 'wind_new', 'temp_new', 'pressure_new']);

export async function GET(request, ctx) {
  const { tile = [] } = await ctx.params;
  const [layer, z, x, yRaw] = tile;
  const y = String(yRaw || '').replace(/\.png$/i, '');

  if (!KEY) return new Response(null, { status: 204 }); // no key yet → blank tile
  if (!LAYERS.has(layer)) return new Response('unknown layer', { status: 400 });

  const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${KEY}`;
  try {
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=600' },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
