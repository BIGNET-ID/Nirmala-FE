# OpenWeather Rain tile → real mm/h rainbow overlay

> **Revision note:** this spec originally proposed moving real OpenWeather
> rain data into the "Rain Density" *ground layer* (replacing its
> sensor-density proxy). After implementation and review, the actual
> requirement turned out to be narrower and different: leave "Rain Density"
> exactly as it already was (sensor-based, qualitative), and instead replace
> only the OpenWeather tile toggle's "Rain" option — which today shows
> OpenWeather's own flat blue `precipitation_new` tile image — with a
> self-rendered rainbow raster driven by the same real per-point mm/h data.
> This document has been rewritten to describe that corrected design. Any
> code already built against the original approach (a `CanvasOverlay.jsx`
> that draws rain from `windField`/`windAmbientField`, a `METRICS.rain` with
> real mm/h tick labels, a removed OpenWeather "Rain" button) is reverted as
> part of implementing this revision — see the implementation plan for the
> exact revert steps.

## Context

`OpenWeatherLayer.jsx` renders OpenWeather's own raw map tiles
(`precipitation_new`, `clouds_new`) as a Google Maps `ImageMapType`,
proxied through `/api/owm/[...tile]` so the API key stays server-side. The
"Rain" option in `SegmentTogglePanel.jsx`'s Off/Rain/Clouds toggle shows
OpenWeather's `precipitation_new` tile — a single flat translucent blue,
regardless of how heavy the rain actually is, since it's just OpenWeather's
own pre-rendered PNG.

Separately, `/api/wind/route.js` already grid-samples OpenWeather's Current
Weather Data API (`data/2.5/weather`) per point for the wind particle layer
(`WindParticleLayer.jsx`) — and (from this feature's Task 1, already built
and unaffected by this revision) that same per-point response now also
extracts real rain volume (`rain.1h`/`rain.3h`) via `extractRainMm()`, so
`sampleGrid()`'s returned field carries a `rain: number[]` array (mm/h)
alongside `u`/`v`/`speed`. This data is fetched continuously regardless of
any toggle (`useWindField` in `page.jsx` is unconditional), so using it here
adds zero new OpenWeather API calls.

This spec: replace the OpenWeather "Rain" tile's flat-blue rendering with a
self-drawn rainbow raster colored by that real mm/h data, using the same
rainbow ramp Nirmala already uses for its own qualitative Rain Density
layer. "Rain Density" itself (the sensor-based ground layer, `activeLayer
=== 'rain'`) is explicitly **not** changed by this feature — it keeps its
existing binary-`is_raining`-kernel behavior and qualitative
Low/Moderate/High/Extreme legend, unchanged from before this whole feature
branch started.

## Data flow

No changes here beyond what Task 1 already built: `sampleGrid()` in
`src/app/api/wind/route.js` returns `{ bounds, nx, ny, u, v, speed, rain }`
for both the viewport-bound grid and the `?mode=ambient` near-global grid.
`useWindField(bounds)` passes these through unchanged as `field`/
`ambientField`. `page.jsx` already computes
`const { field: windField, ambientField: windAmbientField, status:
windFieldStatus } = useWindField(mapBounds);` unconditionally (not gated by
any toggle) — this feature reads those same two objects, no new fetch, no
new hook.

## Rendering — new `OpenWeatherRainLayer.jsx`

A new sibling map-layer component, structured like `WindParticleLayer.jsx`
(a `google.maps.OverlayView` subclass owning its own canvas), **not** part
of `CanvasOverlay.jsx` and **not** part of `OpenWeatherLayer.jsx`'s
tile-image logic — this is a third, independent overlay:

```jsx
export default function OpenWeatherRainLayer({ show, field, ambientField }) {
  // mirrors CanvasHeatmapOverlay's OverlayView setup: a canvas sized/positioned
  // to the map's div-pixel bounds in draw(), redrawn on data/show change.
}
```

Rendering technique (identical to what Task 3 originally built, just
relocated into this standalone component instead of `CanvasOverlay.jsx`):

