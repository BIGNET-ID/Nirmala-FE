import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJmaHimawariBasetime, buildJmaHimawariTileUrl, roundDownToStep } from './jmaHimawari.js';

test('buildJmaHimawariBasetime formats a UTC date as YYYYMMDDHHMMSS', () => {
  const date = new Date(Date.UTC(2026, 7, 21, 2, 30, 0)); // 2026-08-21T02:30:00Z
  assert.equal(buildJmaHimawariBasetime(date), '20260821023000');
});

test('buildJmaHimawariBasetime pads single-digit month/day/hour/minute', () => {
  const date = new Date(Date.UTC(2026, 0, 5, 3, 40, 0)); // 2026-01-05T03:40:00Z
  assert.equal(buildJmaHimawariBasetime(date), '20260105034000');
});

test('buildJmaHimawariTileUrl builds the JMA satimg tile pattern', () => {
  const url = buildJmaHimawariTileUrl('20260821023000', 5, 26, 12);
  assert.equal(
    url,
    'https://www.jma.go.jp/bosai/himawari/data/satimg/20260821023000/fd/20260821023000/SND/ETC/5/26/12.jpg',
  );
});

test('roundDownToStep still rounds down to a 10-minute UTC boundary', () => {
  const date = new Date(Date.UTC(2026, 7, 21, 2, 37, 45));
  const rounded = roundDownToStep(date);
  assert.equal(rounded.toISOString(), '2026-08-21T02:30:00.000Z');
});
