import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPointInBounds, filterStationsInBounds, summarizeStations } from './provinceFilter.js';

const JAKARTA_BOUNDS = { north: -5.10, south: -6.35, west: 106.65, east: 106.97 };

test('isPointInBounds: point inside returns true', () => {
  assert.equal(isPointInBounds(-6.1552, 106.8456, JAKARTA_BOUNDS), true); // Kemayoran
});

test('isPointInBounds: point outside returns false', () => {
  assert.equal(isPointInBounds(-7.25, 112.75, JAKARTA_BOUNDS), false); // Surabaya
});

test('isPointInBounds: point exactly on the boundary is inclusive', () => {
  assert.equal(isPointInBounds(JAKARTA_BOUNDS.north, JAKARTA_BOUNDS.west, JAKARTA_BOUNDS), true);
});

test('filterStationsInBounds: keeps only stations inside the box', () => {
  const stations = [
    { id: 'a', lat: -6.1552, lng: 106.8456 }, // inside
    { id: 'b', lat: -7.25, lng: 112.75 }, // outside
  ];
  const result = filterStationsInBounds(stations, JAKARTA_BOUNDS);
  assert.deepEqual(result.map((s) => s.id), ['a']);
});

test('summarizeStations: counts total/active/raining correctly', () => {
  const stations = [
    { status: 'active', isRaining: true },
    { status: 'active', isRaining: false },
    { status: 'blacklisted', isRaining: false },
  ];
  // active and raining are mutually exclusive buckets (statusBucket()
  // precedence) — a raining sensor is counted as raining, not also active.
  assert.deepEqual(summarizeStations(stations), { total: 3, active: 1, raining: 1 });
});

test('summarizeStations: empty array yields all zeros', () => {
  assert.deepEqual(summarizeStations([]), { total: 0, active: 0, raining: 0 });
});
