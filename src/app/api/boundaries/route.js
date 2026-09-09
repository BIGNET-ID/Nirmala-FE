import { normalizeRegions } from '@/lib/boundaryRegions';
import kecamatanGeoJSON from '@/data/kecamatan-indonesia.json';

/**
 * Serves kecamatan (district) administrative boundaries for the map's
 * current viewport, from a static national dataset bundled at build time
 * — not a live external proxy (see
 * docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md
 * for why: BIG's public live API, used by the previous version of this
 * route, turned out to only cover Sulawesi Tenggara — 66 kecamatan total,
 * verified by querying it with a whole-Indonesia bounding box). The
 * bundled file (src/data/kecamatan-indonesia.json) is produced once by
 * scripts/build-kecamatan-dataset.mjs from HDX's national dataset, already
 * simplified and already shaped to match normalizeRegions()'s expected
 * input — no per-request simplification or external fetch needed anymore.
 */

export const dynamic = 'force-dynamic';

// Normalized once per Worker instance (module scope), not per-request —
// the whole dataset is a few MB at most, filtering it in-memory per
// request is effectively instant, so unlike the old BIG-proxy version
// there is no need for a TTL cache here.
const ALL_REGIONS = normalizeRegions(kecamatanGeoJSON);

// Rectangle-overlap test between the query bbox and each region's own
// bounding box (min/max lat/lng across its polygon). A vertex-only check
// misses two real cases: the query bbox fully contained inside a large
// region's polygon with no vertex of its own inside the (smaller) query
// bbox, and a polygon edge crossing through the bbox without either
// endpoint landing inside it. Two axis-aligned rectangles overlap unless
// one is entirely to one side of the other on either axis — this is a
// strict superset of the old vertex check, so it can only add previously
// missed regions, never drop a correctly-included one.
function regionBounds(region) {
  let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
  for (const point of region.polygon) {
    if (point.lat > north) north = point.lat;
    if (point.lat < south) south = point.lat;
    if (point.lng > east) east = point.lng;
    if (point.lng < west) west = point.lng;
  }
  return { north, south, east, west };
}

function regionIntersectsBbox(region, bbox) {
  const r = regionBounds(region);
  return r.south <= bbox.north && r.north >= bbox.south
    && r.west <= bbox.east && r.east >= bbox.west;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  // `zoom` is still accepted for call-site compatibility with
  // useAdminBoundaries.js, but no longer used — the bundled dataset is
  // already simplified once, not re-simplified per request/zoom level.

  if (![north, south, east, west].every(Number.isFinite)) {
    return Response.json({ error: 'missing_bbox' }, { status: 400 });
  }

  const bbox = { north, south, east, west };
  const data = ALL_REGIONS.filter((region) => regionIntersectsBbox(region, bbox));
  return Response.json(data);
}
