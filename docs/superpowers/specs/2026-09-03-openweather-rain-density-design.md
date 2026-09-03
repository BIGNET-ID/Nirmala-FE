# OpenWeather-driven Rain Density (real mm/h, area rainbow)

## Context

The "Rain Density" ground layer (`activeLayer === 'rain'`, rendered by
`CanvasHeatmapOverlay` in `src/components/map/CanvasOverlay.jsx`) currently
colors "wet" areas by accumulating radial-gradient kernels at every sensor
station reporting `isRaining: true`, then colorizing the accumulated density
through the `RAIN_RAMP` LUT. This is a density *proxy* — Nirmala's sensors
only report a binary `is_raining` flag, never an intensity — so the ramp's
tick labels are deliberately qualitative ("Low/Moderate/High/Extreme") and
`METRICS.rain.legendNote` explicitly disclaims "not a per-point mm/hour
measurement" (see `src/constants/metrics.js` and the matching guardrail in
`AGENTS.md`).

Separately, `/api/wind/route.js` already grid-samples OpenWeather's Current
Weather Data API (`data/2.5/weather`) per point for the wind particle layer
(`src/components/map/WindParticleLayer.jsx`) — see
`docs/superpowers/specs/2026-09-02-wind-particle-speed-control-design.md`.
That same per-point response also carries a `rain` object (`rain.1h`,
sometimes `rain.3h`) with actual precipitation volume in mm — real,
spatially-distributed intensity data that today is fetched but never read.

This spec replaces the sensor-density proxy with that real OpenWeather
precipitation data, rendered as a smooth colored area (not discrete blobs)
using the existing `RAIN_RAMP` rainbow, with legend ticks now showing real
mm/h thresholds. It adds **zero** new OpenWeather API calls — the grid is
already being fetched continuously for wind (`useWindField` in `page.jsx` is
not gated by the Wind toggle).

Also removed: the separate "Rain" option in the OpenWeather tile toggle
(`Off / Rain / Clouds` in `SegmentTogglePanel.jsx`), since rain now always
renders as part of the primary Rain Density layer rather than as an optional
raw-tile overlay. "Clouds" is untouched.

## Data flow

`src/app/api/wind/route.js`'s `sampleGrid()` currently does:

```js
const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?...`);
const j = await r.json();
const speed = j?.wind?.speed || 0;
const deg = j?.wind?.deg || 0;
// ... u, v, speed
```

Add rain extraction alongside it, with a small pure helper (testable without
a live fetch):

```js
// exported for unit testing
export function extractRainMm(json) {
  const r = json?.rain;
  if (!r) return 0;
  if (typeof r['1h'] === 'number') return r['1h'];
  if (typeof r['3h'] === 'number') return r['3h'] / 3; // approximate hourly rate
  return 0;
}
```

`sampleGrid()`'s per-point map gains `rain: extractRainMm(j)`, and its return
object gains a `rain: number[]` array (same `+toFixed(2)` rounding pattern as
`speed`) alongside the existing `u`/`v`/`speed`. Both the dense (viewport)
and ambient (near-global) grids go through the same `sampleGrid()`, so both
gain `rain` automatically — no separate fetch, no separate cache, no change
to the existing TTL/throttle/budget logic (`VIEWPORT_TTL_MS`,
`AMBIENT_TTL_MS`, `MIN_BATCH_GAP_MS` etc. all untouched).

`useWindField(bounds)` (`src/hooks/useWindField.js`) needs no structural
change — `field`/`ambientField` already pass the route's JSON through
verbatim, so `field.rain` / `ambientField.rain` are simply present once the
route returns them. Its doc comment gets a one-line update noting it now
also feeds the Rain Density layer, not just wind.

`page.jsx` already computes `windField`/`windAmbientField` via
`useWindField(mapBounds)` unconditionally (not gated by `showWind`). Pass
both straight into `CanvasHeatmapOverlay` as new props:

```jsx
<CanvasHeatmapOverlay
  stations={SENSOR_STATIONS}
  showCoverage={showCoverage}
  rainField={windField}
  rainAmbientField={windAmbientField}
