# BMKG Cuaca Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, independent "BMKG Cuaca" ground mode that renders a rainbow kernel-heatmap of BMKG's official per-kabupaten precipitation data (`precip_mm`), alongside the existing Rain Density (sensor) and Mesh Map modes.

**Architecture:** A new pure-logic module maps `precip_mm` to a ramp position; a new hook polls `GET /api/bmkg/cuaca/indonesia` (via the existing generic backend proxy) while the mode is active; a new `OverlayView`-based canvas component (`BmkgRainLayer.jsx`) reuses kernel-heatmap helper functions extracted from `CanvasOverlay.jsx` into a shared module; `page.jsx` and `SegmentTogglePanel.jsx` wire it in as a third selectable ground mode (`activeLayer === 'bmkg'`).

**Tech Stack:** Next.js (App Router), React, `@vis.gl/react-google-maps` (`useMap`, `google.maps.OverlayView`), Canvas 2D API, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md`

## Global Constraints

- Rainbow color ramp (`RAIN_RAMP`) is only permitted (per `AGENTS.md`) when paired with a clear tick legend and backed by a real per-point measurement — BMKG's `precip_mm` is real per-kabupaten data, so `METRICS.bmkg`'s legend may show actual mm breakpoints (not qualitative-only labels).
- Breakpoints (`0–2.5 / 2.5–7.5 / 7.5–15 / >15 mm/jam`) are a standard hourly meteorological convention, **not** an official BMKG-published threshold — every place they appear in code must say so in a comment, per the spec.
- No new Next.js API route: `/api/bmkg/cuaca/indonesia` is on the same backend domain already proxied by `app/api/[...path]/route.js` — call it through `nirmalaApiService`, exactly like `getSensors()`/`getManifest()`.
- Reuse existing UI components (`VendorCard`, `ModeButton`, `LayerSwitch` in `SegmentTogglePanel.jsx`) rather than building new panel chrome — this feature introduces zero new visual component styling, only new usages of what exists.
- Fixture data (`public/fixtures/bmkg-cuaca.json`) must be a real captured response (or a syntactically-fixed version of one), never fabricated values — matches the documented rule at the top of `src/lib/nirmalaApi.js`.

---

## Task 1: Extract kernel-heatmap helpers into a shared module

**Files:**
- Create: `src/lib/heatmapKernel.js`
- Modify: `src/components/map/CanvasOverlay.jsx:55-108` (remove local `buildLUT`/`metersPerPixel`/`drawKernels`/`colourizeInto`, import from the new module instead), `src/components/map/CanvasOverlay.jsx:124-133` (point construction: tuples → objects)

**Interfaces:**
- Produces: `buildLUT(ramp: [number, [number,number,number]][]): Uint8ClampedArray` (256×3 LUT), `metersPerPixel(lat: number, zoom: number): number`, `drawKernels(sctx: CanvasRenderingContext2D, W: number, H: number, pts: {x: number, y: number, alpha: number}[], radius: number): void`, `colourizeInto(layer: HTMLCanvasElement, shadow: HTMLCanvasElement, W: number, H: number, lut: Uint8ClampedArray, maxAlpha: number): void` — all from `src/lib/heatmapKernel.js`. Task 6 (`BmkgRainLayer.jsx`) consumes all four.

This is a **behavior-preserving move**, with one real signature change: `drawKernels`'s `pts` used to be `[x, y]` tuples sharing one hardcoded module-level `POINT_ALPHA`; it becomes `{x, y, alpha}` objects so each point can carry its own kernel strength. `CanvasOverlay.jsx`'s two call sites (wet/dry, currently both using the same flat `POINT_ALPHA = 0.5`) are updated to pass that alpha explicitly per point — their rendered output is identical to before. This change exists because BMKG's precipitation values are continuous per-point measurements (Task 6 needs each kabupaten's own `precip_mm` to set its own kernel strength), not a shared density constant.

- [ ] **Step 1: Create `src/lib/heatmapKernel.js`**

```js
/**
 * Shared kernel-heatmap helpers — greyscale alpha kernels per point,
 * colourized through a 256×3 LUT. Used by both CanvasOverlay.jsx (Rain
 * Density / sensor coverage) and BmkgRainLayer.jsx (BMKG Cuaca). See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 */

