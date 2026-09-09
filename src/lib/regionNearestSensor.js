import { haversineKm } from './meshTopology.js';
import { statusBucket } from './sensorColor.js';

// Same filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — render netral (null), bukan warna yang menyesatkan. Estimate, not
// yet visually verified — tune after seeing it rendered against real
// sensor density.
export const MAX_DISTANCE_KM = 25;

/**
 * Resolves which sensor-status bucket a kecamatan region should be colored
 * with — the bucket of its nearest sensor, or `null` if no sensor is
 * within MAX_DISTANCE_KM (render as no-data instead of a misleadingly
 * distant status).
 */
export function resolveRegionBucket(region, stations) {
  let best = null;
  let bestKm = Infinity;
  for (const st of stations) {
    if (typeof st.lat !== 'number' || typeof st.lng !== 'number') continue;
    const km = haversineKm(region.centroid, st);
    if (km < bestKm) {
      bestKm = km;
      best = st;
    }
  }
  return best && bestKm <= MAX_DISTANCE_KM ? statusBucket(best) : null;
}
