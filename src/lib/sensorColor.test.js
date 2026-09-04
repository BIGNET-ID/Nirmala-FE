import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusBucket } from './sensorColor.js';

test('statusBucket: category "active" with no rain is active', () => {
  assert.equal(statusBucket({ category: 'active', isRaining: false }), 'active');
});

test('statusBucket: category "raining" is raining', () => {
  assert.equal(statusBucket({ category: 'raining', isRaining: true }), 'raining');
});

test('statusBucket: category "unavailable" is unavailable', () => {
  assert.equal(statusBucket({ category: 'unavailable' }), 'unavailable');
});

test('statusBucket: category "inactive" is inactive, even though the backend also sets blacklisted=true and status="blacklisted" for these sensors', () => {
  // Real /api/sensors data: sensors the backend auto-retires end up with
  // blacklisted: true + status: 'blacklisted' + category: 'inactive' — the
  // legacy blacklisted/status check must not shadow this or every inactive
  // sensor disappears into the Blacklist bucket (the bug being fixed here).
  assert.equal(
    statusBucket({ category: 'inactive', blacklisted: true, manualBlacklisted: false, status: 'blacklisted', isRaining: false }),
    'inactive',
  );
});

test('statusBucket: manualBlacklisted outranks category — a deliberately banned sensor is always Blacklist', () => {
  assert.equal(statusBucket({ category: 'active', manualBlacklisted: true }), 'blacklisted');
  assert.equal(statusBucket({ category: 'inactive', manualBlacklisted: true }), 'blacklisted');
});

test('statusBucket: falls back to boolean flags when category is absent (e.g. older fixture data)', () => {
  assert.equal(statusBucket({ isRaining: false, unavailable: true, inactive: true }), 'inactive');
  assert.equal(statusBucket({ isRaining: false, unavailable: true }), 'unavailable');
  assert.equal(statusBucket({ isRaining: true }), 'raining');
  assert.equal(statusBucket({ blacklisted: true }), 'blacklisted');
  assert.equal(statusBucket({ status: 'blacklisted' }), 'blacklisted');
});

test('statusBucket: no flags and no category at all defaults to active', () => {
  assert.equal(statusBucket({}), 'active');
});