/** Builds a 256×3 RGB lookup table by linearly interpolating between ramp stops. `ramp` is `[[t, [r,g,b]], ...]` sorted by ascending `t` (0-1), covering the full range. */
export function buildLUT(ramp) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = ramp[0], b = ramp[ramp.length - 1];
    for (let k = 0; k < ramp.length - 1; k++) {
      if (t >= ramp[k][0] && t <= ramp[k + 1][0]) { a = ramp[k]; b = ramp[k + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3]     = a[1][0] + (b[1][0] - a[1][0]) * f;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
  }
  return lut;
}

/** Meters-per-pixel at a given latitude/zoom on the Web Mercator projection — used to convert a real-world km radius into a screen-pixel kernel radius. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * Draws one radial-gradient kernel per point onto `sctx`, each point's own
 * peak alpha given by `pt.alpha` (0-1) — NOT a single shared constant, so
 * callers can encode either "every point is equally weighted" (Rain
 * Density's density-of-raining-sensors case: pass the same alpha for every
 * point) or "each point carries its own measured intensity" (BMKG's
 * precip_mm case: pass a different alpha per point).
 */
export function drawKernels(sctx, W, H, pts, radius) {
  sctx.clearRect(0, 0, W, H);
  for (const { x, y, alpha } of pts) {
    const g = sctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(x, y, radius, 0, Math.PI * 2);
    sctx.fill();
  }
}

/** Colourize the shadow's alpha channel through a LUT into a layer canvas. Output alpha (opacity on the map) is capped at `maxAlpha`; color choice uses the raw pre-cap alpha byte (0-255) as the LUT index. */
export function colourizeInto(layer, shadow, W, H, lut, maxAlpha) {
  const sctx = shadow.getContext('2d');
  const img = sctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;
    const li = alpha * 3;
    d[i] = lut[li];
    d[i + 1] = lut[li + 1];
    d[i + 2] = lut[li + 2];
    d[i + 3] = alpha > maxAlpha ? maxAlpha : alpha;
  }
  layer.width = W; layer.height = H;
  layer.getContext('2d').putImageData(img, 0, 0);
}
```

- [ ] **Step 2: Update `CanvasOverlay.jsx` to import from the shared module and adapt point construction**

Read the current file first — it's `src/components/map/CanvasOverlay.jsx`, 227 lines. Replace lines 1-108 (everything from the top through the end of the local `colourizeInto` definition) with:

```js
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { statusBucket } from '@/lib/sensorColor';
import { buildLUT, metersPerPixel, drawKernels, colourizeInto } from '@/lib/heatmapKernel';

/**
 * Rain-density heatmap with a coverage base (BIGNET DS v19). "Titik Sensor"
 * (SensorDotLayer) is a fully independent dot layer with no heatmap
 * involvement. The whole heatmap (both layers below) is currently hidden —
 * see HEATMAP_ENABLED below.
 *
 * The live feed is BINARY (is_raining) — no numeric intensity to interpolate.
 * Two honest density layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every ACTIVE, non-raining sensor emits a faint
 *    kernel → shows the live sensor network even when it isn't raining.
 *  - RAIN (dominant, cool→hot): every RAINING sensor emits a stronger kernel;
 *    overlaps accumulate → isolated rain = modest, clustered rain = hot core.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Technique = heatmap.js: greyscale alpha kernels → colourize via a 1×256 LUT.
 * `buildLUT`/`metersPerPixel`/`drawKernels`/`colourizeInto` live in
 * src/lib/heatmapKernel.js, shared with BmkgRainLayer.jsx.
 */

// Whole heatmap (coverage teal base AND rain-density blobs) hidden for
// now — the underlying density-kernel theory hasn't been validated yet
// ("secara teori masih belum benar"). This is a blanket hide of everything
// CanvasHeatmapOverlay draws, not just the coverage sub-layer: the two
// layers read as one visual to users (they share the same blob shapes,
// coverage is just the low end of the same gradient), so a partial hide
// still looked like leftover coverage. Flip back on once validated.
const HEATMAP_ENABLED = false;
const SHOW_COVERAGE_LAYER = false;

const RAIN_KM = 35;
const RAIN_MIN = 14, RAIN_MAX = 90;
const COVER_KM = 22;
const COVER_MIN = 8, COVER_MAX = 42;
const POINT_ALPHA = 0.5;
const RAIN_MAX_ALPHA = 220;
const COVER_MAX_ALPHA = 90;   // subtle — network base, never competes with rain

