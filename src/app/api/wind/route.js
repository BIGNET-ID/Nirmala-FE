/**
 * Wind vector field sampler for the Ventusky-style particle layer.
 *
 * OpenWeather map tiles are raster (no direction) — you can't animate arrows
 * from them. So we sample the point API (data/2.5/weather → wind.speed + wind.deg)
 * on a coarse grid, convert to u/v components, and return a compact field
 * the client advects particles through.
 *
 * Two modes, both sampled the same way, different bbox/refresh cadence:
 *  - Viewport (default): bbox comes from the map's current view (see
 *    useWindField.js), so the grid is always over what the user is actually
 *    looking at — far denser per degree than a fixed world box could be.
 *  - `?mode=ambient`: a fixed, very sparse, near-global box refreshed
 *    rarely (synoptic wind patterns don't change minute to minute). Exists
 *    purely so *something* is moving even where the user hasn't looked yet
 *    — WindParticleLayer falls back to this field wherever the viewport
 *    field doesn't cover. See docs/superpowers/specs (batch UI fixes,
 *    2026-08-27) for why we didn't switch to a real gridded wind product
 *    (GFS etc.) instead — this app runs on Cloudflare Workers, which can't
 *    parse GRIB2 files, and would need a separate external pre-processing
 *    pipeline to do it properly.
 *
 * Key stays server-side. Results cached in-memory (TTL) so we don't
 * re-sample the grid on every request (respects the free-tier rate limit).
 *
 * Meteorological `deg` = direction the wind comes FROM (clockwise from north):
 *   u (east)  = -speed * sin(deg)
 *   v (north) = -speed * cos(deg)
 * Field index is row-major from the south-west corner: idx = j*nx + i.
 */

export const dynamic = 'force-dynamic';

const KEY = process.env.OPENWEATHER_API_KEY || '';

const GRID_NX = 9;
const GRID_NY = 6; // 9x6 = 54 points, comfortably under OpenWeather's 60/min free-tier limit

// Ambient (Tier B): near-global, very sparse, refreshed rarely.
const AMBIENT_BOUNDS = { north: 75, south: -60, east: 180, west: -180 };
const AMBIENT_NX = 8;
const AMBIENT_NY = 5; // 40 points — stays under both the OpenWeather limit and the
                       // Cloudflare Workers subrequest ceiling alongside a viewport batch.
const AMBIENT_TTL_MS = 3 * 60 * 60 * 1000; // 3h — global synoptic patterns barely move faster than this

const VIEWPORT_TTL_MS = 20 * 60 * 1000;
// Below this span the grid stops being meaningfully denser (OpenWeather's
// point data isn't hyper-local anyway) — pad the requested bbox out to it,
// centred on the viewport, so a deep zoom-in doesn't waste 54 near-duplicate points.
const MIN_SPAN_DEG = 4;
// Above this span the viewport is already "world-ish" — the ambient field
// covers it just as well, so skip the redundant near-duplicate fetch.
const MAX_VIEWPORT_LAT_SPAN = 60;
const MAX_VIEWPORT_LON_SPAN = 90;

// Small LRU-ish cache: viewport bboxes are rounded to the nearest 2° so
// minor pan/zoom re-uses an existing entry instead of re-fetching, capped
// so it can't grow unbounded across many distinct viewports.
const MAX_CACHE_ENTRIES = 20;
const viewportCache = new Map(); // key -> { t, data }
let ambientCache = null; // { t, data }

// Cheap shared rate-limit safety net: refuse to start a new OpenWeather
// batch (54 or 40 parallel fetches) too soon after the last one, in case
// several users pan to different areas within the same second — serves
// whatever's cached (even if stale) rather than piling up fetches.
const MIN_BATCH_GAP_MS = 3000;
let lastBatchAt = 0;

function roundBounds(b) {
  const r = (n) => Math.round(n / 2) * 2;
  return { north: r(b.north), south: r(b.south), east: r(b.east), west: r(b.west) };
}

function cacheKey(b) {
  return `${b.north},${b.south},${b.east},${b.west}`;
}

// OpenWeather's Current Weather Data API nests hourly rain volume (mm) under
// `rain['1h']` when it's raining at that point; `rain['3h']` (3-hour total)
// is a fallback some responses use instead — divided by 3 for an
// approximate hourly rate. No `rain` key at all means "not raining there".
export function extractRainMm(json) {
  const r = json?.rain;
  if (!r) return 0;
  if (typeof r['1h'] === 'number') return r['1h'];
  if (typeof r['3h'] === 'number') return r['3h'] / 3;
  return 0;
}

