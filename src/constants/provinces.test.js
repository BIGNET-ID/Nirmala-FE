import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES } from './provinces.js';

test('PROVINCES has 38 entries (BPS 2023 province count)', () => {
  assert.equal(PROVINCES.length, 38);
});

test('PROVINCES codes are unique', () => {
  const codes = PROVINCES.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('every province has a valid bounding box (north > south, east > west)', () => {
  for (const p of PROVINCES) {
    assert.ok(p.bounds.north > p.bounds.south, `${p.name}: north <= south`);
    assert.ok(p.bounds.east > p.bounds.west, `${p.name}: east <= west`);
  }
});

test('DKI Jakarta uses BPS code 31 (matches PRD §7.2 sample payload)', () => {
  const jakarta = PROVINCES.find((p) => p.name === 'DKI Jakarta');
  assert.equal(jakarta?.code, '31');
});