// Full meteorological precipitation spectrum (Windy/BMKG-style), matching
// --rain-1..6 in globals.css and ColorRampLegend's tick labels. Approved
// exception to "no rainbow" in AGENTS.md design guardrails — this follows
// a recognized weather-platform convention and is always shown with a
// qualitative tick legend (Rendah/Sedang/Tinggi/Ekstrem), not decoration.
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];
// Neutral teal for the "normal / dry sensor network".
const COVER_RAMP = [
  [0.00, [20, 70, 110]], [1.00, [64, 180, 205]],
];

const RAIN_LUT = buildLUT(RAIN_RAMP);
const COVER_LUT = buildLUT(COVER_RAMP);
```

Then, in the same file, find `renderHeatmap`'s point-collection loop (originally around line 124-133):

```js
  const wet = [], dry = [];
  for (const st of stations) {
    const bucket = statusBucket(st);
    if (bucket !== 'raining' && bucket !== 'active') continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    if (bucket === 'raining') wet.push([x, y]);
    else dry.push([x, y]);
  }
```

and change the last two lines to construct objects with an explicit `alpha`:

```js
    if (bucket === 'raining') wet.push({ x, y, alpha: POINT_ALPHA });
    else dry.push({ x, y, alpha: POINT_ALPHA });
```

Everything else in the file (`renderHeatmap`'s remaining body, the `CanvasHeatmapOverlay` component, its `OverlayView` lifecycle) stays exactly as it is.

- [ ] **Step 3: Run the full test suite to confirm no regression**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0` (unchanged from before this task — no test touches `CanvasOverlay.jsx` directly, this step just guards against an accidental syntax error in the edit).

- [ ] **Step 4: Start the dev server and confirm no console errors**

