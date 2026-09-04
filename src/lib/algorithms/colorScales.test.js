import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeDistanceToColor } from './colorScales.js';

test('t=0 returns the exact first stop colour (short distance)', () => {
  assert.equal(edgeDistanceToColor(0), 'rgba(219, 234, 254, 1)');
});

test('t=1 returns the exact last stop colour (long distance, alert red)', () => {
  assert.equal(edgeDistanceToColor(1), 'rgba(220, 38, 38, 1)');
});

test('out-of-range t is clamped into [0, 1]', () => {
  assert.equal(edgeDistanceToColor(-5), edgeDistanceToColor(0));
  assert.equal(edgeDistanceToColor(5), edgeDistanceToColor(1));
});

test('mid-range t returns a colour distinct from both endpoints', () => {
  const mid = edgeDistanceToColor(0.5);
  assert.notEqual(mid, edgeDistanceToColor(0));
  assert.notEqual(mid, edgeDistanceToColor(1));
});
