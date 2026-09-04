# OpenWeather Rain Toggle Rainbow Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OpenWeather "Rain" tile toggle's flat-blue
`precipitation_new` image with a self-drawn rainbow raster from real
OpenWeather mm/h data, while leaving "Rain Density" (the sensor-based ground
layer) exactly as it was before this feature branch started.

**Architecture:** Revert the earlier (superseded) implementation direction
out of `CanvasOverlay.jsx`/`metrics.js`/`page.jsx`, then build the rainbow
rendering as a new independent map-layer component (`OpenWeatherRainLayer.jsx`,
structured like `WindParticleLayer.jsx`/the old `CanvasHeatmapOverlay`'s
`OverlayView`), toggled by `owmLayer === 'rain'` — a sibling to the existing
tile-image `OpenWeatherLayer`, not part of it.

**Tech Stack:** Next.js (App Router), React, Canvas 2D (`OverlayView` +
`drawImage`), `@vis.gl/react-google-maps`.

**Spec:** `docs/superpowers/specs/2026-09-03-openweather-rain-density-design.md`

## Global Constraints

- "Rain Density" (`activeLayer === 'rain'`, `CanvasOverlay.jsx`) must end up
  byte-for-byte equivalent in *behavior* to how it worked before this whole
  feature branch started: sensor `is_raining`-driven kernels, qualitative
  Low/Moderate/High/Extreme legend. No real mm/h data feeds it.
- Zero new OpenWeather API calls — `OpenWeatherRainLayer` reuses the
  already-fetched `windField`/`windAmbientField` (`useWindField(mapBounds)`
  in `page.jsx`, unconditional, not gated by any toggle).
- No new dependencies.
- `RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50]` (already in `src/constants/metrics.js`)
  stays the single source of truth for the new `METRICS.openweatherRain`
  legend's tick labels and `mmToT()`'s mapping — both already built, unchanged.
- A missing/failed OpenWeather field must render as "no rain drawn"
  (transparent), never a crash.

---

## File Structure

- `src/components/map/CanvasOverlay.jsx` — **revert**: remove all rain-raster
  code added by the superseded attempt; restore original sensor-kernel
  rain+coverage rendering.
- `src/constants/metrics.js` — **modify**: revert `METRICS.rain` to its
  original qualitative form; add a new, separate `METRICS.openweatherRain`
  entry for the new overlay's legend.
- `src/app/(dashboard)/page.jsx` — **modify**: revert `CanvasHeatmapOverlay`'s
  props (drop `rainField`/`rainAmbientField`); mount the new
  `OpenWeatherRainLayer`; compute which legend key to show.
- `src/components/map/OpenWeatherRainLayer.jsx` — **create**: the new
  independent rainbow-raster overlay.
- `src/components/dashboard/SegmentTogglePanel.jsx` — **modify**: restore the
  "Rain" button in `OWM_LAYERS`; fix the OpenWeather card's tooltip copy.
- `AGENTS.md` — **modify**: third revision of the rain-ramp guardrail
  paragraph; add a `_v4_` changelog line.

---

### Task 1: Revert Rain Density to its original sensor-based form