Run the dev server (`npm run dev` or the project's existing `nirmala-dev` preview config) and load the dashboard in a browser. `HEATMAP_ENABLED` is `false`, so no heatmap renders either way — this check only confirms the refactor didn't break the import graph or throw at runtime. Check the browser console: no red errors referencing `CanvasOverlay`, `heatmapKernel`, or `buildLUT`/`drawKernels`/`colourizeInto`/`metersPerPixel` being undefined.

- [ ] **Step 5: Commit**

```bash
git add src/lib/heatmapKernel.js src/components/map/CanvasOverlay.jsx
git commit -m "refactor: extract kernel-heatmap helpers into src/lib/heatmapKernel.js"
```

---

## Task 2: `precipToT` — precipitation-to-ramp-position mapping

**Files:**
- Create: `src/lib/bmkgWeather.js`
- Test: `src/lib/bmkgWeather.test.js`

**Interfaces:**
- Produces: `precipToT(mm: number): number` — returns a value in `[0, 1]` for use as a `RAIN_RAMP` position. Task 6 (`BmkgRainLayer.jsx`) consumes this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bmkgWeather.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/bmkgWeather.test.js`
Expected: FAIL — `Cannot find module './bmkgWeather.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write `src/lib/bmkgWeather.js`**

```js
/**
 * BMKG Cuaca precipitation-intensity mapping. `precip_mm` from
 * GET /api/bmkg/cuaca/indonesia is an instantaneous/hourly reading (the
 * sample response's "now" values — 0, 0.2, 0.7 — are far too small to be a
 * 24h accumulation), so breakpoints below use a standard hourly
 * meteorological intensity convention (WMO-style), NOT an
 * official BMKG-published threshold (not available at the time this was
 * written — see docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md).
 * Adjust these three constants if BMKG documents its own official
 * thresholds later.
 */
const LOW_MAX_MM = 2.5;     // 0-2.5 mm/jam = Rendah
const MODERATE_MAX_MM = 7.5; // 2.5-7.5 mm/jam = Sedang
const HIGH_MAX_MM = 15;      // 7.5-15 mm/jam = Tinggi; >15 = Ekstrem

/**
 * Maps a precip_mm reading to a [0,1] position on RAIN_RAMP (the same ramp
 * CanvasOverlay.jsx/BmkgRainLayer.jsx/METRICS.bmkg use), where each of the
 * four bands above occupies an even quarter of the range: 0-0.25 Rendah,
 * 0.25-0.5 Sedang, 0.5-0.75 Tinggi, 0.75-1 Ekstrem (uncapped intensity
 * within the band, but the returned t itself is always capped at 1).
 */
export function precipToT(mm) {
  if (!(mm > 0)) return 0;
  if (mm <= LOW_MAX_MM) return (mm / LOW_MAX_MM) * 0.25;
  if (mm <= MODERATE_MAX_MM) return 0.25 + ((mm - LOW_MAX_MM) / (MODERATE_MAX_MM - LOW_MAX_MM)) * 0.25;
  if (mm <= HIGH_MAX_MM) return 0.5 + ((mm - MODERATE_MAX_MM) / (HIGH_MAX_MM - MODERATE_MAX_MM)) * 0.25;
  return Math.min(1, 0.75 + ((mm - HIGH_MAX_MM) / HIGH_MAX_MM) * 0.25);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/bmkgWeather.test.js`
Expected: PASS, 9 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmkgWeather.js src/lib/bmkgWeather.test.js
git commit -m "feat: add precipToT precipitation-intensity mapping for BMKG Cuaca"
```

---

## Task 3: `nirmalaApiService.getBmkgCuaca()` + fixture

**Files:**
- Modify: `src/lib/nirmalaApi.js` (add method to the `nirmalaApiService` object, right after `getSensors()`)
- Create: `public/fixtures/bmkg-cuaca.json`

**Interfaces:**
- Produces: `nirmalaApiService.getBmkgCuaca(): Promise<{ source, web, scope, timezone, note, building, progress, cache_age_s, cache_ttl_s, count, kabupaten: Array<{ kab, name, lat, lon, adm4, now: { datetime_wib, weather, weather_code, precip_mm, temp_c, humidity_pct, cloud_pct, icon } }> }>`. Task 4 (`useBmkgWeather`) consumes this.

- [ ] **Step 1: Create the fixture from the real captured response**

Create `public/fixtures/bmkg-cuaca.json` (this is the exact response already captured from the live endpoint during this feature's design discussion — only 3 of the real 511 kabupaten entries are included, sufficient for the fallback code path and any future manual testing; it is not fabricated):

```json
{
  "source": "BMKG — Prakiraan Cuaca (resmi)",
  "web": "https://www.bmkg.go.id",
  "scope": "indonesia (per-kabupaten, presisi regional)",
  "timezone": "WIB (UTC+7) di datetime_wib",
  "note": "Kondisi TERKINI kabupaten dalam 1 panggilan (front-end tak perlu panggil per-sensor); tiap sensor pakai cuaca kabupatennya. Detail 3-hari per titik: /api/bmkg/cuaca?adm4= atau ?lat=&lon=.",
  "building": false,
  "progress": null,
  "cache_age_s": 2850.3,
  "cache_ttl_s": 7200,
  "count": 511,
  "kabupaten": [
    {
      "kab": "11.01",
      "name": "Kabupaten Aceh Selatan",
      "lat": 3.2548,
      "lon": 97.1741,
      "adm4": "11.01.01.2001",
      "now": {
        "datetime_wib": "2026-09-04T15:00:00+07:00",
        "weather": "Cerah Berawan",
        "weather_code": 2,
        "precip_mm": 0.2,
        "temp_c": 29,
        "humidity_pct": 74,
        "cloud_pct": 88,
        "icon": "https://api-apps.bmkg.go.id/storage/icon/cuaca/cerah berawan-am.svg"
      }
    },
    {
      "kab": "11.02",
      "name": "Kabupaten Aceh Tenggara",
      "lat": 3.4734,
      "lon": 97.8192,
      "adm4": "11.02.01.2001",
      "now": {
        "datetime_wib": "2026-09-04T15:00:00+07:00",
        "weather": "Cerah Berawan",
        "weather_code": 2,
        "precip_mm": 0.7,
        "temp_c": 25,
        "humidity_pct": 77,
        "cloud_pct": 88,
        "icon": "https://api-apps.bmkg.go.id/storage/icon/cuaca/cerah berawan-am.svg"
      }
    },
    {
      "kab": "11.03",
      "name": "Kabupaten Aceh Timur",
      "lat": 4.9327,
      "lon": 97.7838,
      "adm4": "11.03.01.2001",
      "now": {
        "datetime_wib": "2026-09-04T15:00:00+07:00",
        "weather": "Cerah Berawan",
        "weather_code": 2,
        "precip_mm": 0,
        "temp_c": 30,
        "humidity_pct": 70,
        "cloud_pct": 88,
        "icon": "https://api-apps.bmkg.go.id/storage/icon/cuaca/cerah berawan-am.svg"
      }
    }
  ]
}
```

- [ ] **Step 2: Verify the fixture is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/fixtures/bmkg-cuaca.json', 'utf8')); console.log('valid')"`
Expected: prints `valid` with no error.

- [ ] **Step 3: Add `getBmkgCuaca()` to `nirmalaApiService`**

In `src/lib/nirmalaApi.js`, immediately after the closing `},` of `getSensors()` (before the `getLatestTimeseries` doc comment), insert:

```js
  /**
   * GET /api/bmkg/cuaca/indonesia — BMKG's official current-weather
   * snapshot for all ~511 kabupaten/kota in one call (server-side cached,
   * cache_ttl_s: 7200 = 2h). Same backend domain as /api/sensors, so this
   * goes through the same generic proxy — no dedicated Next.js route
   * needed. See docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
   */
  async getBmkgCuaca() {
    try {
      return await nirmalaApi.get('/api/bmkg/cuaca/indonesia');
    } catch (error) {
      console.warn('[Nirmala API] BMKG cuaca unavailable, using fixture:', error.message);
      return (await loadFixture('bmkg-cuaca')) || { kabupaten: [] };
    }
  },
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0` (this task adds no new automated tests — `nirmalaApiService` methods are network wrappers, consistent with every other method in this file having no dedicated unit test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nirmalaApi.js public/fixtures/bmkg-cuaca.json
git commit -m "feat: add nirmalaApiService.getBmkgCuaca() with fixture fallback"
```

---

## Task 4: `useBmkgWeather` hook

**Files:**
- Create: `src/hooks/useBmkgWeather.js`

**Interfaces:**
- Consumes: `nirmalaApiService.getBmkgCuaca()` (Task 3), `LAYER_STATUS` from `@/constants/layerStatus` (already exists — `IDLE`/`LOADING`/`OK`/`EMPTY`/`ERROR`).
- Produces: `useBmkgWeather(active: boolean): { kabupaten: Array, lastSyncedAt: Date | null, status: string }`. Task 7 (`page.jsx`) consumes this.

- [ ] **Step 1: Create `src/hooks/useBmkgWeather.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import { nirmalaApiService } from '@/lib/nirmalaApi';
import { LAYER_STATUS } from '@/constants/layerStatus';

// BMKG's own cache_ttl_s is 7200 (2h) — polling more often than that just
// re-fetches the same cached snapshot, so this stays comfortably under it.
const REFRESH_MS = 30 * 60 * 1000;

function extractLastSynced(kabupaten) {
  const times = kabupaten
    .map((k) => new Date(k?.now?.datetime_wib))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) return null;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

/**
 * Fetches BMKG's official per-kabupaten "now" weather snapshot
 * (nirmalaApiService.getBmkgCuaca()) only while `active` (the BMKG ground
 * mode is selected) — same "only fetch while the mode is on" pattern as
 * useJmaHimawariTicks. See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 */
export function useBmkgWeather(active) {
  const [kabupaten, setKabupaten] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [status, setStatus] = useState(LAYER_STATUS.IDLE);

  useEffect(() => {
    if (!active) { setStatus(LAYER_STATUS.IDLE); return; }
    let alive = true;
    let timer = null;

    const load = async () => {
      setStatus((prev) => (prev === LAYER_STATUS.IDLE ? LAYER_STATUS.LOADING : prev));
      try {
        const response = await nirmalaApiService.getBmkgCuaca();
        if (!alive) return;
        const list = Array.isArray(response?.kabupaten) ? response.kabupaten : [];
        setKabupaten(list);
        setLastSyncedAt(extractLastSynced(list));
        setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
      } catch (err) {
        if (!alive) return;
        console.warn('[useBmkgWeather] failed to load BMKG cuaca:', err);
        setStatus(LAYER_STATUS.ERROR);
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };

    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [active]);

  return { kabupaten, lastSyncedAt, status };
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0` (no new tests — this hook does network/timer orchestration, consistent with `useWindField`/`useJmaHimawariTicks` having no dedicated test file either).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBmkgWeather.js
git commit -m "feat: add useBmkgWeather hook"
```

---

## Task 5: `METRICS.bmkg` entry

**Files:**
- Modify: `src/constants/metrics.js`

**Interfaces:**
- Produces: `METRICS.bmkg = { key, label, icon, colorRamp, tickLabels, legendNote }`. Consumed by `ColorRampLegend.jsx` (via `METRICS[activeLayer]`, already generic) and `SegmentTogglePanel.jsx` (Task 8, for the new `ModeButton`'s icon/label).

- [ ] **Step 1: Add the entry**

In `src/constants/metrics.js`, add a `bmkg` key to the `METRICS` object (after `mesh`, before `himawari`):

```js
  bmkg: {
    key: 'bmkg',
    label: 'BMKG Cuaca',
    icon: 'material-symbols:cloud-outline-rounded',
    // Same rainbow spectrum as Rain Density's RAIN_RAMP — approved
    // exception to "no rainbow" in AGENTS.md, paired with a real numeric
    // legend below (unlike Rain Density's qualitative-only labels) because
    // precip_mm is a real per-kabupaten BMKG measurement, not a fabricated
    // number. Breakpoints are a standard hourly meteorological convention,
    // not an official BMKG-published threshold — see src/lib/bmkgWeather.js.
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['0', '2.5', '7.5', '15+ mm/jam'],
    legendNote: 'Curah hujan resmi BMKG per kabupaten (data real per-titik, bukan interpolasi sensor).',
  },
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/constants/metrics.js
git commit -m "feat: add METRICS.bmkg entry"
```

---

## Task 6: `BmkgRainLayer.jsx` — the render component

**Files:**
- Create: `src/components/map/BmkgRainLayer.jsx`

**Interfaces:**
- Consumes: `buildLUT`, `metersPerPixel`, `drawKernels`, `colourizeInto` from `@/lib/heatmapKernel` (Task 1); `precipToT` from `@/lib/bmkgWeather` (Task 2).
- Produces: `<BmkgRainLayer kabupaten={Array} />` (default export). Task 7 (`page.jsx`) renders this.
- Prop shape: `kabupaten: Array<{ lat: number, lon: number, now: { precip_mm: number } }>` — matches `nirmalaApiService.getBmkgCuaca()`'s `kabupaten[]` shape (Task 3) passed straight through from `useBmkgWeather` (Task 4).

- [ ] **Step 1: Create `src/components/map/BmkgRainLayer.jsx`**

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildLUT, metersPerPixel, drawKernels, colourizeInto } from '@/lib/heatmapKernel';
import { precipToT } from '@/lib/bmkgWeather';

/**
 * BMKG Cuaca ground layer — kernel-heatmap of official per-kabupaten
 * precipitation (precip_mm), independent from the sensor-based Rain
 * Density layer (CanvasOverlay.jsx). See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 *
 * Unlike CanvasOverlay.jsx's wet/dry kernels (all points share one flat
 * peak alpha — POINT_ALPHA — so overlapping RAINING sensors accumulate
 * into a hotter blob, a density-of-sensors signal), each kabupaten here
 * carries its OWN measured precip_mm, mapped to its own kernel peak alpha
 * via precipToT() (0-1, full range) so the LUT color at that spot reflects
 * that kabupaten's real reading. The ~511 points are far enough apart that
 * kernels rarely overlap; where two adjacent high-rain kabupaten's kernels
 * do overlap, alpha compositing can push the blended color slightly past
 * either individual reading — an accepted approximation of the same
 * technique already used for Rain Density, not a new correctness gap this
 * layer introduces.
 */

// Tunable — 511 kabupaten points are far sparser than Rain Density's
// ~4,500 sensors, so this starts larger than CanvasOverlay.jsx's RAIN_KM
// (35) and is expected to need adjustment after visual QA.
const BMKG_KM = 60;
const BMKG_MIN = 25, BMKG_MAX = 140;
const MAX_ALPHA = 220;

// Same rainbow spectrum as Rain Density's RAIN_RAMP (CanvasOverlay.jsx) and
// METRICS.bmkg.colorRamp — approved "no rainbow" exception in AGENTS.md.
// Duplicated locally rather than imported from a shared constant:
// OpenWeatherLayer.jsx already keeps its own copy of this same ramp too,
// this follows that existing precedent rather than introducing a new
// shared constant out of scope for this feature.
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];
const RAIN_LUT = buildLUT(RAIN_RAMP);

function renderHeatmap(canvas, shadow, layer, kabupaten, projection, map) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!kabupaten.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const radius = Math.max(BMKG_MIN, Math.min(BMKG_MAX, (BMKG_KM * 1000) / mpp));

  const pts = [];
  for (const k of kabupaten) {
    const mm = k?.now?.precip_mm;
    const t = precipToT(mm);
    if (t <= 0) continue; // no rain here — no kernel, stays transparent
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(k.lat, k.lon));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -radius || x > W + radius || y < -radius || y > H + radius) continue;
    pts.push({ x, y, alpha: t });
  }
  if (!pts.length) return;

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');
  drawKernels(sctx, W, H, pts, radius);
  colourizeInto(layer, shadow, W, H, RAIN_LUT, MAX_ALPHA);
  ctx.drawImage(layer, 0, 0);
}

export default function BmkgRainLayer({ kabupaten }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const layerRef = useRef(null);
  const kabupatenRef = useRef(kabupaten);
  const rafRef = useRef(0);

  useEffect(() => { kabupatenRef.current = kabupaten; }, [kabupaten]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    shadowRef.current = document.createElement('canvas');
    layerRef.current = document.createElement('canvas');

    const scheduleDraw = (fn) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; fn(); });
    };

    class BmkgOverlay extends window.google.maps.OverlayView {
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
        scheduleDraw(() =>
          renderHeatmap(canvas, shadowRef.current, layerRef.current, kabupatenRef.current, projection, map)
        );
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new BmkgOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?.draw(); }, [kabupaten]);

  return null;
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0` (no new tests — this is a canvas/`OverlayView` component, consistent with `CanvasOverlay.jsx`/`WindParticleLayer.jsx` having no component-level test).

- [ ] **Step 3: Commit**

```bash
git add src/components/map/BmkgRainLayer.jsx
git commit -m "feat: add BmkgRainLayer component"
```

---

## Task 7: Wire into `page.jsx`

**Files:**
- Modify: `src/app/(dashboard)/page.jsx:3` (imports), `:26` (hooks import), `:157` (`activeLayerLastSynced`), `:354-359` (map render), `:406` (`legendProps` — no change needed, already generic via `activeLayer`)

**Interfaces:**
- Consumes: `useBmkgWeather` (Task 4), `BmkgRainLayer` (Task 6).

- [ ] **Step 1: Add imports**

In `src/app/(dashboard)/page.jsx`, add to the import block (after the `HimawariLayer` import on line 12):

```js
import BmkgRainLayer from '@/components/map/BmkgRainLayer';
```

And after the `useJmaHimawariTicks` import (line 26):

```js
import { useBmkgWeather } from '@/hooks/useBmkgWeather';
```

- [ ] **Step 2: Call the hook and derive the timestamp**

Immediately after the `himawari = useJmaHimawariTicks(...)` line (originally line 111), add:

```js
  const { kabupaten: bmkgKabupaten, lastSyncedAt: bmkgLastSynced } = useBmkgWeather(activeLayer === 'bmkg');
