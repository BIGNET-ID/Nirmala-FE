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

function regionIntersectsBbox(region, bbox) {
  for (const point of region.polygon) {
    if (point.lat >= bbox.south && point.lat <= bbox.north
      && point.lng >= bbox.west && point.lng <= bbox.east) {
      return true;
    }
  }
  return false;
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