async function sampleGrid(bounds, nx, ny) {
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const lat = bounds.south + (bounds.north - bounds.south) * (ny === 1 ? 0 : j / (ny - 1));
      const lng = bounds.west + (bounds.east - bounds.west) * (nx === 1 ? 0 : i / (nx - 1));
      pts.push([lat, lng]);
    }
  }

  const cells = await Promise.all(pts.map(async ([lat, lng]) => {
    try {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${KEY}`,
        { cache: 'no-store' },
      );
      if (!r.ok) return { u: 0, v: 0, speed: 0, rain: 0 };
      const j = await r.json();
      const speed = j?.wind?.speed || 0;
      const deg = j?.wind?.deg || 0;
      const rad = (deg * Math.PI) / 180;
      return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad), speed, rain: extractRainMm(j) };
    } catch {
      return { u: 0, v: 0, speed: 0, rain: 0 };
    }
  }));

  return {
    bounds,
    nx,
    ny,
    u: cells.map((c) => +c.u.toFixed(3)),
    v: cells.map((c) => +c.v.toFixed(3)),
    speed: cells.map((c) => +c.speed.toFixed(2)),
    rain: cells.map((c) => +c.rain.toFixed(2)),
  };
}

function evictOldest() {
  if (viewportCache.size < MAX_CACHE_ENTRIES) return;
  const oldestKey = [...viewportCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]?.[0];
  if (oldestKey) viewportCache.delete(oldestKey);
}

export async function GET(request) {
  if (!KEY) return Response.json({ error: 'no_key' }, { status: 503 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get('mode') === 'ambient') {
    if (ambientCache && Date.now() - ambientCache.t < AMBIENT_TTL_MS) {
      return Response.json(ambientCache.data, { headers: { 'x-cache': 'hit' } });
    }
    if (Date.now() - lastBatchAt < MIN_BATCH_GAP_MS && ambientCache) {
      return Response.json(ambientCache.data, { headers: { 'x-cache': 'stale-throttled' } });
    }
    lastBatchAt = Date.now();
    const data = await sampleGrid(AMBIENT_BOUNDS, AMBIENT_NX, AMBIENT_NY);
    ambientCache = { t: Date.now(), data };
    return Response.json(data, { headers: { 'cache-control': 'public, max-age=10800', 'x-cache': 'miss' } });
  }

  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  const hasViewport = [north, south, east, west].every((n) => Number.isFinite(n));

  let bounds = hasViewport ? { north, south, east, west } : { north: 30, south: -30, east: 155, west: 65 };

  // Pad a too-tight viewport up to a minimum meaningful span, centred on it.
  const latSpan = bounds.north - bounds.south;
  const lonSpan = bounds.east - bounds.west;
  if (latSpan < MIN_SPAN_DEG) {
    const mid = (bounds.north + bounds.south) / 2;
    bounds = { ...bounds, north: mid + MIN_SPAN_DEG / 2, south: mid - MIN_SPAN_DEG / 2 };
  }
  if (lonSpan < MIN_SPAN_DEG) {
    const mid = (bounds.east + bounds.west) / 2;
    bounds = { ...bounds, east: mid + MIN_SPAN_DEG / 2, west: mid - MIN_SPAN_DEG / 2 };
  }

  // Already "world-ish" — the ambient layer covers this just as well, skip
  // the redundant fetch rather than duplicating near-identical work.
  if (latSpan > MAX_VIEWPORT_LAT_SPAN || lonSpan > MAX_VIEWPORT_LON_SPAN) {
    return Response.json({ skipped: true, reason: 'span_too_wide_use_ambient' });
  }

  const key = cacheKey(roundBounds(bounds));
  const cached = viewportCache.get(key);
  if (cached && Date.now() - cached.t < VIEWPORT_TTL_MS) {
    return Response.json(cached.data, { headers: { 'x-cache': 'hit' } });
  }
  if (Date.now() - lastBatchAt < MIN_BATCH_GAP_MS && cached) {
    return Response.json(cached.data, { headers: { 'x-cache': 'stale-throttled' } });
  }

  lastBatchAt = Date.now();
  const data = await sampleGrid(bounds, GRID_NX, GRID_NY);
  evictOldest();
  viewportCache.set(key, { t: Date.now(), data });
  return Response.json(data, { headers: { 'cache-control': 'public, max-age=1200', 'x-cache': 'miss' } });
}
