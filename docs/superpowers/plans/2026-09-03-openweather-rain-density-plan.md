# OpenWeather-driven Rain Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sensor-density "wet kernel" rain rendering on the Rain
Density map layer with real OpenWeather mm/h precipitation data, rendered as
a smooth colored area using the existing rainbow ramp, with legend ticks
showing real mm/h thresholds instead of qualitative words.

**Architecture:** `/api/wind/route.js`'s existing per-grid-point OpenWeather
fetch (already running continuously for the wind particle layer, at zero
extra request cost) gains a `rain` (mm) field alongside its existing `u`/`v`/
`speed`. `CanvasOverlay.jsx` stops building rain from sensor `is_raining`
kernels and instead paints a tiny raster canvas sized to the OpenWeather
grid's own resolution (one `fillRect` per grid cell, colorized through the
existing `RAIN_LUT`), then lets `ctx.drawImage`'s native bilinear upscaling
smooth it across the full viewport — no manual interpolation needed. Sensor
data still drives the separate "coverage" (dry network) base layer, which is
untouched.

**Tech Stack:** Next.js (App Router) API route, React hooks, Canvas 2D
(`OverlayView` + `drawImage`), `node --test` for pure-function unit tests.

**Spec:** `docs/superpowers/specs/2026-09-03-openweather-rain-density-design.md`

## Global Constraints

- Zero new OpenWeather API calls — reuse the existing `/api/wind` grid fetch
  (already unconditional, not gated by any toggle).
- No new dependencies.
- `RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50]` (mm/h) is the single source of
  truth for both the legend tick labels and the `mmToT()` color mapping —
  defined once in `src/constants/metrics.js`, imported everywhere else.
- Coverage (the teal "active sensor network" base layer) is sensor-driven
  and untouched by this feature — only the rain color source changes.
- A missing/failed OpenWeather field must render as "no rain color drawn"
  (transparent), never a crash or a stale/wrong fill.

---

## File Structure

- `src/app/api/wind/route.js` — **modify**: add `extractRainMm()` (pure,
  exported) and wire it into `sampleGrid()`'s per-point fetch + return shape.
- `src/app/api/wind/route.test.js` — **create**: unit tests for
  `extractRainMm()`.
- `src/hooks/useWindField.js` — **modify**: doc comment only (now also feeds
  Rain Density, not just wind).
- `src/constants/metrics.js` — **modify**: add `RAIN_MM_BREAKPOINTS`, change
  `METRICS.rain.tickLabels`/`legendNote`.
- `src/lib/rainRamp.js` — **create**: `mmToT(mm)`, the pure mm→ramp-position
  mapping.
- `src/lib/rainRamp.test.js` — **create**: unit tests for `mmToT()`.
- `src/components/map/CanvasOverlay.jsx` — **modify**: drop the sensor-based
  "wet" kernel path, add `drawRainField()` (grid raster → `drawImage`), new
  `rainField`/`rainAmbientField` props.
- `src/app/(dashboard)/page.jsx` — **modify**: pass `windField`/
  `windAmbientField` into `CanvasHeatmapOverlay` as `rainField`/
  `rainAmbientField`.
- `src/components/dashboard/SegmentTogglePanel.jsx` — **modify**: drop the
  `precipitation_new` entry from `OWM_LAYERS`.
- `AGENTS.md` — **modify**: one sentence in the rain-ramp guardrail note.

---

### Task 1: OpenWeather rain extraction + grid wiring

**Files:**
- Modify: `src/app/api/wind/route.js`
- Create: `src/app/api/wind/route.test.js`
- Modify: `src/hooks/useWindField.js` (doc comment only)

**Interfaces:**
- Produces: `extractRainMm(json: object): number` — exported from
  `src/app/api/wind/route.js`. Takes a parsed OpenWeather
  `data/2.5/weather` JSON body, returns hourly rain in mm (`0` if absent).
