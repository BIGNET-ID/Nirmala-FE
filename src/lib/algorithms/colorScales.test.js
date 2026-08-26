import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeDistanceToColor } from './colorScales.js';

test('t=0 returns the exact first stop colour (short distance, --rain-1)', () => {
  assert.equal(edgeDistanceToColor(0), 'rgba(96, 165, 250, 1)');
});

test('t=1 returns the exact last stop colour (long distance, --rain-6)', () => {
  assert.equal(edgeDistanceToColor(1), 'rgba(192, 132, 252, 1)');
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
