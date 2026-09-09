import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyRing } from './simplifyPolygon.js';

test('simplifyRing: a simple square ring is unchanged at a small tolerance', () => {
  const square = [
    { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(square, 0.0001);
  assert.deepEqual(result, square);
});

test('simplifyRing: a near-collinear midpoint is dropped at a larger tolerance', () => {
  // Three points on (nearly) the same line: (0,0) -> (0,0.5) -> (0,1) is a
  // straight vertical segment; the midpoint carries no shape information.
  const ring = [
    { lat: 0, lng: 0 }, { lat: 0.5, lng: 0.0001 }, { lat: 1, lng: 0 },
    { lat: 1, lng: 1 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(ring, 0.01);
  assert.equal(result.length, 4);
  assert.deepEqual(result[0], { lat: 0, lng: 0 });
  assert.deepEqual(result[1], { lat: 1, lng: 0 });
});

test('simplifyRing: first and last points of a closed ring are always kept', () => {
  const ring = [
    { lat: 0, lng: 0 }, { lat: 0.5, lng: 0.0001 }, { lat: 1, lng: 0 },
    { lat: 1, lng: 1 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(ring, 0.01);
  assert.deepEqual(result[0], ring[0]);
  assert.deepEqual(result[result.length - 1], ring[ring.length - 1]);
});

test('simplifyRing: fewer than 4 points is returned unchanged (nothing to simplify)', () => {
  const tiny = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 0 }];
  assert.deepEqual(simplifyRing(tiny, 1), tiny);
});

test('simplifyRing: empty array returns empty array', () => {
  assert.deepEqual(simplifyRing([], 1), []);
});
