/**
 * Maps BIG's ArcGIS REST GeoJSON response (see route.js) into the compact
 * shape this app actually uses. Two things this deliberately does:
 *  - Flips coordinate order: GeoJSON polygons are [lng, lat] per spec; this
 *    app's own convention everywhere else (station.lat/lng, MAP_CENTER,
 *    haversineKm) is {lat, lng}. Getting this backwards silently breaks
 *    every distance/rendering calculation downstream.
 *  - Drops every field BIG returns that isn't actually used (kode BPS/PUM,
 *    metadata, luas wilayah, etc.) — keeps the payload sent to the client
 *    as small as the already-simplified geometry.
 *  - Uses only the exterior ring (coordinates[0]) — kecamatan polygons
 *    with holes (an enclave village, say) are rare enough at this zoom
 *    range that rendering the hole isn't worth the extra complexity;
 *    YAGNI for this iteration.
 */
export function normalizeRegions(geojson) {
  const features = geojson?.features || [];
  return features.map((feature, i) => {
    const props = feature?.properties || {};
    const ring = feature?.geometry?.coordinates?.[0] || [];
    const polygon = ring.map(([lng, lat]) => ({ lat, lng }));
    const centroid = polygon.length
      ? {
          lat: polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length,
          lng: polygon.reduce((sum, p) => sum + p.lng, 0) / polygon.length,
        }
      : { lat: 0, lng: 0 };
    return {
      id: `${props.wadmkc || 'unknown'}-${i}`,
      name: props.namobj || null,
      kecamatan: props.wadmkc || null,
      kabupaten: props.wadmkk || null,
      provinsi: props.wadmpr || null,
      polygon,
      centroid,
    };
  });
}

// Server-side geometry generalization (BIG's `maxAllowableOffset` query
// param, in degrees) — verified empirically: 0.001 (~111m at the equator)
// shrank one city-sized viewport's response from ~7MB to ~35KB with no
// visible loss of shape. Estimates below REGION_LAYER_MIN_ZOOM (wider
// viewport, more polygons, needs more aggressive simplification) and above
// 14 (tight zoom, few polygons, can afford more detail) are NOT yet
// empirically verified against real payload sizes — tune after checking
// the Network tab at those zoom levels.
export function maxAllowableOffsetForZoom(zoom) {
  if (zoom >= 14) return 0.0005;
  if (zoom >= 12) return 0.001;
  return 0.003;
}
