import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNearestKabupaten } from './bmkgHydration.js';

const SAMPLE = [
  { kab: '11.01', name: 'Kabupaten Aceh Selatan', lat: 3.2548, lon: 97.1741 },
  { kab: '11.02', name: 'Kabupaten Aceh Tenggara', lat: 3.4734, lon: 97.8192 },
  { kab: '11.03', name: 'Kabupaten Aceh Timur', lat: 4.9327, lon: 97.7838 },
];

test('findNearestKabupaten: returns the closest kabupaten by real distance', () => {
  // A point right on top of Aceh Selatan's coordinate should return Aceh Selatan.
  const result = findNearestKabupaten(3.2548, 97.1741, SAMPLE);
  assert.equal(result.kab, '11.01');
});

test('findNearestKabupaten: picks the true nearest even when it is not first in the array', () => {
  // Close to Aceh Timur (4.9327, 97.7838), which is last in SAMPLE.
  const result = findNearestKabupaten(4.9, 97.8, SAMPLE);
  assert.equal(result.kab, '11.03');
});

test('findNearestKabupaten: empty kabupaten array returns null', () => {
  assert.equal(findNearestKabupaten(3.25, 97.17, []), null);
});

test('findNearestKabupaten: single-entry array always returns that entry', () => {
  const result = findNearestKabupaten(0, 0, [SAMPLE[1]]);
  assert.equal(result.kab, '11.02');
});
