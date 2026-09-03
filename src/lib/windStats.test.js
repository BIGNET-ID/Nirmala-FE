import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageSpeed } from './windStats.js';

test('averageSpeed: averages a normal multi-value array', () => {
  assert.equal(averageSpeed({ speed: [2, 4, 6] }), 4);
});

test('averageSpeed: empty speed array returns null', () => {
  assert.equal(averageSpeed({ speed: [] }), null);
});

test('averageSpeed: null field returns null', () => {
  assert.equal(averageSpeed(null), null);
});

test('averageSpeed: undefined field returns null', () => {
  assert.equal(averageSpeed(undefined), null);
});

test('averageSpeed: field with no speed property returns null', () => {
  assert.equal(averageSpeed({}), null);
});

test('averageSpeed: all-zero array returns 0, not null (calm wind is valid data)', () => {
  assert.equal(averageSpeed({ speed: [0, 0, 0] }), 0);
});

test('averageSpeed: single-value array returns that value', () => {
  assert.equal(averageSpeed({ speed: [7.5] }), 7.5);
});
