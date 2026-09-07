import { haversineKm } from './meshTopology.js';

/**
 * Brute-force nearest-kabupaten lookup over BMKG's ~511 points. Deliberately
 * NOT a spatial index (K-D Tree/grid-bucket): this runs once per sensor
 * click, not per-frame and not for all sensors at once, so a full scan is
 * imperceptibly cheap — and a full scan is strictly MORE accurate than a
 * bucketed index at this scale (a grid-bucket only checks a neighborhood
 * block, which can silently miss the true nearest point in the sparse
 * regions BMKG's own coverage has, e.g. Papua/Kalimantan).
 *
 * `kabupaten` entries use `lon` (BMKG's own field name, see
 * useBmkgWeather.js), converted to `lng` here since haversineKm expects
 * that property name (meshTopology.js's convention, matching sensor
 * stations' own `{lat, lng}` shape).
 */
export function findNearestKabupaten(lat, lng, kabupaten) {
  let best = null;
  let bestDist = Infinity;
  for (const k of kabupaten) {
    const d = haversineKm({ lat, lng }, { lat: k.lat, lng: k.lon });
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}