```

Then find the `activeLayerLastSynced` line (originally line 157):

```js
  const activeLayerLastSynced = activeLayer === 'himawari' ? himawariLastSynced : rainvisionLastSynced;
```

and change it to:

```js
  const activeLayerLastSynced = activeLayer === 'himawari'
    ? himawariLastSynced
    : activeLayer === 'bmkg'
      ? bmkgLastSynced
      : rainvisionLastSynced;
```

- [ ] **Step 3: Render the layer**

Find the conditional ground-layer block inside `<GoogleMapWrapper>` (originally lines 354-359):

```jsx
              {(activeLayer === 'rain' || activeLayer === 'himawari') && (
                <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
              )}
              {activeLayer === 'mesh' && (
                <MeshLayer stations={SENSOR_STATIONS} onDistanceRangeChange={setMeshDistanceRange} />
              )}
```

and add a new block for `bmkg` right after the `mesh` block:

```jsx
              {activeLayer === 'bmkg' && (
                <BmkgRainLayer kabupaten={bmkgKabupaten} />
              )}
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat: wire BmkgRainLayer into the dashboard's bmkg ground mode"
```

---

## Task 8: Activate the "BMKG" vendor card in `SegmentTogglePanel.jsx`

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx:276` (`showSensorToggles`), `:295` (the `VendorCard title="BMKG"` line)