/>
```

(Named `rainField`/`rainAmbientField` rather than reusing `windField` as the
prop name, so `CanvasOverlay.jsx` doesn't need to know these objects are
"wind" grids — it only cares about the `rain` array they carry.)

## Rendering (`CanvasOverlay.jsx`)

**Coverage** (the subtle teal "active sensor network" base) is unchanged —
still built from `stations` exactly as today.

**Rain** is rebuilt from a scalar field instead of point kernels:

1. A small offscreen "field canvas" sized to the grid's *own* resolution
   (`nx × ny` — the dense grid is `9×6`, see `GRID_NX`/`GRID_NY` in
   `route.js`). Each field-canvas pixel `(i, j)` corresponds one-to-one to
   grid cell `field.rain[j*nx+i]` — no interpolation needed to *build* this
   tiny raster, since its pixel grid already *is* the field's native grid.
   Map each cell's mm value through `mmToT` (see Legend section) into
   `RAIN_LUT`, and set that pixel's RGBA — alpha scaled by `t` (0 mm → fully
   transparent, so dry areas show the basemap/coverage layer underneath, not
   a flat color). Field row `j=0` is the *south* edge (per `route.js`'s
   `sampleGrid`), so it's written to the *bottom* canvas row (`ny-1-j`) to
   keep north-at-top orientation.

2. Draw that small field canvas onto the main overlay canvas via
   `ctx.drawImage(fieldCanvas, 0, 0, nx, ny, destX, destY, destW, destH)`,
   where the destination rect comes from projecting the field's own
   `bounds` (NW/SE corners) through the map's projection — the same
   lat/lng-to-div-pixel conversion the existing kernel code already uses for
   station points. `drawImage`'s native bilinear upscaling (the canvas 2D
   default; no extra code needed) smooths between grid cells for the "area"
   look — avoids per-screen-pixel work entirely (bounded by `nx*ny` ≈ 54
   cell writes + one `drawImage` call, not `W*H` ≈ 900,000 canvas pixels).

3. Field selection: prefer the dense `rainField` whenever it's non-null
   (`CanvasOverlay` already receives it pre-fetched at whatever viewport the
   map is idled at); fall back to `rainAmbientField` only when the dense one
   is `null` (matches the `skipped`/too-wide-viewport case in `route.js`).
   No blending between the two — same simplification `WindParticleLayer`
   already makes per-particle, just applied once for the whole overlay
   instead of per point.

`RAIN_KM`/`RAIN_MIN`/`RAIN_MAX`/`POINT_ALPHA`/`RAIN_MAX_ALPHA` (the old
kernel-radius tuning constants) are removed along with the kernel-based wet
rendering — replaced by the raster approach above. `COVER_KM` and friends
(coverage side) are untouched. `RAIN_RAMP`/`RAIN_LUT`/`buildLUT` are reused
as-is; only what feeds them (`t`) changes source.

## Legend: real mm/h thresholds

`src/constants/metrics.js` gains a shared breakpoint list:

```js
// Standard meteorological hourly-intensity classes (WMO-style): light,
// moderate, heavy, violent. Shared by the legend tick labels and by
// CanvasOverlay's mmToT() so the class boundaries always land exactly on
// the legend's tick marks (see ColorRampLegend, which draws tickLabels at
// even 0/33/66/100% positions regardless of the underlying values).
export const RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50];
```

`METRICS.rain` changes:

```js
tickLabels: ['0', '2.5', '7.6', '50+ mm/h'],
legendNote: 'Rainfall intensity from OpenWeather, interpolated across a coarse grid — not a per-sensor reading.',
```

`CanvasOverlay.jsx` adds `mmToT(mm)`, a piecewise-linear map from
`RAIN_MM_BREAKPOINTS` values to the ramp's `t` domain `[0, 0.333, 0.667, 1]`
(four breakpoints → four evenly-spaced `t` stops, matching the legend's four
tick positions), clamped to `1` beyond the last breakpoint:

```js
import { RAIN_MM_BREAKPOINTS } from '@/constants/metrics';

