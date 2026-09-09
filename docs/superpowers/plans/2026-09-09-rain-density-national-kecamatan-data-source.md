# Rain Density admin-region layer — national kecamatan data source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Rain Density admin-region layer's data source (currently BIG's live API, which only covers Sulawesi Tenggara) with a one-time-preprocessed national HDX dataset, and tighten the "no sensor nearby" behavior from a 25km gray fallback to a 9km hard exclude.

**Architecture:** A one-time offline script downloads/simplifies/remaps HDX's national kecamatan GeoJSON into the exact shape `normalizeRegions()` already expects (no changes to that function), bundled as a static JSON import. `/api/boundaries/route.js` drops the BIG proxy/cache entirely in favor of an in-memory bbox filter over this local data. `AdminRegionLayer.jsx` skips (rather than grays out) any kecamatan with no sensor within the new 9km cutoff.

**Tech Stack:** Next.js App Router route handlers, `node:test`, hand-written Douglas-Peucker simplification (no new dependency), Node's built-in `fs`/`fetch`.

**Spec:** docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md

## Global Constraints

- No new npm dependency (spec: "menambah dependency... untuk kebutuhan satu-kali-pakai ini" explicitly rejected — Douglas-Peucker is hand-written).
- No new user-facing copy or toggle — this plan only changes a data source and two internal thresholds.
- `src/lib/boundaryRegions.js`'s `normalizeRegions()` function is NOT modified — any new data source must already be shaped to match its expected input (GeoJSON FeatureCollection, `Polygon`/`MultiPolygon` geometry in `[lng,lat]` order, properties named `namobj`/`wadmkc`/`wadmkk`/`wadmpr`) before reaching it.
- `MAX_DISTANCE_KM` changes from 25 to **9** (matches `RAIN_KM = 9` in `src/components/map/CanvasOverlay.jsx:36`, verified current value).
- Regions with no sensor within `MAX_DISTANCE_KM` are **excluded** (not drawn at all), not rendered gray — this is a behavior change from the Kendari-only version.
- `route.js`'s BIG proxy, its 24h cache, `MAX_CACHE_ENTRIES`, and `maxAllowableOffsetForZoom()` are removed as dead code once no longer used — not left in place "just in case".
- Any code path whose correctness depends on a real downloaded file (the actual national dataset) must be clearly separated from code covered by fixture-based automated tests — never claim a fixture-based test proves the real 456MB HDX file parses correctly.

---

### Task 1: `simplifyPolygon.js` — Douglas-Peucker ring simplification (TDD)

**Files:**
- Create: `src/lib/simplifyPolygon.js`
- Test: `src/lib/simplifyPolygon.test.js`

**Interfaces:**
- Consumes: nothing from other tasks — fully self-contained, pure geometry.
- Produces: `simplifyRing(points, tolerance) -> Array<{lat, lng}>`. Consumed by Task 2 (`scripts/build-kecamatan-dataset.mjs`).

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/simplifyPolygon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyRing } from './simplifyPolygon.js';

