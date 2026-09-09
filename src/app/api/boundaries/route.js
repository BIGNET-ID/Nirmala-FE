import { normalizeRegions, maxAllowableOffsetForZoom } from '@/lib/boundaryRegions';

/**
 * Proxies Badan Informasi Geospasial's (BIG) public ArcGIS REST service for
 * kecamatan (district) administrative boundaries, scoped to the map's
 * current viewport — never downloads a nationwide dataset (the full
 * kelurahan-level dataset from other public sources runs >2GB; querying
 * BIG per-bbox with server-side geometry simplification keeps a
 * city-sized viewport around 35KB, verified empirically).
 *
 * See docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md
 */

export const dynamic = 'force-dynamic';

const BIG_ENDPOINT = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer/14/query';
// Administrative boundaries basically never change — cache far longer
// than weather data (compare VIEWPORT_TTL_MS = 20 minutes in
// src/app/api/wind/route.js).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
const boundsCache = new Map(); // key -> { t, data }

function roundBbox(b) {
  // ~0.05° (~5.5km at the equator) — fine enough that a small pan doesn't
  // silently return a stale-but-wrong-area cached response, coarse enough
  // that repeated small pans/zooms within the same neighborhood still hit
  // the cache.
  const r = (n) => Math.round(n / 0.05) * 0.05;
  return `${r(b.north)},${r(b.south)},${r(b.east)},${r(b.west)}`;
}

function evictOldest() {
  if (boundsCache.size < MAX_CACHE_ENTRIES) return;
  const oldestKey = [...boundsCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]?.[0];
  if (oldestKey) boundsCache.delete(oldestKey);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  const zoom = parseFloat(searchParams.get('zoom'));

  if (![north, south, east, west].every(Number.isFinite)) {
    return Response.json({ error: 'missing_bbox' }, { status: 400 });
  }

  const key = roundBbox({ north, south, east, west });
  const cached = boundsCache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) {
    return Response.json(cached.data, { headers: { 'x-cache': 'hit' } });
  }

  const geometry = JSON.stringify({
    xmin: west, ymin: south, xmax: east, ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const offset = maxAllowableOffsetForZoom(Number.isFinite(zoom) ? zoom : 10);
  const url = `${BIG_ENDPOINT}?geometry=${encodeURIComponent(geometry)}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=namobj,wadmkc,wadmkk,wadmpr&maxAllowableOffset=${offset}&f=geojson`;

  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const geojson = await r.json();
    const data = normalizeRegions(geojson);
    boundsCache.set(key, { t: Date.now(), data });
    evictOldest();
    return Response.json(data, { headers: { 'x-cache': 'miss' } });
  } catch (error) {
    console.warn('[api/boundaries] BIG fetch failed:', error.message);
    return Response.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