1. A small offscreen "field canvas" sized to the grid's own resolution
   (`nx × ny` — dense grid is `9×6`, see `GRID_NX`/`GRID_NY` in `route.js`).
   Each field-canvas pixel `(i, j)` maps one-to-one to grid cell
   `field.rain[j*nx+i]` — no interpolation needed to build this tiny raster.
   Map each cell's mm value through `mmToT` (see Legend section) into a
   rainbow LUT, alpha scaled by `t` (0 mm → fully transparent). Field row
   `j=0` is the *south* edge (per `route.js`'s `sampleGrid`), written to the
   *bottom* canvas row (`ny-1-j`) to keep north-at-top orientation.

2. Draw that small field canvas onto the main overlay canvas via
   `ctx.drawImage(fieldCanvas, 0, 0, nx, ny, destX, destY, destW, destH)`,
   with the destination rect computed by projecting the field's own
   `bounds` (NW/SE corners) through the map's projection. Clamp the east
   longitude (`B.east >= 180 ? 179.999 : B.east`) before projecting —
   `google.maps.LatLng` normalizes an east edge of exactly `180` to `-180`,
   which would otherwise collapse the ambient (near-global) field's
   destination width to `0` and silently render nothing at world zoom (a
   real bug caught in this feature's original implementation attempt — the
   fix carries forward into this component from the start).

3. Field selection: prefer the dense `field` whenever non-null; fall back
   to `ambientField` only when the dense one is `null` — same precedence
   `WindParticleLayer` already uses per-particle, applied once for the
   whole overlay.

4. Gated by a `show` prop (`true` iff `owmLayer === 'rain'`, see UI Toggle
   section) — when `false`, the component either doesn't mount or clears
   its canvas, matching how `WindParticleLayer`'s `show` prop works today.

`RAIN_RAMP`/`buildLUT`/`RAIN_LUT` (the rainbow color-ramp machinery
currently in `CanvasOverlay.jsx`) and `mmToT` (`src/lib/rainRamp.js`,
already built in Task 2, unaffected by this revision) are both reused
as-is — `RAIN_RAMP`/`buildLUT`/`RAIN_LUT` get copied into the new
`OpenWeatherRainLayer.jsx` (small, single-consumer, not worth extracting to
a shared module given only one file uses them now that `CanvasOverlay.jsx`
no longer does).

## Legend: new `METRICS.openweatherRain` entry, independent of ground layer

`src/constants/metrics.js` gains a **new**, separate metrics entry (NOT a
change to the existing `METRICS.rain`, which stays exactly as it already
was before this feature — qualitative, sensor-based):

```js
openweatherRain: {
  key: 'openweatherRain',
  label: 'OpenWeather Rain',
  icon: 'material-symbols:rainy-rounded',
  colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
  tickLabels: ['0', '2.5', '7.6', '50+ mm/h'],
  legendNote: 'Rainfall intensity from OpenWeather, interpolated across a coarse grid — not a per-sensor reading.',
},
```

`RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50]` (already added to this same file
in Task 2, unaffected) remains the single source of truth for both these
tick labels and `mmToT()`'s mapping.

`page.jsx` determines which metric key `ColorRampLegend` displays:

```js
const legendMetricKey = owmLayer === 'rain' ? 'openweatherRain' : activeLayer;
```

...and passes `legendMetricKey` where it currently passes `activeLayer` to
`ColorRampLegend`/`legendProps`. This means: whenever the OpenWeather Rain
toggle is on, its legend shows *regardless of which ground layer
(Rain/Mesh/Himawari) is currently selected* — confirmed as the desired
behavior (an OpenWeather-toggle-driven overlay, independent of ground-layer
choice). `ColorRampLegendContent`/`ColorRampLegend.jsx` need **no code
changes** — they already just do a `METRICS[activeLayer]` lookup by
whatever key they're given, and their `activeLayer === 'rain'`-specific
special-casing (the "Active sensor network (not raining)" caption) simply
won't fire for the `'openweatherRain'` key, which is correct — that
caption is sensor-specific and doesn't apply to this OpenWeather overlay.

If a ground layer's own legend is also `'rain'` (i.e. the user has
Rain Density selected AND the OpenWeather Rain toggle is off), the
existing qualitative Rain Density legend shows as before — unaffected.

## UI toggle: restore the "Rain" button

`SegmentTogglePanel.jsx`'s `OWM_LAYERS` restores a third entry, using a new
internal id (`'rain'`) rather than OpenWeather's own tile id
(`'precipitation_new'`), since this mode no longer fetches that tile at all:

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

`page.jsx` wires the two OpenWeather-driven layers as mutually exclusive
siblings, both driven by the same `owmLayer` state:

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

(`OpenWeatherLayer`'s existing tile-fetching logic is otherwise untouched —
it simply never receives `'rain'` as a `layer` value anymore, so it never
tries to fetch a `precipitation_new` tile.)

## What gets reverted from this feature's earlier implementation attempt

This feature was first implemented against the original (superseded) spec
above the revision note. That work must be reverted before/while building
this corrected version:

- `src/components/map/CanvasOverlay.jsx` — remove `drawRainField`,
  `paintRainFieldCanvas`, the `rainField`/`rainAmbientField` props, and the
  `mmToT` import; restore the original sensor-based wet/dry kernel
  rendering (binary `is_raining`, `RAIN_KM`/`RAIN_MIN`/`RAIN_MAX` radius
  constants, `RAIN_RAMP`/`RAIN_LUT`/`buildLUT` colorizing kernel density
  same as before this feature branch existed).