**Interfaces:**
- Consumes: `METRICS.bmkg` (Task 5, for icon/label — `METRICS` is already imported in this file).

- [ ] **Step 1: Extend `showSensorToggles`**

In `GroundSegmentContent` (`src/components/dashboard/SegmentTogglePanel.jsx`), find:

```js
  const showSensorToggles = activeLayer === 'rain' || activeLayer === 'himawari';
```

and change it to:

```js
  const showSensorToggles = activeLayer === 'rain' || activeLayer === 'himawari' || activeLayer === 'bmkg';
```

- [ ] **Step 2: Activate the BMKG card**

Find:

```jsx
      <VendorCard title="BMKG" accent="var(--status-active, #34d399)" active={false} />
```

and replace it with:

```jsx
      <VendorCard title="BMKG" accent="var(--status-active, #34d399)">
        <ModeButton
          active={activeLayer === 'bmkg'}
          icon={METRICS.bmkg.icon}
          label={METRICS.bmkg.label}
          onClick={() => onLayerChange('bmkg')}
          info={METRICS.bmkg.legendNote}
        />
      </VendorCard>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx
git commit -m "feat: activate the BMKG vendor card as a selectable ground mode"
```

---

## Task 9: Broaden the legend info-icon tooltip

**Files:**
- Modify: `src/components/dashboard/ColorRampLegend.jsx:33`

