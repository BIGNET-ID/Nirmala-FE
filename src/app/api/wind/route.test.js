import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRainMm } from './route.js';

test('extractRainMm: prefers rain.1h when present', () => {
  assert.equal(extractRainMm({ rain: { '1h': 2.4, '3h': 6 } }), 2.4);
});

test('extractRainMm: falls back to rain.3h / 3 when 1h is absent', () => {
  assert.equal(extractRainMm({ rain: { '3h': 6 } }), 2);
});

test('extractRainMm: no rain key at all returns 0', () => {
  assert.equal(extractRainMm({}), 0);
  assert.equal(extractRainMm({ wind: { speed: 3 } }), 0);
});

test('extractRainMm: null/undefined input returns 0', () => {
  assert.equal(extractRainMm(null), 0);
  assert.equal(extractRainMm(undefined), 0);
});
