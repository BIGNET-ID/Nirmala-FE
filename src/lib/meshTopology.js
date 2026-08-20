// Nearest-neighbour mesh topology for the "Mesh Map" mode.
//
// Pure, framework-free: takes station objects ({id, lat, lng, ...}) and
// returns undirected edges {a, b} connecting each station to its k nearest
// neighbours. O(n) via a coarse spatial grid — with ~4.5k national sensors,
// a naive O(n^2) nearest-neighbour search is not viable.
//
// Topology depends only on station POSITIONS, which are static — callers
// should cache the result keyed on the station id set, not recompute on
// every live data tick (only isRaining/status change between ticks).

function distSq(a, b) {
  // Equirectangular approx — fine at the regional distances neighbours sit at.
  const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lng - a.lng) * Math.cos(latRad);
  const dy = b.lat - a.lat;
  return dx * dx + dy * dy;
}

export function buildNearestNeighborEdges(stations, k = 2) {
  const pts = stations.filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number');
  if (pts.length < 2) return [];

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latSpan = Math.max(maxLat - minLat, 1e-6);
  const lngSpan = Math.max(maxLng - minLng, 1e-6);
  // Aim for roughly a handful of points per cell.
  const cellsPerAxis = Math.max(1, Math.round(Math.sqrt(pts.length / 4)));
  const cellLat = latSpan / cellsPerAxis;
  const cellLng = lngSpan / cellsPerAxis;

  const cellKey = (lat, lng) => {
    const cx = Math.floor((lng - minLng) / cellLng);
    const cy = Math.floor((lat - minLat) / cellLat);
    return `${cx}:${cy}`;
  };

  const grid = new Map(); // cellKey -> station[]
  for (const p of pts) {
    const key = cellKey(p.lat, p.lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }

  const seen = new Set(); // "idA|idB" (idA < idB) — dedupe undirected edges
  const edges = [];

  for (const p of pts) {
    const cx = Math.floor((p.lng - minLng) / cellLng);
    const cy = Math.floor((p.lat - minLat) / cellLat);
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`);
        if (bucket) candidates.push(...bucket);
      }
    }
    const nearest = candidates
      .filter((c) => c.id !== p.id)
      .map((c) => ({ c, d: distSq(p, c) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, k);

    for (const { c } of nearest) {
      const [idA, idB] = [String(p.id), String(c.id)].sort();
      const key = `${idA}|${idB}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: p, b: c });
    }
  }

  return edges;
}
