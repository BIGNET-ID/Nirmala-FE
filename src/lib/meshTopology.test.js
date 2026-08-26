import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMinimumSpanningTree } from './meshTopology.js';

function station(id, lat, lng) {
  return { id, lat, lng };
}

function idSet(edges) {
  const s = new Set();
  for (const e of edges) { s.add(String(e.a.id)); s.add(String(e.b.id)); }
  return s;
}

test('fewer than 2 stations yields no edges and zero range', () => {
  assert.deepEqual(buildMinimumSpanningTree([]), { edges: [], minDistanceKm: 0, maxDistanceKm: 0 });
  assert.deepEqual(buildMinimumSpanningTree([station('a', 0, 0)]), { edges: [], minDistanceKm: 0, maxDistanceKm: 0 });
});

test('two stations are connected by exactly one edge with a positive distance', () => {
  const { edges } = buildMinimumSpanningTree([station('a', -6.2, 106.8), station('b', -6.3, 106.9)]);
  assert.equal(edges.length, 1);
  assert.ok(edges[0].distanceKm > 0);
});

test('every station ends up connected (spanning, not just nearest-neighbour clusters)', () => {
  const stations = [
    station('a', -6.20, 106.80),
    station('b', -6.21, 106.81),
    station('c', -6.19, 106.79),
    station('d', -6.22, 106.82),
    station('outlier', -2.50, 118.00), // far away — must still end up connected
  ];
  const { edges } = buildMinimumSpanningTree(stations);
  assert.equal(edges.length, stations.length - 1); // a real tree: n-1 edges
  const ids = idSet(edges);
  for (const s of stations) assert.ok(ids.has(String(s.id)), `station ${s.id} is disconnected`);
});

test('picks the two shortest edges on a line of three stations, not the longest', () => {
  // Three stations roughly on a line, evenly spaced ~0.1 degree apart in
  // latitude (~11km per 0.1 degree) — the MST must pick (a-b) and (b-c),
  // never the long a-c edge, since that would be more total length for a
  // spanning tree over 3 points.
  const a = station('a', 0.0, 100.0);
  const b = station('b', 0.1, 100.0);
  const c = station('c', 0.2, 100.0);
  const { edges } = buildMinimumSpanningTree([a, b, c]);
  assert.equal(edges.length, 2);
  const pairs = edges.map((e) => [String(e.a.id), String(e.b.id)].sort().join('-'));
  assert.ok(pairs.includes('a-b'));
  assert.ok(pairs.includes('b-c'));
  assert.ok(!pairs.includes('a-c'));
});

test('bridges two well-separated clusters into one connected tree', () => {
  // Cluster 1: tight group near Jakarta. Cluster 2: tight group near
  // Surabaya, ~700km away — far enough that the default candidate search
  // (k nearest neighbours within a local grid radius) won't naturally
  // pair any Jakarta station with any Surabaya station, so connecting them
  // requires the explicit bridge pass.
  const cluster1 = [
    station('j1', -6.20, 106.80),
    station('j2', -6.21, 106.81),
    station('j3', -6.19, 106.79),
  ];
  const cluster2 = [
    station('s1', -7.25, 112.75),
    station('s2', -7.26, 112.76),
    station('s3', -7.24, 112.74),
  ];
  const { edges, maxDistanceKm } = buildMinimumSpanningTree([...cluster1, ...cluster2]);
  assert.equal(edges.length, 5); // 6 stations -> a real tree has 5 edges
  const ids = idSet(edges);
  for (const s of [...cluster1, ...cluster2]) assert.ok(ids.has(String(s.id)));
  // The bridge edge between the two clusters must be far longer than any
  // intra-cluster edge — that's exactly the "biggest gap" this feature
  // exists to surface.
  assert.ok(maxDistanceKm > 100);
});

test('minDistanceKm and maxDistanceKm reflect the actual edge distances', () => {
  const a = station('a', 0.0, 100.0);
  const b = station('b', 0.05, 100.0); // short edge
  const c = station('c', 0.5, 100.0); // long edge from b
  const { edges, minDistanceKm, maxDistanceKm } = buildMinimumSpanningTree([a, b, c]);
  const distances = edges.map((e) => e.distanceKm);
  assert.equal(minDistanceKm, Math.min(...distances));
  assert.equal(maxDistanceKm, Math.max(...distances));
  assert.ok(minDistanceKm < maxDistanceKm);
});
