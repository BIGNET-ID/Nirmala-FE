/**
 * Wind vector field sampler for the Ventusky-style particle layer.
 *
 * OpenWeather map tiles are raster (no direction) — you can't animate arrows
 * from them. So we sample the point API (data/2.5/weather → wind.speed + wind.deg)
 * on a coarse grid over Indonesia, convert to u/v components, and return a
 * compact field the client advects particles through.
 *
 * Key stays server-side. Result cached in-memory (TTL) so we don't re-sample the
 * grid on every request (respects the free-tier rate limit).
 *
 * Meteorological `deg` = direction the wind comes FROM (clockwise from north):
 *   u (east)  = -speed * sin(deg)
 *   v (north) = -speed * cos(deg)
 * Field index is row-major from the south-west corner: idx = j*nx + i.
 */

export const dynamic = 'force-dynamic';

const KEY = process.env.OPENWEATHER_API_KEY || '';
// Wider SE-Asia box so wind isn't limited to Indonesia (covers Philippines/PNG
// where lightning & storms sit). Grid kept at 9x6 = 54 points (< 60/min limit).
const BOUNDS = { north: 22, south: -13, east: 145, west: 92 };
const NX = 9;
const NY = 6;
const TTL_MS = 20 * 60 * 1000;

let cache = null; // { t, data }

export async function GET() {
  if (!KEY) return new Response(JSON.stringify({ error: 'no_key' }), { status: 204 });
  if (cache && Date.now() - cache.t < TTL_MS) {
    return Response.json(cache.data, { headers: { 'x-cache': 'hit' } });
  }

  const pts = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const lat = BOUNDS.south + (BOUNDS.north - BOUNDS.south) * (j / (NY - 1));
      const lng = BOUNDS.west + (BOUNDS.east - BOUNDS.west) * (i / (NX - 1));
      pts.push([lat, lng]);
    }
  }

  const cells = await Promise.all(pts.map(async ([lat, lng]) => {
    try {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${KEY}`,
        { cache: 'no-store' },
      );
      if (!r.ok) return { u: 0, v: 0, speed: 0 };
      const j = await r.json();
      const speed = j?.wind?.speed || 0;
      const deg = j?.wind?.deg || 0;
      const rad = (deg * Math.PI) / 180;
      return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad), speed };
    } catch {
      return { u: 0, v: 0, speed: 0 };
    }
  }));

  const data = {
    bounds: BOUNDS,
    nx: NX,
    ny: NY,
    u: cells.map((c) => +c.u.toFixed(3)),
    v: cells.map((c) => +c.v.toFixed(3)),
    speed: cells.map((c) => +c.speed.toFixed(2)),
  };
  cache = { t: Date.now(), data };
  return Response.json(data, { headers: { 'cache-control': 'public, max-age=1200', 'x-cache': 'miss' } });
}