**Interfaces:** none new — this is a one-line condition change.

- [ ] **Step 1: Change the condition**

In `ColorRampLegendContent` (`src/components/dashboard/ColorRampLegend.jsx`), find:

```jsx
        {activeLayer === 'rain' && metric.legendNote && (
```

and change it to:

```jsx
        {metric.legendNote && (
```

This makes the info tooltip appear for any metric with a `legendNote` (currently `rain`, `mesh`, and the new `bmkg`), instead of only `rain`. `mesh` already renders its own info tooltip via `ModeButton`'s `info` prop in `SegmentTogglePanel.jsx` (a different location — inside the Ground Segment panel, not the legend card) — this change adds the *legend's* tooltip for it too, which is a strict improvement in consistency, not a regression (no test or design doc asserts mesh's legend must be tooltip-less).

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 39`, `pass 39`, `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ColorRampLegend.jsx
git commit -m "fix: show legend info tooltip for any metric with a legendNote, not just rain"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite one final time**

Run: `npm test 2>&1 | tail -10`
Expected: `tests 48`, `pass 48`, `fail 0` (39 pre-existing + 9 new `precipToT` tests from Task 2).

- [ ] **Step 2: Start the dev server and open the dashboard**

Load the app in a browser. Open the Ground Segment panel — confirm the "BMKG" card is no longer greyed out / no longer shows "Coming soon", and shows a "BMKG Cuaca" button.

- [ ] **Step 3: Select the BMKG mode and verify rendering**

Click the "BMKG Cuaca" button. Confirm:
- The button highlights as active (matches Rain Density/Mesh Map's active-state styling).
- Rain Density's/Mesh Map's layers disappear (only one ground layer renders at a time).
- Colored blobs appear over kabupaten currently reporting rain (if the live backend has any — if all `precip_mm` are 0 at test time, confirm the map is simply blank with no console errors, which is correct per Task 6 Step 1's "no rain here — no kernel" behavior).
- The bottom-right legend shows "BMKG Cuaca" with the rainbow bar and tick labels `0`, `2.5`, `7.5`, `15+ mm/jam`, and an info tooltip icon next to the title.
- "Sensor Points" toggle is available in the same panel (per Task 8) and, when turned on, shows sensor dots over the BMKG layer.

- [ ] **Step 4: Verify in both themes**

Toggle light/dark mode (top-left sun/moon control). Confirm the rainbow ramp colors remain legible against both basemaps (same `RAIN_RAMP` already validated for Rain Density/OpenWeather Rain in this app, so no new contrast work is expected — this step is a sanity check, not new design work).

- [ ] **Step 5: Verify no console errors**

Check the browser console while switching between Rain Density, Mesh Map, Himawari, and BMKG modes repeatedly. Confirm no errors reference `BmkgRainLayer`, `heatmapKernel`, `bmkgWeather`, or `useBmkgWeather`.

- [ ] **Step 6: Report kernel radius tuning, if needed**

If the BMKG blobs look too sparse (isolated dots with large gaps) or too coalesced (blurs into one indistinct national blob), note the observation — adjusting `BMKG_KM`/`BMKG_MIN`/`BMKG_MAX` in `BmkgRainLayer.jsx` is expected fine-tuning per the spec, not a plan failure. Do not change these constants speculatively without an actual visual read of real data.
