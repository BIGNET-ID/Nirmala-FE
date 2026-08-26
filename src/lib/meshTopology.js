// Sensor mesh graph for the "Mesh Map" mode (sensor-coverage gap analysis).
//
// Pure, framework-free: takes station objects ({id, lat, lng, ...}) and
// returns a MESH GRAPH — every station connected to its k nearest
// neighbours, forming a dense grid with cells/loops (not a sparse tree).
// Every station is guaranteed reachable — no isolated nodes, even a lone
// station far from everything else — because a bridge pass connects any
// remaining disconnected component to the rest of the network.
//
// Algorithm: build a k-nearest-neighbour CANDIDATE graph (via a coarse
// spatial grid) instead of the full O(n^2) edge set (~10.5M edges at
// ~4.5k stations, computationally and visually unusable) — the candidate
// graph itself, not a reduction of it, IS the rendered mesh. If the
// candidate graph still leaves stations disconnected (e.g. a small
// cluster, or a single outlier, far from every other station, so no
// candidate edge ever crosses between them), a bridge pass connects the
// remaining components using their nearest cross-component station pair,
// so the result always spans every input station.
//
// Topology depends only on station POSITIONS, which are static — callers
// should cache the result keyed on the station id set, not recompute on
// every live data tick (only isRaining/status change between ticks).

const EARTH_RADIUS_KM = 6371;

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildSpatialGrid(pts) {
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
  const cellOf = (p) => ({
    cx: Math.floor((p.lng - minLng) / cellLng),
    cy: Math.floor((p.lat - minLat) / cellLat),
  });
  const grid = new Map(); // "cx:cy" -> station[]
  for (const p of pts) {
    const { cx, cy } = cellOf(p);
    const key = `${cx}:${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  return { grid, cellOf };
}

// k nearest candidates per station, searched over a `radius`-cell
// neighbourhood — generous enough that each station's true k nearest
// neighbours almost always live inside this candidate set, without ever
// building the full O(n^2) graph. This candidate set IS the mesh — it is
// not reduced further.
function buildCandidateEdges(pts, k, radius) {
  const { grid, cellOf } = buildSpatialGrid(pts);
  const seen = new Set();
  const edges = [];
  for (const p of pts) {
    const { cx, cy } = cellOf(p);
    const candidates = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`);
        if (bucket) candidates.push(...bucket);
      }
    }
    const nearest = candidates
      .filter((c) => c.id !== p.id)
      .map((c) => ({ c, d: haversineKm(p, c) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, k);
    for (const { c, d } of nearest) {
      const [idA, idB] = [String(p.id), String(c.id)].sort();
      const key = `${idA}|${idB}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: p, b: c, distanceKm: d });
    }
  }
  return edges;
}

// Union-Find (disjoint-set) with path compression + union by rank.
class DisjointSet {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]));
    this.rank = new Map(ids.map((id) => [id, 0]));
  }

  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x);
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }

  union(x, y) {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return false;
    const rankX = this.rank.get(rx);
    const rankY = this.rank.get(ry);
    if (rankX < rankY) this.parent.set(rx, ry);
    else if (rankX > rankY) this.parent.set(ry, rx);
    else { this.parent.set(ry, rx); this.rank.set(rx, rankX + 1); }
    return true;
  }
}

// Groups candidate edges into connected components via union-find, purely
// to find out which stations (if any) the candidate graph left isolated —
// the candidate edges themselves are kept as-is, not reduced.
function findComponents(pts, edges) {
  const dsu = new DisjointSet(pts.map((p) => String(p.id)));
  for (const edge of edges) dsu.union(String(edge.a.id), String(edge.b.id));
  return dsu;
}

// Bridges any remaining disconnected components (only happens when a
// cluster's local neighbourhood never overlapped any other component in
// the candidate graph) by repeatedly connecting the two closest remaining
// components — via their actual nearest cross-component station pair, not
// just their centroids — until one component remains. Only runs over the
// handful of components (if any) the candidate pass missed, never the
// full station set.
function bridgeComponents(pts, dsu) {
  const componentsById = new Map(); // root -> station[]
  for (const p of pts) {
    const root = dsu.find(String(p.id));
    if (!componentsById.has(root)) componentsById.set(root, []);
    componentsById.get(root).push(p);
  }
  let components = [...componentsById.values()];
  const bridgeEdges = [];

  while (components.length > 1) {
    const centroids = components.map((comp) => ({
      lat: comp.reduce((s, p) => s + p.lat, 0) / comp.length,
      lng: comp.reduce((s, p) => s + p.lng, 0) / comp.length,
    }));

    // Closest pair of components by centroid distance — cheap first pass
    // to pick WHICH two components to bridge.
    let bestI = 0, bestJ = 1, bestCentroidD = Infinity;
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const d = haversineKm(centroids[i], centroids[j]);
        if (d < bestCentroidD) { bestCentroidD = d; bestI = i; bestJ = j; }
      }
    }

    // Connect those two components via their actual nearest station pair.
    let bestA = null, bestB = null, bestPairD = Infinity;
    for (const a of components[bestI]) {
      for (const b of components[bestJ]) {
        const d = haversineKm(a, b);
        if (d < bestPairD) { bestPairD = d; bestA = a; bestB = b; }
      }
    }
    bridgeEdges.push({ a: bestA, b: bestB, distanceKm: bestPairD });
    dsu.union(String(bestA.id), String(bestB.id));

    const merged = components[bestI].concat(components[bestJ]);
    components = components.filter((_, idx) => idx !== bestI && idx !== bestJ);
    components.push(merged);
  }

  return bridgeEdges;
}

/**
 * Build a dense sensor mesh graph — every station connected to its k
 * nearest neighbours (forming a grid with cells/loops, not a sparse
 * tree), plus bridge edges so every station is reachable, even a lone
 * outlier far from everything else. Returns
 * `{ edges, minDistanceKm, maxDistanceKm }`; `edges` items are
 * `{ a, b, distanceKm }`.
 */
export function buildSensorMeshGraph(stations, { k = 8, radius = 2 } = {}) {
  const pts = stations.filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number');
  if (pts.length < 2) return { edges: [], minDistanceKm: 0, maxDistanceKm: 0 };

  const candidates = buildCandidateEdges(pts, k, radius);
  const dsu = findComponents(pts, candidates);
  const bridges = bridgeComponents(pts, dsu);
  const edges = candidates.concat(bridges);

  let minDistanceKm = Infinity;
  let maxDistanceKm = 0;
  for (const e of edges) {
    if (e.distanceKm < minDistanceKm) minDistanceKm = e.distanceKm;
    if (e.distanceKm > maxDistanceKm) maxDistanceKm = e.distanceKm;
  }
  if (!edges.length) { minDistanceKm = 0; maxDistanceKm = 0; }

  return { edges, minDistanceKm, maxDistanceKm };
}
