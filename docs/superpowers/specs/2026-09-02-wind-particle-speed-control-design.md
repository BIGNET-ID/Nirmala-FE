# Wind particle speed control

## Context

`WindParticleLayer` already animates particles from real OpenWeather wind
data — `src/app/api/wind/route.js` calls OpenWeather's Current Weather Data
API (`data/2.5/weather`) per grid point, extracts `wind.speed` (m/s) and
`wind.deg`, and returns a proper `{u, v, speed}` vector field consumed by
`useWindField()`. Particle displacement each animation frame is already
`u/v * VELOCITY_SCALE`, so faster real wind already moves particles faster
on screen — this part is not new.

Two gaps prompted this change:
1. The API's own `speed` value per grid cell is fetched but never used
   client-side — there's no quantitative readout of current wind speed
   anywhere in the UI.
2. `VELOCITY_SCALE` (the visual pixels-per-m/s scale) is a hardcoded
   module constant in `WindParticleLayer.jsx` — there is no way for a user
   to make the particle animation feel faster or slower without a code
   change.

This spec adds both: a real-data-derived average-speed readout, and a
manual multiplier slider layered on top of it, without adding any new
OpenWeather API calls (the data already exists in the fetched field).

## Data flow

`useWindField()` already returns `{ field, ambientField, status }`, where
`field`/`ambientField` are `{ bounds, nx, ny, u: number[], v: number[],
speed: number[] }`.

Add `src/lib/windStats.js`:

```js
export function averageSpeed(field) {
  if (!field?.speed?.length) return null;
  const sum = field.speed.reduce((a, b) => a + b, 0);
  return sum / field.speed.length;
}
```

Pure function, no dependency on React or the DOM — testable in isolation
with `node --test` (`src/lib/windStats.test.js`), following the existing
convention (`provinceFilter.test.js`, `sensorColor.test.js`).

In `page.jsx`, derive the display value from whichever field is populated
(dense `field` preferred, `ambientField` fallback — same precedence
`WindParticleLayer` already uses for sampling):

```js
const avgWindSpeedKmh = useMemo(() => {
  const source = windField?.speed?.length ? windField : windAmbientField;
  const avg = averageSpeed(source);
  return avg == null ? null : avg * 3.6; // m/s -> km/h
}, [windField, windAmbientField]);
```

`null` means "no data yet" (loading, error, or empty grid) — the UI hides
the readout entirely rather than showing a placeholder like "N/A".

## Manual override

New state in `page.jsx`:

```js
const [windSpeedMultiplier, setWindSpeedMultiplier] = useState(1);
```

Range `0.5`–`2.5`, step `0.1`, default `1` (default preserves today's
exact visual behavior — no regression for anyone who never touches the
slider).

`WindParticleLayer` gains a new prop `speedMultiplier = 1`, mirrored into
a ref (`speedMultiplierRef`) the same way `field`/`ambientField`/`show`
already are (`useEffect(() => { speedMultiplierRef.current =
speedMultiplier; }, [speedMultiplier])`), so the `requestAnimationFrame`
loop always reads the current value without re-subscribing. Inside `step()`,
both velocity components pick up the multiplier:

```js
const nx = p.x + w.u * VELOCITY_SCALE * speedMultiplierRef.current;
const ny = p.y - w.v * VELOCITY_SCALE * speedMultiplierRef.current;
```

`VELOCITY_SCALE` itself is untouched — it stays the base scale; the
multiplier is a pure visual override layered on top of the real-data-driven
speed, not a replacement for it.

## UI placement

In `SegmentTogglePanel.jsx`'s `SkySegmentContent`, inside the existing
OpenWeather `VendorCard`, directly below the current `LayerSwitch` for
"Wind (particles)" — shown only while `showWind` is true:

```jsx
{onToggleWind && (
  <LayerSwitch checked={showWind} onChange={onToggleWind} label="Wind (particles)" status={windStatus} />
)}
{showWind && (
  <>
    {avgWindSpeedKmh != null && (
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
        ~{avgWindSpeedKmh.toFixed(1)} km/h avg
      </Typography>
    )}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem', flexShrink: 0 }}>
        Particle speed
      </Typography>
      <Slider
        size="small"
        min={0.5} max={2.5} step={0.1}
        value={windSpeedMultiplier}
        onChange={(_, v) => onWindSpeedMultiplierChange(v)}
        sx={{ color: 'var(--nirmala-cyan)' }}
        aria-label="Particle speed multiplier"
      />
    </Box>
  </>
)}
```

New props threaded through `segmentProps` (already an object bag passed
into `SkySegmentContent`/`GroundSegmentContent` from `page.jsx`):
`avgWindSpeedKmh`, `windSpeedMultiplier`, `onWindSpeedMultiplierChange`.
`km/h` (not m/s) matches the non-technical-executive audience note in
AGENTS.md — more familiar a unit than m/s for most readers.

## Error handling

- No field data yet (loading/error/empty grid): `avgWindSpeedKmh` is
  `null`, caption is not rendered. No error state needed beyond that —
  this mirrors how `windStatus`'s existing `LayerSwitch` status dot
  already surfaces `EMPTY`/`ERROR` for the toggle itself.
- The slider does not depend on data presence — it is enabled whenever
  `showWind` is true, regardless of `windStatus`, since it only scales
  the animation's `VELOCITY_SCALE`, not the underlying field values.

## Testing

`src/lib/windStats.test.js` (TDD, `node --test`):
- Average of a normal multi-value array
- Empty array → `null`
- `null`/`undefined` field → `null`
- All-zero array → `0` (calm wind is a valid result, not treated as "no data")

Manual/browser verification (per this repo's `<verification_workflow>`):
toggle Wind on, confirm the km/h caption appears once data loads, drag the
slider and confirm particle animation visibly speeds up/slows down, drag
back to `1×` and confirm it matches pre-change behavior.

## Scope note

This is a small, self-contained addition to one existing panel — no new
routes, no new dependencies (`Slider` is already part of `@mui/material`,
already used elsewhere in the app for range inputs), no changes to
`useWindField.js` or the `/api/wind` route. Implementation is a single
pass across three files (`windStats.js` + test, `WindParticleLayer.jsx`,
`SegmentTogglePanel.jsx`) plus threading two new pieces of state through
`page.jsx`.
