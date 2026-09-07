import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precipToT } from './bmkgWeather.js';

test('precipToT: 0 mm returns 0 (no rain)', () => {
  assert.equal(precipToT(0), 0);
});

test('precipToT: negative mm returns 0', () => {
  assert.equal(precipToT(-1), 0);
});

test('precipToT: NaN returns 0', () => {
  assert.equal(precipToT(NaN), 0);
});

test('precipToT: exactly at Rendah/Sedang breakpoint (2.5mm) returns 0.25', () => {
  assert.equal(precipToT(2.5), 0.25);
});

test('precipToT: exactly at Sedang/Tinggi breakpoint (7.5mm) returns 0.5', () => {
  assert.equal(precipToT(7.5), 0.5);
});

test('precipToT: exactly at Tinggi/Ekstrem breakpoint (15mm) returns 0.75', () => {
  assert.equal(precipToT(15), 0.75);
});

test('precipToT: value inside Rendah band interpolates linearly', () => {
  assert.equal(precipToT(1.25), 0.125);
});

test('precipToT: value just above 15mm continues past 0.75 toward 1', () => {
  assert.equal(precipToT(22.5), 0.875);
});

test('precipToT: value far above Ekstrem caps at 1', () => {
  assert.equal(precipToT(1000), 1);
});
