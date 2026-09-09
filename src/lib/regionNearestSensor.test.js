import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegionBucket } from './regionNearestSensor.js';

const region = (lat, lng) => ({ centroid: { lat, lng } });

test('resolveRegionBucket: picks the nearest station\'s status', () => {
  const stations = [
    { id: 'far', lat: -6.9, lng: 107.6, isRaining: false },   // ~farther
    { id: 'near', lat: -6.201, lng: 106.816, isRaining: true }, // ~closer, raining
  ];
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, 'raining');
});

test('resolveRegionBucket: station beyond MAX_DISTANCE_KM returns null (no-data)', () => {
  const stations = [{ id: 'faraway', lat: 3.5, lng: 98.6, isRaining: true }]; // Medan, >1000km from Jakarta
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, null);
});

test('resolveRegionBucket: no stations at all returns null', () => {
  assert.equal(resolveRegionBucket(region(-6.2, 106.8), []), null);
});

test('resolveRegionBucket: a station right at the region centroid resolves to its own bucket', () => {
  const stations = [{ id: 'exact', lat: -6.2, lng: 106.8, blacklisted: true }];
  assert.equal(resolveRegionBucket(region(-6.2, 106.8), stations), 'blacklisted');
});
