# Rain Density Admin Region Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rain Density mode colors real kecamatan polygons (from BIG's public
geospatial API) by their nearest sensor's status, as a zoom-gated
alternative to the existing 9km KDE blob — no Voronoi/Delaunay, no new
dependency.

**Architecture:** A new `/api/boundaries` route proxies BIG's ArcGIS REST
service (same fetch+in-memory-cache-by-bbox shape as the existing
`/api/wind/route.js`), returning simplified kecamatan polygons for the
current viewport. A new `useAdminBoundaries` hook fetches them while Rain
Density is active and zoomed in enough. A new `AdminRegionLayer` component
(4th instance of the established `google.maps.OverlayView` canvas pattern
already used by `CanvasOverlay.jsx`/`MeshLayer.jsx`/`BmkgRainLayer.jsx`)
paints each polygon, colored by its nearest sensor's status (reusing
`SENSOR_STATUS_COLOR`, resolved via haversine distance — reusing
`haversineKm` from `meshTopology.js`). `page.jsx` swaps between this layer
and the existing KDE blob based on zoom, with no new user-facing toggle.

**Tech Stack:** Next.js API route (Node fetch), React hook, Google Maps
`OverlayView` + Canvas 2D — no new npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md`

## Global Constraints

- No new npm dependency (explicit design decision in the spec — no
  `d3-delaunay`, no polygon-clipping library).
- No new user-facing copy/toggle — this is a rendering swap inside the
  existing Rain Density mode, gated by zoom only.
- Follow the existing `google.maps.OverlayView` + Canvas 2D pattern exactly
  as `CanvasOverlay.jsx`/`MeshLayer.jsx`/`BmkgRainLayer.jsx` already do —
  this is the 4th instance of that pattern, not a new one.
- Colors reuse `SENSOR_STATUS_COLOR`/`SENSOR_STATUS_COLOR_DARK` from
  `src/lib/sensorColor.js` exactly — no new hex values.
- API route caching mirrors `src/app/api/wind/route.js`'s in-memory,
  keyed-by-rounded-bbox pattern exactly.
- Tests: `node:test` + `node:assert/strict` (`npm test` runs `node --test`),
  test files sit next to their source file (`foo.js` → `foo.test.js`). Only
  pure functions in `src/lib/*.js` get unit tests in this repo — no
  existing test file covers a route handler, a hook, or an
  `OverlayView`/canvas component, and this plan doesn't add the first one.
- Any newly-introduced tunable constant (`REGION_LAYER_MIN_ZOOM`,
  `MAX_DISTANCE_KM`, `maxAllowableOffsetForZoom`'s breakpoints) must be
  commented in code as an estimate needing visual verification — mirrors
  `RAIN_KM`/`RAIN_MIN`/`RAIN_MAX` in `CanvasOverlay.jsx`.
- Internal coordinate convention across this whole feature is `{lat, lng}`
  objects (matching `station.lat`/`station.lng`, `MAP_CENTER`, and
  `haversineKm(a, b)`'s actual signature — it reads `a.lat`/`a.lng`/
  `b.lat`/`b.lng`, **not** `[lat, lng]` arrays). BIG's GeoJSON response
  coordinates are `[lng, lat]` (GeoJSON spec order) — this MUST be flipped
  to `{lat, lng}` when normalizing, or every distance/rendering calculation
  downstream is silently wrong.

---

### Task 1: `REGION_LAYER_MIN_ZOOM` constant

**Files:**
- Modify: `src/constants/mapConfig.js:32-33`

**Interfaces:**
- Produces: `REGION_LAYER_MIN_ZOOM` (number), imported by Task 3
  (`boundaryRegions.js`) and Task 7 (`page.jsx`).

- [ ] **Step 1: Add the constant**

In `src/constants/mapConfig.js`, right after the existing zoom constants:

```js
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 17;

// Rain Density's admin-region layer (AdminRegionLayer.jsx) only makes sense
// once the viewport is small enough that individual kecamatan polygons are
// legible and not too numerous to fetch/render cheaply — below this zoom,
// Rain Density keeps showing the existing KDE blob (CanvasOverlay.jsx)
// instead. Estimate, not yet visually verified — mirrors RAIN_KM/RAIN_MIN/
// RAIN_MAX in CanvasOverlay.jsx, which went through the same "guess, then
// verify in-browser" tuning pass earlier in this project.
export const REGION_LAYER_MIN_ZOOM = 10;
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/mapConfig.js
git commit -m "feat: add REGION_LAYER_MIN_ZOOM constant for admin-region Rain Density layer"
```

---

### Task 2: `regionNearestSensor.js` — nearest-sensor resolution (TDD)

**Files:**
- Create: `src/lib/regionNearestSensor.js`
- Test: `src/lib/regionNearestSensor.test.js`

**Interfaces:**
- Consumes: `haversineKm(a, b)` from `src/lib/meshTopology.js` — signature
  `haversineKm({lat, lng}, {lat, lng}) -> number` (kilometers).
  `statusBucket(st)` from `src/lib/sensorColor.js` — signature
  `statusBucket(station) -> 'active'|'raining'|'unavailable'|'inactive'|'blacklisted'`.
- Produces: `resolveRegionBucket(region, stations) -> bucket string | null`,
  consumed by Task 6 (`AdminRegionLayer.jsx`). `region` is
  `{ centroid: {lat, lng}, ... }`; `stations` is an array of station
  objects with `.lat`/`.lng` (same shape as `SENSOR_STATIONS` in `page.jsx`).
  `null` means "no sensor within `MAX_DISTANCE_KM`" (no-data).

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/regionNearestSensor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegionBucket } from './regionNearestSensor.js';

const region = (lat, lng) => ({ centroid: { lat, lng } });

test('resolveRegionBucket: picks the nearest station\'s status', () => {
  const stations = [
    { id: 'far', lat: -6.9, lng: 107.6, isRaining: false },   // ~farther
    { id: 'near', lat: -6.201, lng: 106.816, isRaining: true }, // ~closer, raining
  ];
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, 'raining');
});

test('resolveRegionBucket: station beyond MAX_DISTANCE_KM returns null (no-data)', () => {
  const stations = [{ id: 'faraway', lat: 3.5, lng: 98.6, isRaining: true }]; // Medan, >1000km from Jakarta
  const bucket = resolveRegionBucket(region(-6.2, 106.8), stations);
  assert.equal(bucket, null);
});

test('resolveRegionBucket: no stations at all returns null', () => {
  assert.equal(resolveRegionBucket(region(-6.2, 106.8), []), null);
});

test('resolveRegionBucket: a station right at the region centroid resolves to its own bucket', () => {
  const stations = [{ id: 'exact', lat: -6.2, lng: 106.8, blacklisted: true }];
  assert.equal(resolveRegionBucket(region(-6.2, 106.8), stations), 'blacklisted');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/regionNearestSensor.test.js`
Expected: FAIL — `Cannot find module './regionNearestSensor.js'` (file
doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```js
// src/lib/regionNearestSensor.js
import { haversineKm } from '@/lib/meshTopology';
import { statusBucket } from '@/lib/sensorColor';

// Same filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — render netral (null), bukan warna yang menyesatkan. Estimate, not
// yet visually verified — tune after seeing it rendered against real
// sensor density.
export const MAX_DISTANCE_KM = 25;

/**
 * Resolves which sensor-status bucket a kecamatan region should be colored
 * with — the bucket of its nearest sensor, or `null` if no sensor is
 * within MAX_DISTANCE_KM (render as no-data instead of a misleadingly
 * distant status).
 */
