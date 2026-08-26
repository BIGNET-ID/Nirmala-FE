import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSensorMeshGraph } from './meshTopology.js';

function station(id, lat, lng) {
  return { id, lat, lng };
}

function idSet(edges) {
  const s = new Set();
  for (const e of edges) { s.add(String(e.a.id)); s.add(String(e.b.id)); }
  return s;
}

test('fewer than 2 stations yields no edges and zero range', () => {
  assert.deepEqual(buildSensorMeshGraph([]), { edges: [], minDistanceKm: 0, maxDistanceKm: 0 });
  assert.deepEqual(buildSensorMeshGraph([station('a', 0, 0)]), { edges: [], minDistanceKm: 0, maxDistanceKm: 0 });
});

test('two stations are connected by exactly one edge with a positive distance', () => {
  const { edges } = buildSensorMeshGraph([station('a', -6.2, 106.8), station('b', -6.3, 106.9)]);
  assert.equal(edges.length, 1);
  assert.ok(edges[0].distanceKm > 0);
});

test('every station ends up connected (mesh, not just nearest-neighbour clusters)', () => {
  const stations = [
    station('a', -6.20, 106.80),
    station('b', -6.21, 106.81),
    station('c', -6.19, 106.79),
    station('d', -6.22, 106.82),
    station('outlier', -2.50, 118.00), // far away — must still end up connected
  ];
  const { edges } = buildSensorMeshGraph(stations);
  const ids = idSet(edges);
  for (const s of stations) assert.ok(ids.has(String(s.id)), `station ${s.id} is disconnected`);
});

test('a dense local cluster keeps every nearby edge, not just a minimal spanning subset', () => {
  // Four stations close together, all within each other's k-nearest — a
  // sparse spanning tree over 4 points would keep only 3 edges; the mesh
  // must keep all 6 pairwise edges since k (default 8) covers all of them.
  const stations = [
    station('a', 0.00, 100.00),
    station('b', 0.01, 100.00),
    station('c', 0.00, 100.01),
    station('d', 0.01, 100.01),
  ];
  const { edges } = buildSensorMeshGraph(stations);
  assert.equal(edges.length, 6); // C(4,2) — every pair connected
});

test('caps each station to its k nearest neighbours, not every station in range', () => {
  // Central station with 5 close neighbours at increasing distance; with
  // k=2 it should only connect to the 2 nearest, not all 5.
  const center = station('center', 0.0, 100.0);
  const neighbours = [1, 2, 3, 4, 5].map((i) => station(`n${i}`, i * 0.01, 100.0));
  const { edges } = buildSensorMeshGraph([center, ...neighbours], { k: 2, radius: 3 });
  const centerEdges = edges.filter((e) => e.a.id === 'center' || e.b.id === 'center');
  assert.equal(centerEdges.length, 2);
  const connectedIds = centerEdges.map((e) => (e.a.id === 'center' ? e.b.id : e.a.id)).sort();
  assert.deepEqual(connectedIds, ['n1', 'n2']); // the two nearest
});

test('bridges two well-separated clusters so every station is still reachable', () => {
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
  const { edges, maxDistanceKm } = buildSensorMeshGraph([...cluster1, ...cluster2]);
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
  const { edges, minDistanceKm, maxDistanceKm } = buildSensorMeshGraph([a, b, c]);
  const distances = edges.map((e) => e.distanceKm);
  assert.equal(minDistanceKm, Math.min(...distances));
  assert.equal(maxDistanceKm, Math.max(...distances));
  assert.ok(minDistanceKm < maxDistanceKm);
});