- Produces: `sampleGrid()`'s returned object gains `rain: number[]` (same
  length/ordering as its existing `u`/`v`/`speed` arrays — index
  `j * nx + i`). Both `/api/wind` (viewport mode) and `/api/wind?mode=ambient`
  responses carry this field, since both go through `sampleGrid()`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/wind/route.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/app/api/wind/route.test.js`
Expected: FAIL — `extractRainMm` is not exported yet (`route.js` has no such
export today).

- [ ] **Step 3: Implement `extractRainMm` and wire it into `sampleGrid()`**

In `src/app/api/wind/route.js`, add the exported helper right above
`sampleGrid` (currently starts at line 79):

```js
// OpenWeather's Current Weather Data API nests hourly rain volume (mm) under
// `rain['1h']` when it's raining at that point; `rain['3h']` (3-hour total)
// is a fallback some responses use instead — divided by 3 for an
// approximate hourly rate. No `rain` key at all means "not raining there".
export function extractRainMm(json) {
  const r = json?.rain;
  if (!r) return 0;
  if (typeof r['1h'] === 'number') return r['1h'];
  if (typeof r['3h'] === 'number') return r['3h'] / 3;
  return 0;
}
```

Inside `sampleGrid()`'s `Promise.all(pts.map(async ([lat, lng]) => { ... }))`
(current lines 89-104), add rain extraction next to the existing
speed/deg extraction:

```js
async function sampleGrid(bounds, nx, ny) {
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const lat = bounds.south + (bounds.north - bounds.south) * (ny === 1 ? 0 : j / (ny - 1));
      const lng = bounds.west + (bounds.east - bounds.west) * (nx === 1 ? 0 : i / (nx - 1));
      pts.push([lat, lng]);
    }
  }

  const cells = await Promise.all(pts.map(async ([lat, lng]) => {
    try {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${KEY}`,
        { cache: 'no-store' },
      );
      if (!r.ok) return { u: 0, v: 0, speed: 0, rain: 0 };
      const j = await r.json();
      const speed = j?.wind?.speed || 0;
      const deg = j?.wind?.deg || 0;
      const rad = (deg * Math.PI) / 180;
      return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad), speed, rain: extractRainMm(j) };
    } catch {
      return { u: 0, v: 0, speed: 0, rain: 0 };
    }
  }));

  return {
    bounds,
    nx,
    ny,
    u: cells.map((c) => +c.u.toFixed(3)),
    v: cells.map((c) => +c.v.toFixed(3)),
    speed: cells.map((c) => +c.speed.toFixed(2)),
    rain: cells.map((c) => +c.rain.toFixed(2)),
  };
}
```

(Only the two `return` fallback objects and the success-path `return`
object, plus the final returned object literal, change — the rest of
`sampleGrid`, and the whole of `GET()` below it, are untouched.)

In `src/hooks/useWindField.js`, update the top doc comment (currently lines
10-23) to add one sentence noting the field now also carries rain data —
insert after the existing first paragraph:

```js
/**
 * Fetches the /api/wind vector field(s) and reports a status a UI can react
 * to, instead of silently staying blank forever on a failed/missing key
 * (see src/app/api/wind/route.js).
 *
 * The same fetch also carries a `rain` (mm/h) array per grid point — added
 * for the Rain Density layer (see CanvasOverlay.jsx's drawRainField), which
 * reads `field.rain`/`ambientField.rain` from the objects this hook returns.
 * No separate fetch or hook exists for it; it rides along with wind.
 *
 * `bounds` (optional, `{north,south,east,west}`) — the map's current
 ...
```

(Keep the rest of the existing comment body as-is — only inserting the new
paragraph.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/app/api/wind/route.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/wind/route.js src/app/api/wind/route.test.js src/hooks/useWindField.js
git commit -m "feat: extract OpenWeather rain mm into the wind grid response"
```

---

### Task 2: Rain intensity legend — mm/h breakpoints & mmToT

**Files:**
- Modify: `src/constants/metrics.js`
- Create: `src/lib/rainRamp.js`
- Create: `src/lib/rainRamp.test.js`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RAIN_MM_BREAKPOINTS: number[]` exported from
  `src/constants/metrics.js` — `[0, 2.5, 7.6, 50]`.
- Produces: `mmToT(mm: number): number` exported from `src/lib/rainRamp.js`
  — returns a value in `[0, 1]`. Task 3's `CanvasOverlay.jsx` imports this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/rainRamp.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmToT } from './rainRamp.js';

test('mmToT: 0mm maps to t=0', () => {
  assert.equal(mmToT(0), 0);
});

test('mmToT: each breakpoint maps to its exact tick position', () => {
  assert.ok(Math.abs(mmToT(2.5) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(mmToT(7.6) - 2 / 3) < 1e-9);
  assert.equal(mmToT(50), 1);
});

test('mmToT: interpolates linearly between two breakpoints', () => {
  // Midpoint of [2.5, 7.6] should land midway between t=1/3 and t=2/3.
  const mid = (2.5 + 7.6) / 2;
  const expected = (1 / 3 + 2 / 3) / 2;
  assert.ok(Math.abs(mmToT(mid) - expected) < 1e-9);
});

test('mmToT: value above the last breakpoint clamps to t=1', () => {
  assert.equal(mmToT(200), 1);
});

test('mmToT: NaN or negative input returns 0 (defensive, not saturated)', () => {
  assert.equal(mmToT(NaN), 0);
  assert.equal(mmToT(-5), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rainRamp.test.js`
Expected: FAIL — `src/lib/rainRamp.js` does not exist yet.

- [ ] **Step 3: Add `RAIN_MM_BREAKPOINTS` and implement `mmToT`**

`src/constants/metrics.js` currently starts with two staleness constants
(`UNAVAILABLE_AFTER_MS`, `INACTIVE_AFTER_MS`, current lines 1-5) — these
belong to unrelated sensor-status logic and are out of scope; leave them
untouched. Replace only the doc comment and `METRICS.rain` block that
follows (current lines 7-25 — starts at the `/**` right after those
constants, ends at the `rain: { ... }` block's closing `},` just before the
`mesh:` entry) with:

```js
/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity
 * from them. Rain Density's actual intensity now comes from OpenWeather's
 * grid-sampled mm/h data instead (see src/app/api/wind/route.js's `rain`
 * field and src/components/map/CanvasOverlay.jsx's drawRainField) — sensors
 * still drive the separate "coverage" (active network) base layer only.
 * Temperature is removed (no data source anywhere).
 */

// Standard meteorological hourly-intensity classes (WMO-style): light,
// moderate, heavy, violent — mm of rain per hour. Shared by the legend tick
// labels below and by src/lib/rainRamp.js's mmToT(), so the class
// boundaries always land exactly on the legend's tick marks (ColorRampLegend
// draws tickLabels at even 0/33/66/100% positions regardless of the
// underlying values).
export const RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50];

export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Rain Density',
    icon: 'material-symbols:rainy-rounded',
    // Full meteorological precipitation spectrum (Windy/BMKG-style) — an
    // approved exception to "no rainbow" in AGENTS.md, always paired with
    // a numeric tick legend below.
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['0', '2.5', '7.6', '50+ mm/h'],
    legendNote: 'Rainfall intensity from OpenWeather, interpolated across a coarse grid — not a per-sensor reading.',
  },
```

(The rest of the file — `mesh` and `himawari` entries, and the closing
`};` — is unchanged.)

Create `src/lib/rainRamp.js`:

```js
import { RAIN_MM_BREAKPOINTS } from '@/constants/metrics';

// Maps a real mm/h rain rate onto the RAIN_RAMP's [0,1] position, using
// RAIN_MM_BREAKPOINTS as piecewise-linear control points — see
// CanvasOverlay.jsx's drawRainField, which colorizes grid cells through
// this before looking them up in RAIN_LUT.
export function mmToT(mm) {
  if (!Number.isFinite(mm) || mm < 0) return 0;
  const stops = RAIN_MM_BREAKPOINTS;
  const n = stops.length;
  if (mm <= stops[0]) return 0;
  if (mm >= stops[n - 1]) return 1;
  for (let i = 0; i < n - 1; i++) {
    if (mm >= stops[i] && mm <= stops[i + 1]) {
      const f = (mm - stops[i]) / (stops[i + 1] - stops[i]);
      return (i + f) / (n - 1);
    }
  }
  return 1;
}
```

In `AGENTS.md`, find this sentence in the design-guardrails section (search
for "never label this ramp with fabricated mm/h numbers"):

> Because Nirmala has no real spatial mm/h intensity data (sensors only
> report binary `is_raining`), never label this ramp with fabricated mm/h
> numbers — qualitative/relative labels only, and say so in the legend note.

Replace it with:

> The Rain Density layer's mm/h tick labels are real (grid-sampled from
> OpenWeather, not fabricated) — see `RAIN_MM_BREAKPOINTS` in
> `src/constants/metrics.js` and `mmToT()` in `src/lib/rainRamp.js`. Any
> *other* rain-related display that has no real per-point measurement (e.g.
> a hypothetical future per-sensor readout) still must not fabricate mm/h
> numbers — qualitative/relative labels only for those.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rainRamp.test.js`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/constants/metrics.js src/lib/rainRamp.js src/lib/rainRamp.test.js AGENTS.md
git commit -m "feat: real mm/h rain intensity legend backed by mmToT()"
```

---

### Task 3: CanvasOverlay rain rendering rewrite

**Files:**
- Modify: `src/components/map/CanvasOverlay.jsx`
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `mmToT` from `src/lib/rainRamp.js` (Task 2). Consumes
  `windField`/`windAmbientField` objects already returned by
  `useWindField()` in `page.jsx` — each now has a `.rain: number[]` array
  (Task 1), alongside their existing `.bounds`/`.nx`/`.ny`.
- Produces: `CanvasHeatmapOverlay` gains two new props, `rainField` and
  `rainAmbientField` (same shape as `windField`/`windAmbientField` — pass
  `null` when unavailable, matching the existing null-safe pattern the rest
  of this codebase uses for these fields).

- [ ] **Step 1: Replace the top doc comment and remove now-dead rain-kernel constants**

In `src/components/map/CanvasOverlay.jsx`, replace the file's top comment
block (current lines 6-20) with:

```js
/**
 * Rain-density heatmap with a coverage base, both gated by `showCoverage`
 * (BIGNET DS v19) — this whole overlay is the "Cakupan Sensor" toggle's
 * layer; "Titik Sensor" (SensorDotLayer) is a fully independent dot layer
 * with no heatmap involvement.
 *
 * Two layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every operationally-active sensor (active or
 *    raining — i.e. not blacklisted/inactive/unavailable) emits a faint
 *    kernel → shows the live sensor network regardless of rain.
 *  - RAIN (dominant, cool→hot): real OpenWeather mm/h precipitation,
 *    grid-sampled (see src/app/api/wind/route.js's `rain` field), painted
 *    as a tiny raster sized to the grid's own resolution and smoothly
 *    upscaled via ctx.drawImage — not sensor-derived, see drawRainField.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Coverage technique = heatmap.js: greyscale alpha kernels → colourize via a
 * 1×256 LUT. Rain technique = direct per-grid-cell colorize, no kernels.
 */
```

Replace the old rain-kernel tuning constants (current lines 22-28):

```js
const RAIN_KM = 35;
const RAIN_MIN = 14, RAIN_MAX = 90;
const COVER_KM = 22;
const COVER_MIN = 8, COVER_MAX = 42;
const POINT_ALPHA = 0.5;
const RAIN_MAX_ALPHA = 220;
const COVER_MAX_ALPHA = 90;   // subtle — network base, never competes with rain
```

with (coverage constants unchanged, `RAIN_KM`/`RAIN_MIN`/`RAIN_MAX` removed
since rain no longer uses radius-based kernels, `RAIN_MAX_ALPHA` kept —
still used as rain's max opacity cap):

```js
const COVER_KM = 22;
const COVER_MIN = 8, COVER_MAX = 42;
const POINT_ALPHA = 0.5;
const RAIN_MAX_ALPHA = 220;   // rain fill's max opacity (0-255 scale)
const COVER_MAX_ALPHA = 90;   // subtle — network base, never competes with rain
```

- [ ] **Step 2: Add the `mmToT` import and `drawRainField()`**

Add the import alongside the existing ones (current lines 3-4):

```js
import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { mmToT } from '@/lib/rainRamp';
```

After `colourizeInto` (current lines 81-97) and before `renderHeatmap`, add:

```js
/**
 * Paints `field.rain` (mm/h, one value per grid cell) into `fieldCanvas` at
 * the field's own native resolution — no manual interpolation needed, since
 * ctx.drawImage's own bilinear upscaling smooths between cells when this
 * tiny canvas gets stretched onto the main overlay canvas below. Field row
 * j=0 is the SOUTH edge (see route.js's sampleGrid), so it's written to the
 * BOTTOM canvas row (ny-1-j) to keep north-at-top orientation.
 */
function paintRainFieldCanvas(fieldCanvas, field) {
  const { nx, ny, rain } = field;
  fieldCanvas.width = nx;
  fieldCanvas.height = ny;
  const fctx = fieldCanvas.getContext('2d');
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t = mmToT(rain[j * nx + i]);
      const idx = Math.round(t * 255);
      const r = RAIN_LUT[idx * 3], g = RAIN_LUT[idx * 3 + 1], b = RAIN_LUT[idx * 3 + 2];
      const alpha = t * (RAIN_MAX_ALPHA / 255);
      fctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      fctx.fillRect(i, ny - 1 - j, 1, 1);
    }
  }
}

/** Draws whichever rain field is available (dense preferred, ambient
 * fallback) onto the main canvas, scaled to its own geographic bounds. */
function drawRainField(ctx, fieldCanvas, field, projection, offsetX, offsetY) {
  if (!field || !field.nx || !field.ny || !field.rain?.length) return;
  paintRainFieldCanvas(fieldCanvas, field);

  const { bounds: B, nx, ny } = field;
  const nw = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.north, B.west));
  const se = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.south, B.east));
  const destX = nw.x - offsetX, destY = nw.y - offsetY;
  const destW = se.x - nw.x, destH = se.y - nw.y;
  if (destW <= 0 || destH <= 0) return;
  ctx.drawImage(fieldCanvas, 0, 0, nx, ny, destX, destY, destW, destH);
}
```

- [ ] **Step 3: Rewrite `renderHeatmap` and the component to use it**

Replace `renderHeatmap` (current lines 99-139) with:

```js
function renderHeatmap(canvas, shadow, coolLayer, rainFieldCanvas, stations, projection, map, showCoverage, rainField, rainAmbientField) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!showCoverage || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const coverR = Math.max(COVER_MIN, Math.min(COVER_MAX, (COVER_KM * 1000) / mpp));

  // Any operationally-live sensor (active or currently raining — i.e. not
  // blacklisted/inactive/unavailable) counts toward coverage now that rain
  // is no longer sensor-derived — a raining sensor is still part of the
  // live network, so it's no longer excluded from this base layer the way
  // the old wet/dry split required.
  const dry = [];
  for (const st of stations) {
    const isLive = !st.blacklisted && st.status !== 'blacklisted' && !st.inactive && !st.unavailable;
    if (!isLive) continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -coverR || x > W + coverR || y < -coverR || y > H + coverR) continue;
    dry.push([x, y]);
  }

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');

  // 1) coverage base (teal, subtle) — drawn first, underneath.
  if (dry.length) {
    drawKernels(sctx, W, H, dry, coverR);
    colourizeInto(coolLayer, shadow, W, H, COVER_LUT, COVER_MAX_ALPHA);
    ctx.drawImage(coolLayer, 0, 0);
  }
  // 2) rain intensity (real OpenWeather mm/h) — composited on top.
  drawRainField(ctx, rainFieldCanvas, rainField || rainAmbientField, projection, canvas._offsetX, canvas._offsetY);
}
```

(`RAIN_KM`/`RAIN_MIN`/`RAIN_MAX` were already removed from the constants in
Step 1, so `rainR`/`pad` — which only fed the old wet-kernel radius/cull
margin — are gone too; `coverR` alone now bounds the coverage cull.)

Replace the component (current lines 141-215) with:

```jsx
export default function CanvasHeatmapOverlay({ stations, showCoverage = true, rainField = null, rainAmbientField = null }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const coolRef = useRef(null);
  const rainFieldCanvasRef = useRef(null);
  const stationsRef = useRef(stations);
  const coverageRef = useRef(showCoverage);
  const rainFieldRef = useRef(rainField);
  const rainAmbientFieldRef = useRef(rainAmbientField);
  const rafRef = useRef(0);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { coverageRef.current = showCoverage; }, [showCoverage]);
  useEffect(() => { rainFieldRef.current = rainField; }, [rainField]);
  useEffect(() => { rainAmbientFieldRef.current = rainAmbientField; }, [rainAmbientField]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    shadowRef.current = document.createElement('canvas');
    coolRef.current = document.createElement('canvas');
    rainFieldCanvasRef.current = document.createElement('canvas');

    const scheduleDraw = (fn) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; fn(); });
    };

    class HeatmapOverlay extends window.google.maps.OverlayView {
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
          renderHeatmap(canvas, shadowRef.current, coolRef.current, rainFieldCanvasRef.current,
            stationsRef.current, projection, map, coverageRef.current,
            rainFieldRef.current, rainAmbientFieldRef.current)
        );
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new HeatmapOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?.draw(); }, [stations, showCoverage, rainField, rainAmbientField]);

  return null;
}
```

- [ ] **Step 4: Wire `windField`/`windAmbientField` into `page.jsx`**

In `src/app/(dashboard)/page.jsx`, find the `CanvasHeatmapOverlay` usage
(current lines 351-353):

```jsx
{(activeLayer === 'rain' || activeLayer === 'himawari') && (
  <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
)}
```

Replace with:

```jsx
{(activeLayer === 'rain' || activeLayer === 'himawari') && (
  <CanvasHeatmapOverlay
    stations={SENSOR_STATIONS}
    showCoverage={showCoverage}
    rainField={windField}
    rainAmbientField={windAmbientField}
  />
)}
```

(`windField`/`windAmbientField` are already in scope here — declared at
`const { field: windField, ambientField: windAmbientField, status: windFieldStatus } = useWindField(mapBounds);`,
current line 216 — no new state/hook needed.)

- [ ] **Step 5: Manual smoke check (no automated test — canvas rendering)**

This task has no unit test (canvas drawing isn't testable under
`node --test` without a DOM). Instead, run the dev server and confirm no
console errors:

Run: `npm run dev` (or use the already-running dev server), open the app,
select the Rain layer (default), open browser devtools console.
Expected: no thrown errors from `CanvasOverlay.jsx` or `page.jsx`; the
"Sensor Coverage" toggle still shows/hides the teal base as before.

(Full visual verification — confirming rain color actually appears and
tracks live OpenWeather data — happens in Task 5, after Task 4 also lands,
so the OpenWeather toggle UI is in its final state for one combined visual
pass.)

- [ ] **Step 6: Commit**

```bash
git add src/components/map/CanvasOverlay.jsx "src/app/(dashboard)/page.jsx"
git commit -m "feat: render Rain Density from real OpenWeather mm/h grid data"
```

---

### Task 4: Remove "Rain" from the OpenWeather tile toggle

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces: n/a (UI-only change, no other file references
  `precipitation_new` — confirmed by grep during design; `OpenWeatherLayer`'s
  `layer` prop still accepts any OpenWeather layer id string, unchanged).

- [ ] **Step 1: Remove the entry**

In `src/components/dashboard/SegmentTogglePanel.jsx`, find `OWM_LAYERS`
(current lines 143-147):

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'precipitation_new', label: 'Rain' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

Replace with:

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

- [ ] **Step 2: Verify no other reference to `precipitation_new` remains**

Run: `grep -rn "precipitation_new" src`
Expected: no output (the only reference was the `OWM_LAYERS` entry just
removed).

- [ ] **Step 3: Manual check**

Run the dev server, open the Space segment panel, confirm the OpenWeather
row now shows only two buttons ("Off"/"Clouds"), and that if `owmLayer` was
previously persisted as `'precipitation_new'` in any local state it doesn't
error (it's plain `useState(null)` in `page.jsx`, so this only matters
within a single already-open session — reloading resets it to `null`
regardless).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx
git commit -m "feat: drop the redundant OpenWeather raw-tile Rain toggle"
```

