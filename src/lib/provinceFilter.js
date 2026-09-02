import { statusBucket } from './sensorColor.js';

/**
 * Client-side province filtering (PRD §4.3). /api/sensors carries no
 * province_code today — this is a bounding-box approximation, not the real
 * thing. Swap to the backend's own province_code once it exists; the shape
 * of `summarizeStations`'s return value is what ProvinceFilterSelect
 * expects, so that swap only touches where the filtered list comes from.
 */
export function isPointInBounds(lat, lng, bounds) {
  return lat <= bounds.north && lat >= bounds.south && lng >= bounds.west && lng <= bounds.east;
}

export function filterStationsInBounds(stations, bounds) {
  return stations.filter((s) => isPointInBounds(s.lat, s.lng, bounds));
}

// active/raining are mutually-exclusive statusBucket() buckets — a raining
// sensor counts as raining, not also active (see sensorColor.js).
export function summarizeStations(stations, now = Date.now()) {
  return {
    total: stations.length,
    active: stations.filter((s) => statusBucket(s, now) === 'active').length,
    raining: stations.filter((s) => statusBucket(s, now) === 'raining').length,
  };
}