**Files:**
- Modify: `src/components/map/CanvasOverlay.jsx`
- Modify: `src/constants/metrics.js`
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CanvasHeatmapOverlay` reverts to its original prop signature
  `{ stations, showCoverage = true }` — no `rainField`/`rainAmbientField`.
  `METRICS.rain` reverts to its original shape (same `key`/`label`/`icon`
  fields, original `tickLabels`/`legendNote`/comment). `RAIN_MM_BREAKPOINTS`
  (already in the file) is untouched — Task 2 will consume it for a new,
  separate metrics entry.

- [ ] **Step 1: Revert `CanvasOverlay.jsx` to sensor-based rain+coverage**

Replace the **entire contents** of `src/components/map/CanvasOverlay.jsx`
with:

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Rain-density heatmap with a coverage base, both gated by `showCoverage`
 * (BIGNET DS v19) — this whole overlay is the "Cakupan Sensor" toggle's
 * layer; "Titik Sensor" (SensorDotLayer) is a fully independent dot layer
 * with no heatmap involvement.
 *
 * The live feed is BINARY (is_raining) — no numeric intensity to interpolate.
 * Two honest density layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every ACTIVE, non-raining sensor emits a faint
 *    kernel → shows the live sensor network even when it isn't raining.
 *  - RAIN (dominant, cool→hot): every RAINING sensor emits a stronger kernel;
 *    overlaps accumulate → isolated rain = modest, clustered rain = hot core.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Technique = heatmap.js: greyscale alpha kernels → colourize via a 1×256 LUT.
 */

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

function buildLUT(ramp) {
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

const RAIN_LUT = buildLUT(RAIN_RAMP);
const COVER_LUT = buildLUT(COVER_RAMP);

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function drawKernels(sctx, W, H, pts, radius) {
  sctx.clearRect(0, 0, W, H);
  for (const [x, y] of pts) {
    const g = sctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${POINT_ALPHA})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(x, y, radius, 0, Math.PI * 2);
    sctx.fill();
  }
}

/** Colourize the shadow's alpha channel through a LUT into a layer canvas. */
function colourizeInto(layer, shadow, W, H, lut, maxAlpha) {
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

function renderHeatmap(canvas, shadow, coolLayer, warmLayer, stations, projection, map, showCoverage) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!showCoverage || !stations.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const rainR = Math.max(RAIN_MIN, Math.min(RAIN_MAX, (RAIN_KM * 1000) / mpp));
  const coverR = Math.max(COVER_MIN, Math.min(COVER_MAX, (COVER_KM * 1000) / mpp));
  const pad = Math.max(rainR, coverR);

  const wet = [], dry = [];
  for (const st of stations) {
    const isActive = !st.blacklisted && !st.inactive && !st.unavailable && st.status === 'active';
    if (!st.isRaining && !isActive) continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    if (st.isRaining) wet.push([x, y]);
    else if (isActive) dry.push([x, y]);
  }

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');

  // 1) coverage base (teal, subtle) — drawn first, underneath.
  if (dry.length) {
    drawKernels(sctx, W, H, dry, coverR);
    colourizeInto(coolLayer, shadow, W, H, COVER_LUT, COVER_MAX_ALPHA);
    ctx.drawImage(coolLayer, 0, 0);
  }
  // 2) rain density (cool→hot, dominant) — composited on top.
  if (wet.length) {
    drawKernels(sctx, W, H, wet, rainR);
    colourizeInto(warmLayer, shadow, W, H, RAIN_LUT, RAIN_MAX_ALPHA);
    ctx.drawImage(warmLayer, 0, 0);
  }
}

export default function CanvasHeatmapOverlay({ stations, showCoverage = true }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const coolRef = useRef(null);
  const warmRef = useRef(null);
  const stationsRef = useRef(stations);
  const coverageRef = useRef(showCoverage);
  const rafRef = useRef(0);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { coverageRef.current = showCoverage; }, [showCoverage]);

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
    warmRef.current = document.createElement('canvas');

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
          renderHeatmap(canvas, shadowRef.current, coolRef.current, warmRef.current,
            stationsRef.current, projection, map, coverageRef.current)
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

  useEffect(() => { overlayRef.current?.draw(); }, [stations, showCoverage]);

  return null;
}
```

- [ ] **Step 2: Revert `METRICS.rain` and add `METRICS.openweatherRain` in `src/constants/metrics.js`**

Current file has (lines 1-5, keep these two constants exactly as-is — do
NOT touch or remove them, `mmToT()` still needs `RAIN_MM_BREAKPOINTS`):

```js
// Sensor staleness thresholds, measured against lastUpdate/scrapedAt.
// Unavailable = unreachable for 2h; Inactive = no data at all for 24h
// (a superset of Unavailable — see statusBucket() in src/lib/sensorColor.js).
export const UNAVAILABLE_AFTER_MS = 2 * 60 * 60 * 1000;
export const INACTIVE_AFTER_MS = 24 * 60 * 60 * 1000;
```

