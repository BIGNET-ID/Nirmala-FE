/**
 * Douglas-Peucker polyline simplification, hand-written rather than adding
 * a dependency (mapshaper/turf) for what is otherwise a one-time,
 * developer-run script (see scripts/build-kecamatan-dataset.mjs) — see
 * docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md.
 *
 * `tolerance` is in the SAME unit as the input coordinates (plain
 * lat/lng degrees, not meters) — chosen by trial against real output file
 * sizes, not derived from a distance formula. A ring shorter than 4 points
 * has nothing worth simplifying and is returned as-is.
 */
export function simplifyRing(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifySegment(points, 0, points.length - 1, tolerance, keep);
  return points.filter((_, i) => keep[i]);
}

function simplifySegment(points, startIdx, endIdx, tolerance, keep) {
  if (endIdx <= startIdx + 1) return;
  const start = points[startIdx];
  const end = points[endIdx];
  let maxDist = -1;
  let maxIdx = -1;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    keep[maxIdx] = true;
    simplifySegment(points, startIdx, maxIdx, tolerance, keep);
    simplifySegment(points, maxIdx, endIdx, tolerance, keep);
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  if (dx === 0 && dy === 0) {
    const ex = point.lng - lineStart.lng;
    const ey = point.lat - lineStart.lat;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy);
  const projLng = lineStart.lng + t * dx;
  const projLat = lineStart.lat + t * dy;
  const ex = point.lng - projLng;
  const ey = point.lat - projLat;
  return Math.sqrt(ex * ex + ey * ey);
}