test('simplifyRing: a simple square ring is unchanged at a small tolerance', () => {
  const square = [
    { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(square, 0.0001);
  assert.deepEqual(result, square);
});

test('simplifyRing: a near-collinear midpoint is dropped at a larger tolerance', () => {
  // Three points on (nearly) the same line: (0,0) -> (0,0.5) -> (0,1) is a
  // straight vertical segment; the midpoint carries no shape information.
  const ring = [
    { lat: 0, lng: 0 }, { lat: 0.5, lng: 0.0001 }, { lat: 1, lng: 0 },
    { lat: 1, lng: 1 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(ring, 0.01);
  assert.equal(result.length, 4);
  assert.deepEqual(result[0], { lat: 0, lng: 0 });
  assert.deepEqual(result[1], { lat: 1, lng: 0 });
});

test('simplifyRing: first and last points of a closed ring are always kept', () => {
  const ring = [
    { lat: 0, lng: 0 }, { lat: 0.5, lng: 0.0001 }, { lat: 1, lng: 0 },
    { lat: 1, lng: 1 }, { lat: 0, lng: 0 },
  ];
  const result = simplifyRing(ring, 0.01);
  assert.deepEqual(result[0], ring[0]);
  assert.deepEqual(result[result.length - 1], ring[ring.length - 1]);
});

test('simplifyRing: fewer than 4 points is returned unchanged (nothing to simplify)', () => {
  const tiny = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 0 }];
  assert.deepEqual(simplifyRing(tiny, 1), tiny);
});

test('simplifyRing: empty array returns empty array', () => {
  assert.deepEqual(simplifyRing([], 1), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/simplifyPolygon.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/simplifyPolygon.js

/**
 * Douglas-Peucker polyline simplification, hand-written rather than adding
 * a dependency (mapshaper/turf) for what is otherwise a one-time,
 * developer-run script (see scripts/build-kecamatan-dataset.mjs) — see
 * docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md.
 *
 * `tolerance` is in the SAME unit as the input coordinates (plain
 * lat/lng degrees, not meters) — chosen by trial against real output file
 * sizes, not derived from a distance formula. A ring shorter than 4 points
 * has nothing worth simplifying and is returned as-is.
 */
export function simplifyRing(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifySegment(points, 0, points.length - 1, tolerance, keep);
  return points.filter((_, i) => keep[i]);
}

function simplifySegment(points, startIdx, endIdx, tolerance, keep) {
  if (endIdx <= startIdx + 1) return;
  const start = points[startIdx];
  const end = points[endIdx];
  let maxDist = -1;
  let maxIdx = -1;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    keep[maxIdx] = true;
    simplifySegment(points, startIdx, maxIdx, tolerance, keep);
    simplifySegment(points, maxIdx, endIdx, tolerance, keep);
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  if (dx === 0 && dy === 0) {
    const ex = point.lng - lineStart.lng;
    const ey = point.lat - lineStart.lat;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy);
  const projLng = lineStart.lng + t * dx;
  const projLat = lineStart.lat + t * dy;
  const ex = point.lng - projLng;
  const ey = point.lat - projLat;
  return Math.sqrt(ex * ex + ey * ey);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/simplifyPolygon.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/simplifyPolygon.js src/lib/simplifyPolygon.test.js
git commit -m "feat: add simplifyRing (Douglas-Peucker) for one-time kecamatan data prep"
```

---

### Task 2: `scripts/build-kecamatan-dataset.mjs` — offline data-prep CLI

**Files:**
- Create: `scripts/build-kecamatan-dataset.mjs`
- Create: `src/data/kecamatan-indonesia.json` (initial SAMPLE output — see Step 4; this is placeholder wiring data, replaced with the real national dataset in Task 7, not a "TBD" — its content is fully specified below)

**Interfaces:**
- Consumes: `simplifyRing(points, tolerance)` from `src/lib/simplifyPolygon.js` (Task 1).
- Produces: `src/data/kecamatan-indonesia.json` — a GeoJSON `FeatureCollection` whose features already match what `normalizeRegions()` (in `src/lib/boundaryRegions.js`, UNCHANGED by this plan) expects: `geometry.type` is `"Polygon"` or `"MultiPolygon"` with `[lng, lat]` coordinate order, and `properties` has exactly `namobj`/`wadmkc`/`wadmkk`/`wadmpr` (string values). Consumed by Task 5 (`route.js`, via `import kecamatanGeoJSON from '@/data/kecamatan-indonesia.json'`).

This script has no automated test of its own (it does file I/O and is run manually by a developer, matching this repo's convention that scripts/route-handlers with I/O side effects aren't unit-tested — only `src/lib/*.js` pure functions are). It is verified by running it against a small fixture and inspecting the output (Step 4-5), and later for real in Task 7.

**Important — HDX field names are NOT yet confirmed against a real downloaded file.** The mapping below (`ADM3_EN`/`ADM2_EN`/`ADM1_EN`, plus a P-code field to detect the ADM3 admin level) follows the standard, near-universal OCHA/HDX "COD-AB" naming convention used across virtually all of their national administrative-boundary datasets — but this is a well-reasoned default, not a verified fact. Task 7's Step 1 confirms it against the real file and adjusts `FIELD_MAP`/`ADM3_LEVEL_FIELD` below if the real file differs — do not skip that check.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/build-kecamatan-dataset.mjs
//
// One-time, developer-run data-prep tool — NOT part of `npm run build` or
// `npm run deploy`. Converts a downloaded HDX "Indonesia - Subnational
// Administrative Boundaries" (cod-ab-idn) GeoJSON export into the compact,
// pre-simplified, BIG-field-shaped static file this app bundles at
// src/data/kecamatan-indonesia.json.
//
// Usage:
//   node scripts/build-kecamatan-dataset.mjs --inspect <path-to-hdx-file.geojson>
//     Prints the property keys of the first feature, so you can confirm
//     (or correct) FIELD_MAP/ADM3_LEVEL_FIELD below before converting.
//
//   node scripts/build-kecamatan-dataset.mjs <path-to-hdx-file.geojson>
//     Filters to ADM3 (kecamatan) features, remaps their properties to
//     BIG's field names, simplifies each polygon ring, and writes
//     src/data/kecamatan-indonesia.json.
//
// See docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simplifyRing } from '../src/lib/simplifyPolygon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', 'kecamatan-indonesia.json');

// Standard OCHA/HDX COD-AB field-naming convention — CONFIRM against the
// real downloaded file with --inspect before trusting this for a real run
// (see Task 7, Step 1 in the implementation plan).
const FIELD_MAP = {
  namobj: 'ADM3_EN',
  wadmkc: 'ADM3_EN',
  wadmkk: 'ADM2_EN',
  wadmpr: 'ADM1_EN',
};
// A feature is an ADM3 (kecamatan) record if it has a non-empty value for
// this field — HDX COD-AB files commonly bundle every admin level (0-4)
// in one FeatureCollection, distinguished by which ADM*_PCODE/EN fields
// are populated. CONFIRM against the real file with --inspect.
const ADM3_LEVEL_FIELD = 'ADM3_PCODE';

// Degrees, not meters — same unit simplifyRing() expects. Chosen to land
// in the same visual ballpark as BIG's own maxAllowableOffset=0.001
// (~111m at the equator) that the earlier Kendari-only version verified
// empirically; re-check against the real output file's size in Task 7
// rather than trusting this in isolation.
const SIMPLIFY_TOLERANCE_DEG = 0.001;

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon[0]);
  }
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates[0]];
  }
  return [];
}

function simplifyGeometry(geometry) {
  const rings = exteriorRings(geometry);
  if (rings.length === 0) return geometry;
  const simplifiedRings = rings.map((ring) => {
    const points = ring.map(([lng, lat]) => ({ lat, lng }));
    const simplified = simplifyRing(points, SIMPLIFY_TOLERANCE_DEG);
    return simplified.map((p) => [p.lng, p.lat]);
  });
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: simplifiedRings.map((ring) => [ring]) };
  }
  return { type: 'Polygon', coordinates: [simplifiedRings[0]] };
}

function remapFeature(feature) {
  const props = feature.properties || {};
  return {
    type: 'Feature',
    properties: {
      namobj: props[FIELD_MAP.namobj] || null,
      wadmkc: props[FIELD_MAP.wadmkc] || null,
      wadmkk: props[FIELD_MAP.wadmkk] || null,
      wadmpr: props[FIELD_MAP.wadmpr] || null,
    },
    geometry: simplifyGeometry(feature.geometry),
  };
}

function main() {
  const args = process.argv.slice(2);
  const inspectMode = args[0] === '--inspect';
  const inputPath = inspectMode ? args[1] : args[0];

  if (!inputPath) {
    console.error('Usage: node scripts/build-kecamatan-dataset.mjs [--inspect] <path-to-hdx-file.geojson>');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const features = raw.features || [];

  if (inspectMode) {
    const sample = features[0];
    console.log('First feature property keys:', sample ? Object.keys(sample.properties || {}) : '(no features found)');
    console.log('Total feature count:', features.length);
    return;
  }

  const adm3Features = features.filter((f) => Boolean(f.properties?.[ADM3_LEVEL_FIELD]));
  console.log(`Found ${adm3Features.length} ADM3 (kecamatan) features out of ${features.length} total.`);

  const output = {
    type: 'FeatureCollection',
    features: adm3Features.map(remapFeature),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`Wrote ${adm3Features.length} kecamatan to ${OUTPUT_PATH}`);
}

main();
```

- [ ] **Step 2: Write a small fixture to smoke-test the script's transformation logic**

Create `scripts/fixtures/sample-hdx-input.geojson` (a hand-written 3-feature
sample matching the assumed HDX shape — used only to prove the script's
own logic works, NOT a substitute for running it against the real file in
Task 7):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "ADM3_EN": "Menteng", "ADM3_PCODE": "ID3171040",
        "ADM2_EN": "Jakarta Pusat", "ADM1_EN": "DKI Jakarta"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [106.83, -6.19], [106.84, -6.19], [106.84, -6.18], [106.835, -6.185], [106.83, -6.18], [106.83, -6.19]
        ]]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "ADM2_EN": "Jakarta Pusat", "ADM2_PCODE": "ID3171", "ADM1_EN": "DKI Jakarta"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[106.8, -6.2], [106.9, -6.2], [106.9, -6.1], [106.8, -6.1], [106.8, -6.2]]]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "ADM3_EN": "Kendari Barat", "ADM3_PCODE": "ID7471040",
        "ADM2_EN": "Kota Kendari", "ADM1_EN": "Sulawesi Tenggara"
      },
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [[[
          [122.55, -3.99], [122.56, -3.99], [122.56, -3.98], [122.55, -3.98], [122.55, -3.99]
        ]]]
      }
    }
  ]
}
```

(The second feature is an ADM2/kabupaten record with no `ADM3_PCODE` —
included specifically to prove the level-filter correctly excludes it.)

- [ ] **Step 3: Run the script against the fixture, in both modes**

Run: `node scripts/build-kecamatan-dataset.mjs --inspect scripts/fixtures/sample-hdx-input.geojson`
Expected output includes: `First feature property keys: [ 'ADM3_EN', 'ADM3_PCODE', 'ADM2_EN', 'ADM1_EN' ]` and `Total feature count: 3`.

Run: `node scripts/build-kecamatan-dataset.mjs scripts/fixtures/sample-hdx-input.geojson`
Expected output: `Found 2 ADM3 (kecamatan) features out of 3 total.` followed by `Wrote 2 kecamatan to .../src/data/kecamatan-indonesia.json`.

- [ ] **Step 4: Inspect the written file by hand**

Run: `cat src/data/kecamatan-indonesia.json`
Expected: a `FeatureCollection` with exactly 2 features (Menteng, Kendari
Barat — NOT the Jakarta Pusat kabupaten record), each with
`properties: {namobj, wadmkc, wadmkk, wadmpr}` populated, and `geometry`
still valid `Polygon`/`MultiPolygon` GeoJSON (`[lng,lat]` order preserved).
This file is committed as-is for now — it's real, valid, `normalizeRegions()`-
compatible sample data (2 kecamatan: one in Jakarta, one in Kendari) that
lets every following task's code be written and tested against a real file
today. Task 7 replaces its content with the full national dataset; nothing
downstream needs to change when that happens.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-kecamatan-dataset.mjs scripts/fixtures/sample-hdx-input.geojson src/data/kecamatan-indonesia.json
git commit -m "feat: add build-kecamatan-dataset script + sample kecamatan-indonesia.json"
```

---

### Task 3: Tighten `MAX_DISTANCE_KM` from 25 to 9 (TDD)

**Files:**
- Modify: `src/lib/regionNearestSensor.js:9`
- Test: `src/lib/regionNearestSensor.test.js:16-20` (existing test rewritten, not added alongside)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MAX_DISTANCE_KM` now `9` (was `25`) — consumed by `resolveRegionBucket()` in the same file (unchanged signature) and by Task 6 (`AdminRegionLayer.jsx`, which imports `resolveRegionBucket` but not the constant directly).

The existing test `'resolveRegionBucket: station beyond MAX_DISTANCE_KM
returns null (no-data)'` uses a station >1000km away (Medan vs. Jakarta) —
that fixture is so far beyond ANY reasonable cutoff that it never actually
exercised the specific threshold value. Replace it with a station placed
just beyond the new 9km cutoff, so the test is genuinely tied to the
constant.

- [ ] **Step 1: Rewrite the test to straddle the new 9km cutoff**

In `src/lib/regionNearestSensor.test.js`, replace:

```js
test('resolveRegionBucket: station beyond MAX_DISTANCE_KM returns null (no-data)', () => {
  const stations = [{ id: 'faraway', lat: 3.5, lng: 98.6, isRaining: true }]; // Medan, >1000km from Jakarta
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, null);
});
```

with:

```js
test('resolveRegionBucket: station just beyond MAX_DISTANCE_KM (9km) returns null (no-data)', () => {
  // 0.1 degrees latitude is ~11.1km at this latitude — comfortably beyond
  // a 9km cutoff (unlike the old 25km cutoff, where 11.1km would have
  // resolved to a real bucket instead of null), so this test is actually
  // tied to the specific threshold value, not just "very far away".
  const stations = [{ id: 'just-too-far', lat: -6.3, lng: 106.8, isRaining: true }];
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, null);
});
```

- [ ] **Step 2: Run the test to verify it fails against the current 25km constant**

Run: `node --test src/lib/regionNearestSensor.test.js`
Expected: FAIL on the rewritten test — at 25km, a station ~11.1km away
resolves to `'raining'`, not `null`, so `assert.equal(bucket, null)` fails.

- [ ] **Step 3: Change the constant**

In `src/lib/regionNearestSensor.js`, replace:

```js
// Same filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — render netral (null), bukan warna yang menyesatkan. Estimate, not
// yet visually verified — tune after seeing it rendered against real
// sensor density.
export const MAX_DISTANCE_KM = 25;
```

with:

```js
// Same filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — dikecualikan sepenuhnya, bukan diwarnai netral (lihat
// AdminRegionLayer.jsx). Disamakan dengan RAIN_KM = 9 di CanvasOverlay.jsx
// supaya kedua mode Rain Density (blob & region) punya bahasa "seberapa
// jauh sensor bisa jujur mewakili suatu area" yang konsisten — bukan lagi
// estimasi terpisah seperti nilai 25 sebelumnya.
export const MAX_DISTANCE_KM = 9;
```

- [ ] **Step 4: Run the whole test file to verify it passes**

Run: `node --test src/lib/regionNearestSensor.test.js`
Expected: PASS (4 tests — the other 3 pre-existing tests use stations
either well within 9km, i.e. ~1.76km or 0km, or well beyond any cutoff,
i.e. no stations at all, so they were already unaffected by the constant
change).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regionNearestSensor.js src/lib/regionNearestSensor.test.js
git commit -m "feat: tighten region MAX_DISTANCE_KM from 25 to 9 (match CanvasOverlay's RAIN_KM)"
```

---

### Task 4: Remove `maxAllowableOffsetForZoom()` (dead code after the data-source switch)

**Files:**
- Modify: `src/lib/boundaryRegions.js:53-65` (delete the function and its comment block)
- Modify: `src/lib/boundaryRegions.test.js:3,48-57` (delete the import reference and the two tests)

**Interfaces:**
- Consumes: nothing.
- Produces: `src/lib/boundaryRegions.js` now exports only `normalizeRegions` — Task 5 (`route.js`) must NOT import `maxAllowableOffsetForZoom` (it no longer exists).

`normalizeRegions()` itself, including its `MultiPolygon` handling, is
UNCHANGED — do not touch it.

- [ ] **Step 1: Delete the function from `boundaryRegions.js`**

Remove this entire block (currently lines 53-65):

```js
// Server-side geometry generalization (BIG's `maxAllowableOffset` query
// param, in degrees) — verified empirically: 0.001 (~111m at the equator)
// shrank one city-sized viewport's response from ~7MB to ~35KB with no
// visible loss of shape. Estimates below REGION_LAYER_MIN_ZOOM (wider
// viewport, more polygons, needs more aggressive simplification) and above
// 14 (tight zoom, few polygons, can afford more detail) are NOT yet
// empirically verified against real payload sizes — tune after checking
// the Network tab at those zoom levels.
export function maxAllowableOffsetForZoom(zoom) {
  if (zoom >= 14) return 0.0005;
  if (zoom >= 12) return 0.001;
  return 0.003;
}
```

The file should now end right after the closing `}` of `normalizeRegions()`.

- [ ] **Step 2: Delete its tests and update the import in `boundaryRegions.test.js`**

Change the import line from:

```js
import { normalizeRegions, maxAllowableOffsetForZoom } from './boundaryRegions.js';
```

to:

```js
import { normalizeRegions } from './boundaryRegions.js';
```

Remove these two tests entirely:

```js
test('maxAllowableOffsetForZoom: smaller offset (more detail) at higher zoom', () => {
  assert.ok(maxAllowableOffsetForZoom(16) < maxAllowableOffsetForZoom(12));
  assert.ok(maxAllowableOffsetForZoom(12) < maxAllowableOffsetForZoom(10));
});

test('maxAllowableOffsetForZoom: never returns 0 or a negative number', () => {
  for (const z of [10, 11, 12, 13, 14, 15, 16, 17]) {
    assert.ok(maxAllowableOffsetForZoom(z) > 0);
  }
});
```

Leave the 3 `normalizeRegions` tests and the `MultiPolygon` test
completely untouched.

- [ ] **Step 3: Run the test file to confirm the remaining tests still pass**

Run: `node --test src/lib/boundaryRegions.test.js`
Expected: PASS (4 tests — down from 6, the 2 removed ones no longer run).

- [ ] **Step 4: Commit**

```bash
git add src/lib/boundaryRegions.js src/lib/boundaryRegions.test.js
git commit -m "refactor: remove maxAllowableOffsetForZoom (dead code after HDX static data switch)"
```

---

### Task 5: Rewrite `route.js` — static local data instead of a live BIG proxy

**Files:**
- Modify: `src/app/api/boundaries/route.js` (full rewrite)

**Interfaces:**
- Consumes: `normalizeRegions` from `src/lib/boundaryRegions.js` (Task 4's file, `maxAllowableOffsetForZoom` no longer exported); `src/data/kecamatan-indonesia.json` (Task 2's output — the 2-kecamatan sample for now, the full national file after Task 7).
- Produces: `GET /api/boundaries?north=&south=&east=&west=&zoom=` → `Response.json(Array<region>)` — SAME response shape as before (`useAdminBoundaries.js` and `AdminRegionLayer.jsx` need NO changes for this). `zoom` is still accepted as a query param (for call-site compatibility with `useAdminBoundaries`) but no longer affects anything.

No test file for this task — matches this repo's existing convention (no
route handler in `src/app/api/*` has a `.test.js`). Verified manually
against the sample data file in Step 3.

- [ ] **Step 1: Write the new route**

Replace the entire contents of `src/app/api/boundaries/route.js` with:

```js
import { normalizeRegions } from '@/lib/boundaryRegions';
import kecamatanGeoJSON from '@/data/kecamatan-indonesia.json';

/**
 * Serves kecamatan (district) administrative boundaries for the map's
 * current viewport, from a static national dataset bundled at build time
 * — not a live external proxy (see
 * docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md
 * for why: BIG's public live API, used by the previous version of this
 * route, turned out to only cover Sulawesi Tenggara — 66 kecamatan total,
 * verified by querying it with a whole-Indonesia bounding box). The
 * bundled file (src/data/kecamatan-indonesia.json) is produced once by
 * scripts/build-kecamatan-dataset.mjs from HDX's national dataset, already
 * simplified and already shaped to match normalizeRegions()'s expected
 * input — no per-request simplification or external fetch needed anymore.
 */

export const dynamic = 'force-dynamic';

// Normalized once per Worker instance (module scope), not per-request —
// the whole dataset is a few MB at most, filtering it in-memory per
// request is effectively instant, so unlike the old BIG-proxy version
// there is no need for a TTL cache here.
const ALL_REGIONS = normalizeRegions(kecamatanGeoJSON);

function regionIntersectsBbox(region, bbox) {
  for (const point of region.polygon) {
    if (point.lat >= bbox.south && point.lat <= bbox.north
      && point.lng >= bbox.west && point.lng <= bbox.east) {
      return true;
    }
  }
  return false;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  // `zoom` is still accepted for call-site compatibility with
  // useAdminBoundaries.js, but no longer used — the bundled dataset is
  // already simplified once, not re-simplified per request/zoom level.

  if (![north, south, east, west].every(Number.isFinite)) {
    return Response.json({ error: 'missing_bbox' }, { status: 400 });
  }

  const bbox = { north, south, east, west };
  const data = ALL_REGIONS.filter((region) => regionIntersectsBbox(region, bbox));
  return Response.json(data);
}
```

- [ ] **Step 2: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: PASS (all existing tests, no new ones added by this task).

- [ ] **Step 3: Verify manually against the sample data**

Start the dev server (`npm run dev`), then from another terminal:

```bash
curl -s "http://localhost:3000/api/boundaries?north=-6.1&south=-6.2&east=106.9&west=106.8" | python3 -m json.tool
```

Expected: a JSON array containing exactly the "Menteng" kecamatan from the
sample data (`name: "Menteng"`, `kabupaten: "Jakarta Pusat"`,
`provinsi: "DKI Jakarta"`).

```bash
curl -s "http://localhost:3000/api/boundaries?north=-3.85&south=-4.05&east=122.65&west=122.40" | python3 -m json.tool
```

Expected: a JSON array containing the "Kendari Barat" kecamatan.

```bash
curl -s "http://localhost:3000/api/boundaries?north=10&south=9&east=100&west=99"
```

Expected: `[]` (empty array — a bbox with no matching kecamatan in the
2-record sample dataset).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/boundaries/route.js
git commit -m "feat: serve boundaries from bundled static data instead of proxying BIG"
```

---

### Task 6: `AdminRegionLayer.jsx` — skip regions with no sensor in range, instead of graying them out

**Files:**
- Modify: `src/components/map/AdminRegionLayer.jsx:51-78`

**Interfaces:**
- Consumes: `resolveRegionBucket` (Task 3's tightened `MAX_DISTANCE_KM`), `bucketColor` (unchanged) — same imports as before.
- Produces: no external interface change — `<AdminRegionLayer regions={...} stations={...} />`'s props are unchanged; only its internal rendering behavior changes.

No test file for this task — matches this repo's existing convention for
canvas/`OverlayView` components. Verified manually in Step 3.

- [ ] **Step 1: Change the paint loop to skip no-data regions**

In `src/components/map/AdminRegionLayer.jsx`, inside the `paint()`
function, replace:

```js
      for (const region of regionsRef.current) {
        const bucket = resolveRegionBucket(region, stationsRef.current);
        // No-data regions reuse the "inactive" status color/tone — same
        // token as an inactive sensor dot, not a new color.
        const color = bucketColor(bucket || 'inactive');

        ctx.beginPath();
        region.polygon.forEach(({ lat, lng }, i) => {
          const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(lat, lng));
          const x = p.x - c._offsetX, y = p.y - c._offsetY;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();

        // Region fill is more transparent than a sensor dot — dots stay
        // the primary focus, regions are supporting context.
        ctx.globalAlpha = bucket ? 0.32 : 0.10;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Theme-aware border — a white 25%-alpha stroke reads too faintly
        // against the light basemap (same fix pattern as BmkgRainLayer.jsx's
        // DARK_ALPHA_FLOOR/LIGHT_ALPHA_FLOOR: light mode needs a higher
        // visibility floor than dark).
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)'; // real kecamatan border, kept subtle
        ctx.lineWidth = 1;
        ctx.stroke();
      }
```

with:

```js
      for (const region of regionsRef.current) {
        const bucket = resolveRegionBucket(region, stationsRef.current);
        // No sensor within MAX_DISTANCE_KM (9km, see regionNearestSensor.js)
        // — skip entirely rather than drawing a gray "no-data" fill. This
        // dataset is now nationwide, and most of rural Indonesia will never
        // be near a Nirmala sensor; graying every such kecamatan would
        // flood the screen with meaningless fill. Only draw kecamatan the
        // sensor network actually has something to say about.
        if (!bucket) continue;
        const color = bucketColor(bucket);

        ctx.beginPath();
        region.polygon.forEach(({ lat, lng }, i) => {
          const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(lat, lng));
          const x = p.x - c._offsetX, y = p.y - c._offsetY;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();

        // Region fill is more transparent than a sensor dot — dots stay
        // the primary focus, regions are supporting context.
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Theme-aware border — a white 25%-alpha stroke reads too faintly
        // against the light basemap (same fix pattern as BmkgRainLayer.jsx's
        // DARK_ALPHA_FLOOR/LIGHT_ALPHA_FLOOR: light mode needs a higher
        // visibility floor than dark).
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)'; // real kecamatan border, kept subtle
        ctx.lineWidth = 1;
        ctx.stroke();
      }
```

- [ ] **Step 2: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: PASS (this component has no test file itself; this confirms
nothing else broke).

- [ ] **Step 3: Verify manually in the browser**

1. `rm -rf .next`, restart the dev server.
2. Switch to Rain Density, zoom in past `REGION_LAYER_MIN_ZOOM` (10) over
   the Jakarta area (currently only the small "Menteng" sample kecamatan
   exists — a full national check happens in Task 7 once the real data is
   in place).
3. Confirm the Menteng polygon still renders (colored by its nearest
   sensor's status) if any Nirmala sensor is within 9km.
4. Confirm no gray "no-data" fill appears anywhere — a kecamatan with no
   sensor within 9km should show nothing, not a gray shape.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/AdminRegionLayer.jsx
git commit -m "feat: exclude (not gray out) kecamatan with no sensor within range"
```

---

### Task 7: Produce the real national dataset (manual, run directly — not blindly delegated)

**Files:**
- Modify: `src/data/kecamatan-indonesia.json` (replaced with real national data, same file Task 2 seeded with a 2-kecamatan sample)

**Interfaces:**
- Consumes: `scripts/build-kecamatan-dataset.mjs` (Task 2, unmodified).
- Produces: the real, final `src/data/kecamatan-indonesia.json` that Task 5's `route.js` already reads — no code changes needed anywhere else once this file is replaced.

This task involves downloading a large (~456MB) file and should be run
directly by whoever executes this plan (or a human), not delegated to a
constrained background agent without oversight — network access, disk
space, and Node heap size for a one-time local run are easier to reason
about on a real development machine than inside a sandboxed session.

- [ ] **Step 1: Download HDX's real national dataset**

```bash
curl -L -o /tmp/idn_admin_boundaries.geojson.zip \
  "https://data.humdata.org/dataset/84a1d98a-790b-4d66-9d14-bbfa48500802/resource/e1421da4-8f48-47d2-ac49-79ff5bfa4d24/download/idn_admin_boundaries.geojson.zip"
unzip -l /tmp/idn_admin_boundaries.geojson.zip
```

Expected: a listing of several `.geojson` files, one per admin level.
Find the one covering ADM3 (ADM0-4 naming is standard for this dataset —
look for a filename containing `adm3`, e.g. something like
`idn_admbnda_adm3_bps_...geojson`; use the actual name shown in the
listing, not a guess).

```bash
unzip -o /tmp/idn_admin_boundaries.geojson.zip -d /tmp/idn_admin_boundaries "<the ADM3 filename from the listing above>"
```

- [ ] **Step 2: Confirm the real field names before converting**

```bash
node scripts/build-kecamatan-dataset.mjs --inspect "/tmp/idn_admin_boundaries/<the ADM3 file>"
```

Expected: property keys printed. If they are NOT `ADM3_EN`/`ADM3_PCODE`/
`ADM2_EN`/`ADM1_EN` as assumed in Task 2's `FIELD_MAP`/`ADM3_LEVEL_FIELD`,
edit those two constants at the top of `scripts/build-kecamatan-dataset.mjs`
to match the real field names shown here before continuing — do not
proceed on the assumed names if this output disagrees with them.

- [ ] **Step 3: Run the real conversion**

```bash
node --max-old-space-size=4096 scripts/build-kecamatan-dataset.mjs "/tmp/idn_admin_boundaries/<the ADM3 file>"
```

(`--max-old-space-size=4096` raises Node's heap limit for this one-time
run — a national kecamatan file, even simplified, can be large enough to
need more than Node's default heap while it's still held as a parsed JS
object mid-conversion.)

Expected output: `Found <N> ADM3 (kecamatan) features out of <M> total.`
where N should be in the thousands (Indonesia has roughly 7,000+
kecamatan) — if N is close to 0 or suspiciously small, the
`ADM3_LEVEL_FIELD` guess from Step 2 is likely still wrong; re-check
against the real property keys.

- [ ] **Step 4: Sanity-check the output file**

```bash
python3 -c "
import json
d = json.load(open('src/data/kecamatan-indonesia.json'))
print('feature count:', len(d['features']))
provinces = set(f['properties']['wadmpr'] for f in d['features'])
print('distinct provinces:', len(provinces))
print('sample provinces:', sorted(provinces)[:5])
"
ls -lh src/data/kecamatan-indonesia.json
```

Expected: feature count in the thousands, distinct provinces in the
mid-30s (Indonesia currently has 38 provinces), and every feature's
`wadmpr`/`wadmkk`/`wadmkc`/`namobj` populated (not `null`) — a large
count of `null` values would mean the `FIELD_MAP` guess needs correcting,
same as Step 2.

- [ ] **Step 5: Verify the Cloudflare Worker bundle still builds within size limits**

```bash
npm run preview
```

Expected: the build completes without any warning about exceeding a
Worker script size limit. If it does warn, this plan's "bundle the whole
file as a JS import" approach (see the design spec's Approach A) needs
revisiting — do not silently ignore a size warning.

- [ ] **Step 6: Run the full test suite one more time**

Run: `npm test`
Expected: PASS — this step doesn't touch any tested code path directly,
but confirms nothing about the real (much larger) data file broke
`normalizeRegions()`'s assumptions (e.g. an unexpected geometry type not
covered by the `Polygon`/`MultiPolygon` handling).

- [ ] **Step 7: Manual end-to-end verification across multiple provinces**

1. `rm -rf .next`, restart the dev server.
2. Switch to Rain Density, zoom in past 10 over a city with dense Nirmala
   sensor coverage (check the live `/api/sensors` data or the Sensor
   Statistics panel to pick one with a real high count nearby — do not
   assume Jakarta without checking).
3. Confirm real kecamatan polygons render, colored correctly, with no
   gray no-data fill anywhere.
4. Zoom into a different, sensor-sparse province and confirm most/all
   kecamatan there simply don't render (not gray — actually absent).
5. Confirm Himawari/Mesh Map/BMKG/Sensor Spot modes are all unaffected.
6. Check the Network tab: `/api/boundaries` responses stay reasonably
   small (tens of KB, not megabytes) even though the underlying dataset
   is now national — the zoom gate keeps requested bboxes small.

- [ ] **Step 8: Commit**

```bash
git add src/data/kecamatan-indonesia.json
git commit -m "feat: replace sample kecamatan data with the real national HDX dataset"
```

Note: this commit will be large (the real file, likely several MB) —
that's expected, not a mistake to undo.

---

## Verification

End-to-end, after all 7 tasks:

1. `npm test` — all tests green.
2. `npm run preview` — Cloudflare Worker build succeeds with no bundle-size
   warning.
3. Browser, per Task 7 Step 7 — dense-sensor city shows colored polygons,
   sparse-sensor province shows mostly/entirely absent polygons (not
   gray), both themes legible, other modes unaffected.
4. No new npm dependency in `package.json` (`git diff package.json`
   across this whole plan should be empty).
