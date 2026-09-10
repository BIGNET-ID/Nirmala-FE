/**
 * Maps a GeoJSON FeatureCollection (in BIG's original field-naming
 * convention — namobj/wadmkc/wadmkk/wadmpr — which route.js's bundled
 * static file, produced from HDX by scripts/build-kecamatan-dataset.mjs,
 * is remapped into; historically this GeoJSON came from BIG's own live
 * ArcGIS REST API instead) into the compact shape this app actually uses.
 * Two things this deliberately does:
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
 *    YAGNI for this iteration. Only plain Polygon geometry is supported —
 *    MultiPolygon features are filtered out upstream (see
 *    scripts/build-kecamatan-dataset.mjs) before reaching this function,
 *    so this deliberately does not special-case them.
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