export function mmToT(mm) {
  if (!Number.isFinite(mm)) return 0; // defensive: bad/missing grid data reads as dry, not saturated
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

`AGENTS.md`'s rain-ramp exception note gets a small edit: drop the sentence
forbidding fabricated mm/h numbers *for this layer specifically* (the
constraint was "Nirmala has no real spatial mm/h intensity data" — that's no
longer true for the OpenWeather-sourced Rain Density layer; sensor-only
per-point data, e.g. any future per-station numeric readout, remains
unfabricated-only).

## OpenWeather tile toggle

`SegmentTogglePanel.jsx`'s `OWM_LAYERS` drops the `precipitation_new` entry:

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

`owmLayer` in `page.jsx` can no longer be `'precipitation_new'` in practice;
no other code branches on that specific value today (checked: only
`OpenWeatherLayer`'s `layer` prop and the `OWM_LAYERS` map reference it), so
no further cleanup needed there.

## Error handling

- No field yet / OpenWeather key missing / fetch error: `rainField` and
  `rainAmbientField` are both `null` — the raster step is skipped entirely
  (same `if (!field) return null` guard style already used throughout this
  codebase's field-consuming code), so the Rain Density layer just shows the
  coverage base with no color, not a crash or a stale/wrong-colored fill.
- A grid cell with `rain: 0` (the common case — most of the country isn't
  raining at any given moment) maps to `t = 0`, which the existing
  `RAIN_LUT`/alpha-scaling already renders as fully transparent — dry areas
  are invisible, exactly like today's "no wet kernels drawn" behavior.

## Testing

New `src/lib/rainRamp.test.js` covering `mmToT()` (moved to
`src/lib/rainRamp.js` as a small pure module CanvasOverlay imports from,
consistent with `sensorColor.js`/`windStats.js` conventions — not left
inline in the component):
- `mm = 0` → `t = 0`
- Each breakpoint value maps to its exact expected `t` stop (`0, 1/3, 2/3, 1`)
- A value between two breakpoints interpolates linearly
- A value above the last breakpoint clamps to `t = 1`
- `NaN` or a negative input returns `0` (defensive — grid data is
  network-sourced; a bad reading should read as dry, not saturated)

`src/app/api/wind/route.js` gains `extractRainMm()` as an exported pure
function; new `src/app/api/wind/route.test.js` (or co-located, matching
whatever convention the route file's existing tests — currently none — would
use) covering:
- `{ rain: { '1h': 2.4 } }` → `2.4`
- `{ rain: { '3h': 6 } }` → `2` (divided by 3)
- `{ rain: { '1h': 2.4, '3h': 6 } }` → `2.4` (1h preferred)
- No `rain` key at all → `0`

Manual/browser verification: enable Rain Density (default ground layer),
confirm colored area(s) appear wherever OpenWeather reports live
precipitation (cross-check against a live weather map for the same moment),
confirm the legend shows real mm/h tick numbers, confirm coverage (dry
network) still renders underneath, confirm the OpenWeather toggle now only
offers "Off/Clouds", confirm nothing throws when the map is panned to an
area outside both grids (mid-ocean far from any station is fine; the
`MAX_VIEWPORT_LAT_SPAN`/`MAX_VIEWPORT_LON_SPAN` skip case in `route.js` is
the one to specifically re-check now that its `skipped: true` response
must not break the new raster step).

## Scope note

Touches: `src/app/api/wind/route.js` (extend, new pure helper + test),
`src/hooks/useWindField.js` (doc comment only), `src/components/map/CanvasOverlay.jsx`
(replace kernel "wet" rendering with raster, new `mmToT` import), new
`src/lib/rainRamp.js` + test, `src/constants/metrics.js` (new breakpoints
constant, updated `tickLabels`/`legendNote`), `src/components/dashboard/SegmentTogglePanel.jsx`
(drop one `OWM_LAYERS` entry), `AGENTS.md` (one guardrail sentence). No new
dependencies, no new API routes, no new OpenWeather request volume.
