import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusBucket } from './sensorColor.js';

const NOW = new Date('2026-09-02T12:00:00Z').getTime();
const hoursAgo = (h) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

test('statusBucket: fresh data (well under 2h) is active', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(0.1), isRaining: false }, NOW), 'active');
});

test('statusBucket: fresh data with isRaining is raining', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(0.1), isRaining: true }, NOW), 'raining');
});

test('statusBucket: unreachable for exactly 2h becomes unavailable', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(2), isRaining: false }, NOW), 'unavailable');
});

test('statusBucket: unreachable for 10h (under 24h) stays unavailable', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(10), isRaining: false }, NOW), 'unavailable');
});

test('statusBucket: unavailable outranks isRaining (stale raining flag)', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(3), isRaining: true }, NOW), 'unavailable');
});

test('statusBucket: no data for exactly 24h becomes inactive', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(24), isRaining: false }, NOW), 'inactive');
});

test('statusBucket: no data for 48h stays inactive', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(48), isRaining: false }, NOW), 'inactive');
});

test('statusBucket: blacklisted outranks inactive even when stale for 48h', () => {
  assert.equal(statusBucket({ lastUpdate: hoursAgo(48), blacklisted: true }, NOW), 'blacklisted');
});

test('statusBucket: falls back to scrapedAt when lastUpdate is missing', () => {
  assert.equal(statusBucket({ scrapedAt: hoursAgo(25), isRaining: false }, NOW), 'inactive');
});

test('statusBucket: no timestamp at all defaults to active/raining precedence, never crashes', () => {
  assert.equal(statusBucket({ isRaining: false }, NOW), 'active');
  assert.equal(statusBucket({ isRaining: true }, NOW), 'raining');
});

test('statusBucket: defaults now to current time when omitted', () => {
  assert.equal(statusBucket({ isRaining: false }), 'active');
});