---

### Task 5: Full manual verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests pass, including the new `route.test.js` (Task 1) and
`rainRamp.test.js` (Task 2), plus every pre-existing test (`sensorColor`,
`provinceFilter`, `windStats`, `meshLayer`, `jmaHimawari`, etc. — no
regressions).

- [ ] **Step 2: Visual check — rain color appears and matches live weather**

Run the dev server, open the dashboard, ensure the "Rain" ground layer is
active (default) and "Sensor Coverage" is on. Confirm colored area(s)
appear wherever OpenWeather currently reports live precipitation near
Indonesia — cross-check against a live external weather map for the same
moment (e.g. openweathermap.org's own map, or any weather app) for rough
agreement in location. Confirm the legend (`ColorRampLegend`, bottom-right)
shows tick labels `0`, `2.5`, `7.6`, `50+ mm/h` instead of the old
Low/Moderate/High/Extreme words.

- [ ] **Step 3: Visual check — coverage base still works**

Toggle "Sensor Coverage" off, confirm both the teal base and any rain color
disappear together (matches existing behavior — the whole heatmap overlay
is gated by this one toggle, unchanged). Toggle back on, confirm both
reappear.

- [ ] **Step 4: Visual check — graceful fallback with no data**

Pan the map to a location far from both the dense and ambient OpenWeather
grids' typical coverage (e.g. mid-Pacific, far outside Indonesia) — or, if
`OPENWEATHER_API_KEY` is unset in the local `.env.local`, this is already
the case everywhere. Confirm no console errors, and confirm the coverage
teal base (if any active sensors are in view) still renders normally with
simply no rain color overlaid.

- [ ] **Step 5: Visual check — OpenWeather toggle**

Confirm the OpenWeather row under Space segment now shows only "Off" and
"Clouds" (no "Rain" button), and that "Clouds" still works exactly as
before (unaffected raw OpenWeather tile).

- [ ] **Step 6: Confirm no regressions in sensor-based dot/drawer status colors**

Open a sensor's detail drawer, confirm its status chip still shows
correctly (this feature didn't touch `SensorDetailDrawer.jsx`/
`SensorDotLayer.jsx`/`sensorColor.js` — sanity check only).