export function resolveRegionBucket(region, stations) {
  let best = null;
  let bestKm = Infinity;
  for (const st of stations) {
    if (typeof st.lat !== 'number' || typeof st.lng !== 'number') continue;
    const km = haversineKm(region.centroid, st);
    if (km < bestKm) {
      bestKm = km;
      best = st;
    }
  }
  return best && bestKm <= MAX_DISTANCE_KM ? statusBucket(best) : null;
}
```

Note: `@/lib/meshTopology` doesn't currently export anything module-alias
issues — it's already imported this way elsewhere in the codebase (e.g.
`MeshLayer.jsx:5`), so the `@/` path alias is confirmed to work for `.js`
imports from `src/lib`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/regionNearestSensor.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regionNearestSensor.js src/lib/regionNearestSensor.test.js
git commit -m "feat: add resolveRegionBucket for nearest-sensor region coloring"
```

---

### Task 3: `boundaryRegions.js` — GeoJSON normalization + payload tuning (TDD)

**Files:**
- Create: `src/lib/boundaryRegions.js`
- Test: `src/lib/boundaryRegions.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks — `maxAllowableOffsetForZoom`'s
  zoom breakpoints are a separate concern from `REGION_LAYER_MIN_ZOOM`
  (Task 1 gates "region layer vs. blob"; this gates "how aggressively to
  simplify geometry" and only ever runs for zooms where the region layer
  is already active, so it doesn't need to import that constant too).
- Produces:
  - `normalizeRegions(geojson) -> Array<{ id, name, kecamatan, kabupaten, provinsi, polygon, centroid }>`
    — `polygon` is `Array<{lat, lng}>` (exterior ring only), `centroid` is
    `{lat, lng}`. Consumed by Task 4 (`route.js`) and, via the API
    response, by Task 5 (`useAdminBoundaries.js`) and Task 6
    (`AdminRegionLayer.jsx`).
  - `maxAllowableOffsetForZoom(zoom) -> number` — consumed by Task 4
    (`route.js`).

- [ ] **Step 1: Write the failing tests**

Use the REAL shape captured earlier this session via `curl` against BIG's
live API (Kendari, Sulawesi Tenggara) — not fabricated:

```js
// src/lib/boundaryRegions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegions, maxAllowableOffsetForZoom } from './boundaryRegions.js';