- `src/constants/metrics.js` — restore `METRICS.rain`'s original
  qualitative `tickLabels`/`legendNote` (Low/Moderate/High/Extreme,
  "Density of sensors reporting rain..."). `RAIN_MM_BREAKPOINTS` stays
  (now feeds the new `METRICS.openweatherRain` instead).
- `src/app/(dashboard)/page.jsx` — `CanvasHeatmapOverlay` usage drops the
  `rainField`/`rainAmbientField` props (back to `stations`/`showCoverage`
  only).
- `AGENTS.md` — the rain-ramp guardrail paragraph needs a **third** revision
  reflecting the actual final state: "Rain Density" (sensor-based) still
  must not fabricate mm/h numbers (that constraint is back in force,
  unchanged from before this feature branch). Separately, note that the
  independent OpenWeather Rain overlay (`METRICS.openweatherRain`,
  `OpenWeatherRainLayer.jsx`) legitimately uses real per-point mm/h data
  from OpenWeather — a different layer, a different data source, both facts
  stated so neither reads as contradicting the other. `AGENTS.md` tracks its
  own change history at the top of the file (`_v2 — ..._`, `_v3 — ..._`
  lines) — add a `_v4_` line summarizing this correction.
- `src/components/dashboard/SegmentTogglePanel.jsx` — `OWM_LAYERS` restores
  the "Rain" entry (as shown above), and the `VendorCard`'s `info` tooltip
  (which by the end of the earlier attempt read something generic/stale)
  should describe both Rain and Clouds accurately, e.g. "Rain and cloud
  cover layers from the OpenWeather global weather data provider."

`src/app/api/wind/route.js`'s `extractRainMm()`/`rain` field,
`src/hooks/useWindField.js`, and `src/lib/rainRamp.js`'s `mmToT()` are
**kept as-is** — all still needed, unaffected by the revision.

## Error handling

- No field yet / OpenWeather key missing / fetch error: `field` and
  `ambientField` are both `null` in `OpenWeatherRainLayer` — it draws
  nothing (transparent), same null-guard pattern as `WindParticleLayer` and
  the original `drawRainField`.
- A grid cell with `rain: 0` maps to `t = 0` → fully transparent, same as
  today's "no wet kernels drawn" behavior for Rain Density.
- Antimeridian clamp (see Rendering step 2) specifically prevents the
  ambient field from silently failing to render at world zoom.

## Testing

No new pure-function tests needed beyond what Task 1/2 already added
(`route.test.js`'s `extractRainMm` tests, `rainRamp.test.js`'s `mmToT`
tests) — both are reused unchanged by this component.

`OpenWeatherRainLayer.jsx` itself has no automated test (canvas rendering,
consistent with `WindParticleLayer.jsx`/the original `CanvasOverlay.jsx`
rain code having none either) — verify manually:
- Toggle OpenWeather to "Rain": confirm a colored raster appears (not flat
  blue), tracks real precipitation location, and the `openweatherRain`
  legend appears with real mm/h ticks — regardless of which ground layer
  (Rain/Mesh/Himawari) is currently selected.
- Toggle to "Off" or "Clouds": confirm the rain raster disappears and its
  legend disappears; "Clouds" still shows the original flat OpenWeather
  tile as before.
- Confirm "Rain Density" (ground layer) is completely unaffected — same
  sensor-kernel rendering, same qualitative legend, whether or not the
  OpenWeather Rain toggle is on.
- Zoom out to world view with only the ambient field available: confirm
  the rain raster still renders somewhere (the antimeridian-clamp fix).
- Confirm `npm test` has no new/changed failures versus the branch's
  current baseline (2 pre-existing, unrelated `colorScales.test.js`
  failures are known and out of scope).

## Scope note

Touches: new `src/components/map/OpenWeatherRainLayer.jsx`; reverts to
`src/components/map/CanvasOverlay.jsx`, `src/constants/metrics.js` (revert
`METRICS.rain`, add `METRICS.openweatherRain`), `src/app/(dashboard)/page.jsx`
(revert `CanvasHeatmapOverlay` props, add `OpenWeatherRainLayer` + legend
key logic), `src/components/dashboard/SegmentTogglePanel.jsx` (restore
"Rain" button, fix tooltip copy), `AGENTS.md` (third revision of the same
guardrail paragraph). No changes to `src/app/api/wind/route.js`,
`src/hooks/useWindField.js`, or `src/lib/rainRamp.js` — all kept as
already built. No new dependencies, no new API routes, no new OpenWeather
request volume.