Replace everything from the doc comment through the end of the `rain:` block
(currently lines 7-35, i.e. from `/**` right after those two constants
through the `rain: { ... },` block's closing `},` just before `mesh:`) with:

```js
/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity or
 * temperature nationwide. So the only honest national layer is rain DENSITY
 * (concentration of raining sensors), not "mm/jam". Temperature is removed
 * (no data source anywhere).
 */

// Standard meteorological hourly-intensity classes (WMO-style): light,
// moderate, heavy, violent — mm of rain per hour. Shared by
// METRICS.openweatherRain's legend tick labels below and by
// src/lib/rainRamp.js's mmToT(), so the class boundaries always land
// exactly on the legend's tick marks (ColorRampLegend draws tickLabels at
// even 0/33/66/100% positions regardless of the underlying values). NOT
// used by METRICS.rain (Rain Density) — that stays qualitative/sensor-based,
// see its own comment below.
export const RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50];

export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Rain Density',
    icon: 'material-symbols:rainy-rounded',
    // Full meteorological precipitation spectrum (Windy/BMKG-style) — an
    // approved exception to "no rainbow" in AGENTS.md, always paired with
    // qualitative tickLabels below rather than fabricated mm/h numbers
    // (Nirmala has no spatial mm/h intensity data, only binary is_raining).
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['Low', 'Moderate', 'High', 'Extreme'],
    legendNote: 'Density of sensors reporting rain — a relative category, not a per-point mm/hour measurement.',
  },
  openweatherRain: {
    key: 'openweatherRain',
    label: 'OpenWeather Rain',
    icon: 'material-symbols:rainy-rounded',
    // Same rainbow spectrum as Rain Density above, but this one legitimately
    // has real per-point mm/h data behind it (OpenWeather's grid-sampled
    // rain field, see src/app/api/wind/route.js + OpenWeatherRainLayer.jsx)
    // — a genuinely different data source from the sensor-based Rain
    // Density metric above, hence a separate METRICS entry rather than
    // reusing `rain`.
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['0', '2.5', '7.6', '50+ mm/h'],
    legendNote: 'Rainfall intensity from OpenWeather, interpolated across a coarse grid — not a per-sensor reading.',
  },
```

(The rest of the file — `mesh:` and `himawari:` entries, and the closing
`};` — is unchanged.)

- [ ] **Step 3: Revert `page.jsx`'s `CanvasHeatmapOverlay` usage**

Find (current lines 351-358):

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

Replace with:

```jsx
              {(activeLayer === 'rain' || activeLayer === 'himawari') && (
                <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
              )}
```

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: same baseline as before this task (2 pre-existing, unrelated
`colorScales.test.js` failures; everything else — including `route.test.js`,
`rainRamp.test.js`, `sensorColor.test.js` — passes). This task touches no
test files and no logic those tests cover changes in a way that should
affect them.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/CanvasOverlay.jsx src/constants/metrics.js "src/app/(dashboard)/page.jsx"
git commit -m "revert: restore sensor-based Rain Density, add openweatherRain metric"
```

---

### Task 2: New `OpenWeatherRainLayer` component

**Files:**
- Create: `src/components/map/OpenWeatherRainLayer.jsx`

**Interfaces:**
- Consumes: `mmToT` from `src/lib/rainRamp.js` (already built, unchanged).
  Expects `field`/`ambientField` props shaped like `useWindField()`'s return
  values — `{ bounds: {north,south,east,west}, nx, ny, rain: number[] }` (the
  `rain` array already exists on these objects from this feature's Task 1;
  `u`/`v`/`speed` are ignored here).
- Produces: `export default function OpenWeatherRainLayer({ show, field, ambientField })`
  — a map-layer component with no other exports, meant to be mounted as a
  sibling inside `<GoogleMapWrapper>` alongside `OpenWeatherLayer`,
  `CanvasHeatmapOverlay`, etc. (Task 3 wires this into `page.jsx`.)

- [ ] **Step 1: Create the component**

Create `src/components/map/OpenWeatherRainLayer.jsx`:

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { mmToT } from '@/lib/rainRamp';

/**
 * OpenWeather "Rain" toggle overlay — a self-drawn rainbow raster from real
 * per-point OpenWeather mm/h data (see src/app/api/wind/route.js's `rain`
 * field), replacing OpenWeather's own flat-blue precipitation_new tile.
 * Independent of ground-layer selection (Rain Density/Mesh/Himawari) — its
 * only visibility control is the `show` prop (owmLayer === 'rain' in
 * page.jsx). Structurally a sibling of OpenWeatherLayer.jsx (the raw-tile
 * component, used for Clouds), not a modification of it.
 *
 * Not related to "Rain Density" (CanvasOverlay.jsx), which stays
 * sensor-based (binary is_raining) and is unaffected by this component.
 */

const RAIN_MAX_ALPHA = 220; // rain fill's max opacity (0-255 scale)

// Full meteorological precipitation spectrum (Windy/BMKG-style) — approved
// exception to "no rainbow" in AGENTS.md design guardrails, paired with a
// numeric mm/h tick legend (METRICS.openweatherRain in constants/metrics.js).
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];

function buildLUT(ramp) {
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

const RAIN_LUT = buildLUT(RAIN_RAMP);

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
  // google.maps.LatLng normalizes lng into [-180, 180) — an east edge of
  // exactly 180 silently wraps to -180 (equal to the west edge), collapsing
  // destW to 0 and making the whole draw disappear via the guard below.
  // Clamp just under 180 so a world-spanning field (e.g. the ambient grid,
  // AMBIENT_BOUNDS in route.js) still projects to a real width.
  const eastLng = B.east >= 180 ? 179.999 : B.east;
  const nw = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.north, B.west));
  const se = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.south, eastLng));
  const destX = nw.x - offsetX, destY = nw.y - offsetY;
  const destW = se.x - nw.x, destH = se.y - nw.y;
  if (destW <= 0 || destH <= 0) return;
  ctx.drawImage(fieldCanvas, 0, 0, nx, ny, destX, destY, destW, destH);
}

export default function OpenWeatherRainLayer({ show = false, field = null, ambientField = null }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldCanvasRef = useRef(null);
  const showRef = useRef(show);
  const fieldRef = useRef(field);
  const ambientFieldRef = useRef(ambientField);

  useEffect(() => { showRef.current = show; }, [show]);
  useEffect(() => { fieldRef.current = field; }, [field]);
  useEffect(() => { ambientFieldRef.current = ambientField; }, [ambientField]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    fieldCanvasRef.current = document.createElement('canvas');

    const render = () => {
      const projection = overlayRef.current?.getProjection();
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!projection || !showRef.current) return;
      const activeField = fieldRef.current || ambientFieldRef.current;
      drawRainField(ctx, fieldCanvasRef.current, activeField, projection, canvas._offsetX, canvas._offsetY);
    };

    class RainOverlay extends window.google.maps.OverlayView {
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
        render();
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new RainOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._render = render;

    return () => { overlay.setMap(null); };
  }, [map]);

  useEffect(() => { overlayRef.current?._render?.(); }, [show, field, ambientField]);

  return null;
}
```

- [ ] **Step 2: Sanity-check the new file has no syntax errors**

Run: `node --check src/components/map/OpenWeatherRainLayer.jsx 2>&1 || true`

This won't fully validate JSX (Node's `--check` doesn't parse JSX), but
confirms there's no gross typo. The real check is Task 3's manual dev-server
verification once this component is actually mounted. If you have a way to
run the Next.js dev server / build already in this environment, do a fuller
check here instead (e.g. `npx next build --no-lint` and confirm no error
mentioning this file) — use whichever is available.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/OpenWeatherRainLayer.jsx
git commit -m "feat: add OpenWeatherRainLayer, a rainbow raster overlay from real mm/h data"
```

---

### Task 3: Wire the toggle, page, legend, and docs

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx`
- Modify: `src/app/(dashboard)/page.jsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `OpenWeatherRainLayer` (Task 2) — default export, props
  `{ show, field, ambientField }`. `METRICS.openweatherRain` (Task 1) — used
  as a legend key.
- Produces: n/a (final UI wiring, nothing downstream depends on this task).

- [ ] **Step 1: Restore the "Rain" button in `OWM_LAYERS`**

In `src/components/dashboard/SegmentTogglePanel.jsx`, find (current lines
143-146):

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

Replace with:

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

(`'rain'` is a new internal id, not an OpenWeather tile id — this mode no
longer fetches OpenWeather's own `precipitation_new` tile at all, so it
must not collide with `'clouds_new'`, the one real tile id still in use.)

- [ ] **Step 2: Fix the OpenWeather card's tooltip copy**

In the same file, find (current line 176):

```jsx
        info="Cloud cover layer from the OpenWeather global weather data provider."
```

Replace with:

```jsx
        info="Rain and cloud cover layers from the OpenWeather global weather data provider."
```

- [ ] **Step 3: Wire `page.jsx` — mount `OpenWeatherRainLayer`, guard the tile layer, compute the legend key**

Add the import alongside the other map-layer imports (near the existing
`import OpenWeatherLayer from '@/components/map/OpenWeatherLayer';` line):

```js
import OpenWeatherRainLayer from '@/components/map/OpenWeatherRainLayer';
```

Find the `<OpenWeatherLayer .../>` usage (current lines 347-350):

```jsx
              <OpenWeatherLayer
                layer={owmLayer}
                opacity={OWM_OPACITY[mode][activeLayer === 'himawari' ? 'himawari' : 'normal']}
              />
```

Replace with (guard so `'rain'` — no longer a real OpenWeather tile id —
never reaches the tile-fetching component, and mount the new rainbow
overlay as an independent sibling):

```jsx
              <OpenWeatherLayer
                layer={owmLayer === 'clouds_new' ? 'clouds_new' : null}
                opacity={OWM_OPACITY[mode][activeLayer === 'himawari' ? 'himawari' : 'normal']}
              />
              <OpenWeatherRainLayer
                show={owmLayer === 'rain'}
                field={windField}
                ambientField={windAmbientField}
              />
```

Find the `legendProps` line (current line 408):

```js
              const legendProps = { activeLayer, showCoverage, meshDistanceRange };
```

Replace with (the OpenWeather Rain toggle's legend takes precedence over
whichever ground layer is selected, per the confirmed design — it's an
independent overlay, not tied to ground-layer choice):

```js
              const legendMetricKey = owmLayer === 'rain' ? 'openweatherRain' : activeLayer;
              const legendProps = { activeLayer: legendMetricKey, showCoverage, meshDistanceRange };
```

(`ColorRampLegend`/`ColorRampLegendContent` need no code changes — they
already do a plain `METRICS[activeLayer]` lookup by whatever key they're
given, and their `activeLayer === 'rain'`-specific special-casing — e.g.
the "Active sensor network (not raining)" caption — simply won't fire for
`'openweatherRain'`, which is correct: that caption is sensor-specific.)

- [ ] **Step 4: Third revision of the `AGENTS.md` rain-ramp guardrail**

Find this paragraph (search for "never label this ramp with fabricated
mm/h numbers"):

```
The Rain Density layer's mm/h tick labels are real (grid-sampled from
OpenWeather, not fabricated) — see `RAIN_MM_BREAKPOINTS` in
`src/constants/metrics.js` and `mmToT()` in `src/lib/rainRamp.js`. Any
*other* rain-related display that has no real per-point measurement (e.g.
a hypothetical future per-sensor readout) still must not fabricate mm/h
numbers — qualitative/relative labels only for those.
```

Replace with:

```
Rain Density's own tick labels stay qualitative (Rendah/Sedang/Tinggi/
Ekstrem / Low/Moderate/High/Extreme) — it has no real per-point
measurement (sensors only report binary `is_raining`), so it must not
fabricate mm/h numbers. Separately, the OpenWeather "Rain" toggle
(`METRICS.openweatherRain` in `src/constants/metrics.js`,
`OpenWeatherRainLayer.jsx`) is a different layer with a different, real
data source — OpenWeather's own grid-sampled mm/h precipitation data (see
`RAIN_MM_BREAKPOINTS` in `src/constants/metrics.js` and `mmToT()` in
`src/lib/rainRamp.js`) — so its real mm/h tick labels are legitimate and
must not be "corrected" back to qualitative words. Any *other*
rain-related display with no real per-point measurement still must not
fabricate mm/h numbers.
```

Also add a changelog line after the existing `_v3 — ..._` line near the top
of the file (search for `_v3 — 2026-08-28: added exception for
meteorological-convention color spectrums (rain indicator)._`):

```
_v4 — 2026-09-03: split the rain-ramp exception into two layers — Rain Density stays qualitative/sensor-based, a new OpenWeather Rain toggle uses real mm/h data._
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: same baseline as Task 1 (2 pre-existing, unrelated
`colorScales.test.js` failures; everything else passes). This task is UI
wiring + docs, no test files touched.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx "src/app/(dashboard)/page.jsx" AGENTS.md
git commit -m "feat: restore OpenWeather Rain toggle, wire it to the new rainbow overlay"
```

---

### Task 4: Full manual verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests pass except the 2 pre-existing, unrelated
`colorScales.test.js` failures (confirmed byte-identical to `main` earlier
in this branch's history) — no new failures from Tasks 1-3.

- [ ] **Step 2: Visual check — Rain Density unaffected**

Run the dev server, open the dashboard, select ground layer "Rain"
(default). Confirm it looks and behaves exactly as it did before this
whole feature branch: sensor dots' `is_raining` state drives red/hot
kernels, teal coverage underneath, qualitative legend
(Low/Moderate/High/Extreme). The OpenWeather Rain toggle should have no
effect on this ground layer's own rendering.

- [ ] **Step 3: Visual check — OpenWeather Rain toggle shows the rainbow overlay**

In the Space segment panel, click OpenWeather "Rain". Confirm a colored
raster appears (not flat blue), tracking real OpenWeather precipitation
data, and that a legend appears showing `METRICS.openweatherRain`'s real
mm/h tick labels (`0`, `2.5`, `7.6`, `50+ mm/h`) — this should show
regardless of which ground layer (Rain/Mesh/Himawari) is currently
selected. Switch ground layer to Mesh or Himawari while OpenWeather Rain
stays on: confirm the rainbow overlay and its legend persist.

- [ ] **Step 4: Visual check — OpenWeather Off/Clouds still work**

Click OpenWeather "Off": confirm the rainbow overlay and its legend both
disappear. Click "Clouds": confirm the original flat OpenWeather tile
image loads as before (unaffected by this feature), and its legend does
NOT show `METRICS.openweatherRain` (since `owmLayer !== 'rain'`, the
ground layer's own legend applies instead).

- [ ] **Step 5: Visual check — world zoom (antimeridian fix)**

With OpenWeather Rain toggle on, zoom out to a world/near-global view
(where only the ambient field is available, not the dense viewport grid).
Confirm the rainbow raster still renders somewhere (not silently blank) —
this exercises the `eastLng` clamp in `drawRainField`.

- [ ] **Step 6: Confirm no regressions in wind particles or sensor dots**

Toggle Wind (particles) on/off — unaffected by this feature (still reads
the same `windField`/`windAmbientField`, just a different consumer). Open
a sensor's detail drawer — unaffected (`SensorDetailDrawer.jsx`/
`SensorDotLayer.jsx`/`sensorColor.js` untouched by any task in this plan).