const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { namobj: 'Wundumbatu', wadmkc: 'Poasia', wadmkk: 'Kota Kendari', wadmpr: 'Sulawesi Tenggara' },
      geometry: {
        type: 'Polygon',
        // GeoJSON coordinate order is [lng, lat] — a simple square around
        // roughly Kendari's real coordinates, not the true detailed shape.
        coordinates: [[
          [122.55, -3.99], [122.56, -3.99], [122.56, -3.98], [122.55, -3.98], [122.55, -3.99],
        ]],
      },
    },
  ],
};

test('normalizeRegions: flips GeoJSON [lng,lat] to {lat,lng}, keeps only needed fields', () => {
  const [region] = normalizeRegions(SAMPLE_GEOJSON);
  assert.equal(region.name, 'Wundumbatu');
  assert.equal(region.kecamatan, 'Poasia');
  assert.equal(region.kabupaten, 'Kota Kendari');
  assert.equal(region.provinsi, 'Sulawesi Tenggara');
  assert.equal(region.polygon.length, 5);
  assert.deepEqual(region.polygon[0], { lat: -3.99, lng: 122.55 });
});

test('normalizeRegions: centroid is the average of the polygon vertices', () => {
  const [region] = normalizeRegions(SAMPLE_GEOJSON);
  // Average of the 5 ring points above (first==last corner counted twice,
  // matching a plain arithmetic mean over the ring as returned by BIG).
  const expectedLat = (-3.99 + -3.99 + -3.98 + -3.98 + -3.99) / 5;
  const expectedLng = (122.55 + 122.56 + 122.56 + 122.55 + 122.55) / 5;
  assert.ok(Math.abs(region.centroid.lat - expectedLat) < 1e-9);
  assert.ok(Math.abs(region.centroid.lng - expectedLng) < 1e-9);
});

