import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmToT } from './rainRamp.js';

test('mmToT: 0mm maps to t=0', () => {
  assert.equal(mmToT(0), 0);
});

test('mmToT: each breakpoint maps to its exact tick position', () => {
  assert.ok(Math.abs(mmToT(2.5) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(mmToT(7.6) - 2 / 3) < 1e-9);
  assert.equal(mmToT(50), 1);
});

test('mmToT: interpolates linearly between two breakpoints', () => {
  // Midpoint of [2.5, 7.6] should land midway between t=1/3 and t=2/3.
  const mid = (2.5 + 7.6) / 2;
  const expected = (1 / 3 + 2 / 3) / 2;
  assert.ok(Math.abs(mmToT(mid) - expected) < 1e-9);
});

test('mmToT: value above the last breakpoint clamps to t=1', () => {
  assert.equal(mmToT(200), 1);
});

test('mmToT: NaN or negative input returns 0 (defensive, not saturated)', () => {
  assert.equal(mmToT(NaN), 0);
  assert.equal(mmToT(-5), 0);
});
