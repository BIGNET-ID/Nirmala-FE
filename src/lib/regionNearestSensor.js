import { haversineKm } from './meshTopology.js';
import { statusBucket } from './sensorColor.js';

// Same filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — dikecualikan sepenuhnya, bukan diwarnai netral (lihat
// AdminRegionLayer.jsx). Disamakan dengan RAIN_KM = 9 di CanvasOverlay.jsx
// supaya kedua mode Rain Density (blob & region) punya bahasa "seberapa
// jauh sensor bisa jujur mewakili suatu area" yang konsisten — bukan lagi
// estimasi terpisah seperti nilai 25 sebelumnya.
export const MAX_DISTANCE_KM = 9;

/**
 * Resolves which sensor-status bucket a kecamatan region should be colored
 * with — the bucket of its nearest sensor, or `null` if no sensor is
 * within MAX_DISTANCE_KM (the caller, AdminRegionLayer.jsx, skips
 * rendering the region entirely in that case, rather than showing a
 * misleadingly distant status or a no-data color).
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