test('normalizeRegions: empty/missing features returns an empty array', () => {
  assert.deepEqual(normalizeRegions({ type: 'FeatureCollection', features: [] }), []);
  assert.deepEqual(normalizeRegions({}), []);
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/boundaryRegions.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/boundaryRegions.js

/**
 * Maps BIG's ArcGIS REST GeoJSON response (see route.js) into the compact
 * shape this app actually uses. Two things this deliberately does:
 *  - Flips coordinate order: GeoJSON polygons are [lng, lat] per spec; this
 *    app's own convention everywhere else (station.lat/lng, MAP_CENTER,
 *    haversineKm) is {lat, lng}. Getting this backwards silently breaks
 *    every distance/rendering calculation downstream.
 *  - Drops every field BIG returns that isn't actually used (kode BPS/PUM,
 *    metadata, luas wilayah, etc.) — keeps the payload sent to the client
 *    as small as the already-simplified geometry.
 *  - Uses only the exterior ring (coordinates[0]) — kecamatan polygons
 *    with holes (an enclave village, say) are rare enough at this zoom
 *    range that rendering the hole isn't worth the extra complexity;
 *    YAGNI for this iteration.
 */
export function normalizeRegions(geojson) {
  const features = geojson?.features || [];
  return features.map((feature, i) => {
    const props = feature?.properties || {};
    const ring = feature?.geometry?.coordinates?.[0] || [];
    const polygon = ring.map(([lng, lat]) => ({ lat, lng }));
    const centroid = polygon.length
      ? {
          lat: polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length,
          lng: polygon.reduce((sum, p) => sum + p.lng, 0) / polygon.length,
        }
      : { lat: 0, lng: 0 };
    return {
      id: `${props.wadmkc || 'unknown'}-${i}`,
      name: props.namobj || null,
      kecamatan: props.wadmkc || null,
      kabupaten: props.wadmkk || null,
      provinsi: props.wadmpr || null,
      polygon,
      centroid,
    };
  });
}

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/boundaryRegions.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/boundaryRegions.js src/lib/boundaryRegions.test.js
git commit -m "feat: add normalizeRegions/maxAllowableOffsetForZoom for BIG boundary data"
```

---

### Task 4: `/api/boundaries` route — BIG proxy with bbox cache

**Files:**
- Create: `src/app/api/boundaries/route.js`

**Interfaces:**
- Consumes: `normalizeRegions`, `maxAllowableOffsetForZoom` from
  `src/lib/boundaryRegions.js` (Task 3).
- Produces: `GET /api/boundaries?north=&south=&east=&west=&zoom=` →
  `Response.json(Array<region>)` on success, `Response.json({error}, {status})`
  on failure — same shape `normalizeRegions` returns. Consumed by Task 5
  (`useAdminBoundaries.js`).

No test file for this task — matches this repo's existing convention (no
route handler in `src/app/api/*` has a `.test.js`; `/api/wind/route.js`,
the closest analog, doesn't either). Verified manually in Step 3 instead.

- [ ] **Step 1: Write the route**

```js
// src/app/api/boundaries/route.js
import { normalizeRegions, maxAllowableOffsetForZoom } from '@/lib/boundaryRegions';

/**
 * Proxies Badan Informasi Geospasial's (BIG) public ArcGIS REST service for
 * kecamatan (district) administrative boundaries, scoped to the map's
 * current viewport — never downloads a nationwide dataset (the full
 * kelurahan-level dataset from other public sources runs >2GB; querying
 * BIG per-bbox with server-side geometry simplification keeps a
 * city-sized viewport around 35KB, verified empirically).
 *
 * See docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md
 */

export const dynamic = 'force-dynamic';

const BIG_ENDPOINT = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer/14/query';
// Administrative boundaries basically never change — cache far longer
// than weather data (compare VIEWPORT_TTL_MS = 20 minutes in
// src/app/api/wind/route.js).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
const boundsCache = new Map(); // key -> { t, data }

function roundBbox(b) {
  // ~0.05° (~5.5km at the equator) — fine enough that a small pan doesn't
  // silently return a stale-but-wrong-area cached response, coarse enough
  // that repeated small pans/zooms within the same neighborhood still hit
  // the cache.
  const r = (n) => Math.round(n / 0.05) * 0.05;
  return `${r(b.north)},${r(b.south)},${r(b.east)},${r(b.west)}`;
}

function evictOldest() {
  if (boundsCache.size < MAX_CACHE_ENTRIES) return;
  const oldestKey = [...boundsCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]?.[0];
  if (oldestKey) boundsCache.delete(oldestKey);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  const zoom = parseFloat(searchParams.get('zoom'));

  if (![north, south, east, west].every(Number.isFinite)) {
    return Response.json({ error: 'missing_bbox' }, { status: 400 });
  }

  const key = roundBbox({ north, south, east, west });
  const cached = boundsCache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) {
    return Response.json(cached.data, { headers: { 'x-cache': 'hit' } });
  }

  const geometry = JSON.stringify({
    xmin: west, ymin: south, xmax: east, ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const offset = maxAllowableOffsetForZoom(Number.isFinite(zoom) ? zoom : 10);
  const url = `${BIG_ENDPOINT}?geometry=${encodeURIComponent(geometry)}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=namobj,wadmkc,wadmkk,wadmpr&maxAllowableOffset=${offset}&f=geojson`;

  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const geojson = await r.json();
    const data = normalizeRegions(geojson);
    boundsCache.set(key, { t: Date.now(), data });
    evictOldest();
    return Response.json(data, { headers: { 'x-cache': 'miss' } });
  } catch (error) {
    console.warn('[api/boundaries] BIG fetch failed:', error.message);
    return Response.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/boundaries/route.js
git commit -m "feat: add /api/boundaries proxy for BIG kecamatan polygons"
```

- [ ] **Step 3: Verify manually against the live BIG API**

Start the dev server (`npm run dev` or the project's usual command), then
from another terminal:

```bash
curl -s "http://localhost:3000/api/boundaries?north=-3.85&south=-4.05&east=122.65&west=122.4&zoom=12" | head -c 500
```

Expected: a JSON array of objects shaped
`{ id, name, kecamatan, kabupaten, provinsi, polygon: [{lat,lng},...], centroid: {lat,lng} }`,
with `kabupaten` reading `"Kota Kendari"` or similar (real Sulawesi
Tenggara kecamatan names, per the same bbox already spot-checked directly
against BIG earlier this session). Run it a second time immediately after
— response should come back noticeably faster (cache hit; check the
`x-cache` response header is `hit`).

---

### Task 5: `useAdminBoundaries` hook

**Files:**
- Create: `src/hooks/useAdminBoundaries.js`

**Interfaces:**
- Consumes: `LAYER_STATUS` from `src/constants/layerStatus.js` (already
  used by `useVolcanoes.js`/`useBmkgWeather.js` for the same
  loading/ok/error/empty pattern).
- Produces: `useAdminBoundaries(bounds, zoom, active) -> { regions, status }`.
  `bounds` is `{north,south,east,west}` or `null` (same shape as page.jsx's
  existing `mapBounds` state — pass it straight through). `active` is a
  boolean (page.jsx will pass
  `activeLayer === 'rain' && currentZoom >= REGION_LAYER_MIN_ZOOM`).
  Consumed by Task 7 (`page.jsx`).

No test file — matches this repo's convention that hooks aren't unit
tested (no existing `src/hooks/*.test.js`). Verified manually in Task 7.

- [ ] **Step 1: Write the hook**

```js
// src/hooks/useAdminBoundaries.js
'use client';

import { useEffect, useState } from 'react';
import { LAYER_STATUS } from '@/constants/layerStatus';

/**
 * Fetches kecamatan boundary polygons for the current viewport from
 * /api/boundaries — only while `active` (Rain Density mode AND zoomed in
 * past REGION_LAYER_MIN_ZOOM, see page.jsx), refetching whenever `bounds`
 * or `zoom` changes. Same "only fetch while active" convention as
 * useVolcanoes.js/useBmkgWeather.js.
 */
export function useAdminBoundaries(bounds, zoom, active) {
  const [regions, setRegions] = useState([]);
  const [status, setStatus] = useState(LAYER_STATUS.IDLE);

  useEffect(() => {
    if (!active || !bounds) {
      setStatus(LAYER_STATUS.IDLE);
      return;
    }
    let alive = true;

    (async () => {
      setStatus(LAYER_STATUS.LOADING);
      try {
        const qs = `?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}&zoom=${zoom}`;
        const r = await fetch(`/api/boundaries${qs}`, { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        setRegions(list);
        setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
      } catch (err) {
        if (!alive) return;
        console.warn('[useAdminBoundaries] /api/boundaries unavailable:', err.message);
        setRegions([]);
        setStatus(LAYER_STATUS.ERROR);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, zoom, active]);

  return { regions, status };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAdminBoundaries.js
git commit -m "feat: add useAdminBoundaries hook"
```

---

### Task 6: `AdminRegionLayer.jsx` — canvas rendering

**Files:**
- Create: `src/components/map/AdminRegionLayer.jsx`
- Modify: `src/lib/sensorColor.js` (add `bucketColor` export, described below)

**Interfaces:**
- Consumes:
  - `resolveRegionBucket` from `src/lib/regionNearestSensor.js` (Task 2).
  - `bucketColor(bucket) -> hex string` from `src/lib/sensorColor.js` — NEW
    export this task adds (see Step 1 below); resolves a bucket name
    (including a synthetic `'inactive'` used here for "no data") to the
    correct light/dark-mode hex, the same logic `statusColor(st)` already
    uses internally but now available for a bucket string directly (this
    layer resolves the bucket itself via `resolveRegionBucket`, not from a
    single station).
- Produces: `<AdminRegionLayer regions={Array} stations={Array} />` (no
  return value/ref — same "renders into the map via OverlayView, returns
  null" shape as `CanvasOverlay.jsx`/`MeshLayer.jsx`/`BmkgRainLayer.jsx`).
  Consumed by Task 7 (`page.jsx`).

No test file for the component itself — matches
`CanvasOverlay.jsx`/`MeshLayer.jsx`/`BmkgRainLayer.jsx`, none of which have
one (canvas/`OverlayView` code isn't easily unit-testable without heavy DOM
mocking, and this repo's existing convention is to skip that rather than
force it). `bucketColor` (a small pure addition to an already-tested-by-
association file) also isn't given a dedicated test — see Step 1's
rationale.

- [ ] **Step 1: Add `bucketColor` to `sensorColor.js`**

In `src/lib/sensorColor.js`, `statusColor()` currently inlines the
dark/light bucket-to-hex lookup. Extract that lookup into its own exported
function so `AdminRegionLayer.jsx` can resolve a color from a bucket name
directly (it already has the bucket, from `resolveRegionBucket`, not a
station object):

```js
// Replace the existing statusColor() function (near the bottom of the
// file) with:
export function bucketColor(bucket) {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return (isDark && SENSOR_STATUS_COLOR_DARK[bucket]) || SENSOR_STATUS_COLOR[bucket];
}

export function statusColor(st) {
  return bucketColor(statusBucket(st));
}
```

This is a pure refactor — `statusColor(st)`'s behavior is unchanged
(confirm by re-running `node --test src/lib/sensorColor.test.js`, which
already covers `statusBucket`; it should stay green since that function
isn't touched).

- [ ] **Step 2: Run the existing sensorColor tests to confirm nothing broke**

Run: `node --test src/lib/sensorColor.test.js`
Expected: PASS (unchanged from before this edit).

- [ ] **Step 3: Write `AdminRegionLayer.jsx`**

```jsx
// src/components/map/AdminRegionLayer.jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { resolveRegionBucket } from '@/lib/regionNearestSensor';
import { bucketColor } from '@/lib/sensorColor';

/**
 * Rain Density's admin-region view — colors each kecamatan polygon (from
 * useAdminBoundaries, ultimately BIG's public API) by its nearest sensor's
 * status. Alternative to the KDE blob (CanvasOverlay.jsx) at higher zoom —
 * see page.jsx for the zoom-gated swap and
 * docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md
 * for why (real kecamatan boundaries instead of an invented radial
 * gradient). Same google.maps.OverlayView + Canvas 2D pattern as
 * CanvasOverlay.jsx/MeshLayer.jsx/BmkgRainLayer.jsx — 4th instance, not a
 * new one.
 */
export default function AdminRegionLayer({ regions, stations }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const regionsRef = useRef(regions);
  const stationsRef = useRef(stations);

  useEffect(() => { regionsRef.current = regions; }, [regions]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;

    const paint = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);

      const projection = overlayRef.current?.getProjection();
      if (!projection) return;

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
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; // real kecamatan border, kept subtle
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; paint(); });
    };

    class AdminRegionOverlay extends window.google.maps.OverlayView {
      onAdd() { this.getPanes().overlayLayer.appendChild(canvas); }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const bounds = map.getBounds();
        if (!bounds) return;
        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
        const left = Math.min(sw.x, ne.x), top = Math.min(sw.y, ne.y);
        canvas.width = Math.ceil(Math.abs(ne.x - sw.x));
        canvas.height = Math.ceil(Math.abs(sw.y - ne.y));
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas._offsetX = left;
        canvas._offsetY = top;
        scheduleDraw();
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new AdminRegionOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._repaint = scheduleDraw;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?._repaint?.(); }, [regions, stations]);

  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/map/AdminRegionLayer.jsx src/lib/sensorColor.js
git commit -m "feat: add AdminRegionLayer, extract bucketColor from statusColor"
```

---

### Task 7: Wire into `page.jsx`

**Files:**
- Modify: `src/app/(dashboard)/page.jsx:7` (imports), `:307` (near
  `useWindField` call), `:486-488` (render swap)

**Interfaces:**
- Consumes: `AdminRegionLayer` (Task 6), `useAdminBoundaries` (Task 5),
  `REGION_LAYER_MIN_ZOOM` (Task 1). Uses existing `mapBounds` (page.jsx:275)
  and `currentZoom` (page.jsx:299) state — no new viewport-tracking state.

This task has no automated test (it's wiring, not new logic) — full manual
browser verification instead, in Step 4.

- [ ] **Step 1: Add imports**

In `src/app/(dashboard)/page.jsx`, alongside the existing map-layer imports
(near line 7-14):

```js
import AdminRegionLayer from '@/components/map/AdminRegionLayer';
```

Alongside the existing hook imports (near line 30-33):

```js
import { useAdminBoundaries } from '@/hooks/useAdminBoundaries';
```

Add `REGION_LAYER_MIN_ZOOM` to the existing `mapConfig` import (line 39):

```js
import { MAP_CENTER, MAP_ZOOM_DEFAULT, MAP_MIN_ZOOM, MAP_MAX_ZOOM, REGION_LAYER_MIN_ZOOM } from '@/constants/mapConfig';
```

- [ ] **Step 2: Call the hook**

Right after the existing `useWindField(mapBounds)` call (page.jsx:307):

```js
const { field: windField, ambientField: windAmbientField, status: windFieldStatus } = useWindField(mapBounds);

// Rain Density's admin-region layer — only fetches while that mode is
// active AND zoomed in past REGION_LAYER_MIN_ZOOM (see the render swap
// below); reuses the same mapBounds/currentZoom state useWindField and
// MapControls' zoom readout already track, no new viewport-tracking state.
const { regions: adminRegions } = useAdminBoundaries(
  mapBounds,
  currentZoom,
  activeLayer === 'rain' && currentZoom >= REGION_LAYER_MIN_ZOOM,
);
```

- [ ] **Step 3: Swap the render block**

Replace the existing combined condition (page.jsx:486-488):

```jsx
{(activeLayer === 'rain' || activeLayer === 'himawari') && (
  <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
)}
```

with two separate conditions — Himawari's blob is untouched (it never
had a region-layer alternative), only Rain Density's own KDE blob is now
zoom-gated:

```jsx
{activeLayer === 'himawari' && (
  <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
)}
{activeLayer === 'rain' && (
  currentZoom >= REGION_LAYER_MIN_ZOOM
    ? <AdminRegionLayer regions={adminRegions} stations={SENSOR_STATIONS} />
    : <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
)}
```

- [ ] **Step 4: Verify manually in the browser**

1. `rm -rf .next`, restart the dev server fresh (known Fast-Refresh
   staleness pattern in this repo after multi-file edits).
2. Log in, switch to Ground segment, select "Rain Density".
3. At the default/national zoom (well below 10): confirm the KDE blob
   renders exactly as before this change (no regression) — no admin
   region polygons visible yet.
4. Zoom in past `REGION_LAYER_MIN_ZOOM` (10) over an area with sensors
   (e.g. Jakarta/Bogor via the province search, matching earlier sessions'
   test locations): confirm kecamatan-shaped polygons now render, colored
   by status (green/indigo/amber/gray/red per `SENSOR_STATUS_COLOR`),
   with visible thin borders between them.
5. Open the Network tab, confirm `/api/boundaries` requests return
   reasonably small payloads (tens of KB, not megabytes) at this zoom.
6. Pan to an area with sparse/no sensors nearby: confirm those kecamatan
   render in the neutral no-data gray, not an inappropriately-inherited
   distant sensor's color.
7. Toggle light/dark theme while zoomed into the region view: confirm
   colors update (via `bucketColor`'s live theme check) and stay legible
   in both.
8. Switch to Himawari mode: confirm its own KDE blob still renders as
   before (unaffected by this change).
9. Switch to Mesh Map/BMKG/Sensor Spot: confirm nothing new renders (this
   layer only ever mounts for `activeLayer === 'rain'`).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, including the new `regionNearestSensor.test.js` and
`boundaryRegions.test.js` files alongside the existing 59 tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat: wire AdminRegionLayer into Rain Density mode, zoom-gated"
```

## Verification

End-to-end, after all 7 tasks:

1. `npm test` — all tests green (existing 59 + this plan's new ones).
2. Browser (per Task 7 Step 4 above) — the full manual checklist:
   KDE blob unchanged below the zoom threshold, real kecamatan polygons
   colored by nearest-sensor status above it, no-data regions render
   gray, both themes legible, Himawari/Mesh Map/BMKG/Sensor Spot
   unaffected, `/api/boundaries` payload sizes reasonable and cache-hit
   on repeat requests (`curl` check from Task 4 Step 3).
3. No new npm dependency in `package.json` (confirm `git diff
   package.json` is empty across this whole plan).
