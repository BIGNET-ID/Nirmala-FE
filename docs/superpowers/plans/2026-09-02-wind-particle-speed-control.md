# Wind Particle Speed Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-data average wind speed readout and a manual visual-speed multiplier slider to the existing Wind (particles) toggle, without any new OpenWeather API calls.

**Architecture:** A new pure function computes the average of the wind field's already-fetched-but-unused `speed` array; `page.jsx` derives a km/h display value from it and owns a new `windSpeedMultiplier` state; `WindParticleLayer` multiplies its existing `VELOCITY_SCALE` constant by that multiplier via the same ref-mirroring pattern it already uses for `field`/`show`; `SegmentTogglePanel.jsx` renders the readout text and an MUI `Slider` under the existing Wind toggle.

**Tech Stack:** Next.js (React), MUI (`@mui/material` `Slider`), `node --test` for pure-function unit tests.

## Global Constraints

- Default `windSpeedMultiplier` is `1`, and at `1` the visual result must be pixel-identical to current behavior — no regression for anyone who never touches the slider.
- No new OpenWeather API calls, no changes to `src/app/api/wind/route.js` or `src/hooks/useWindField.js` — the `speed` array is already fetched and returned.
- Display unit is km/h (not m/s) — matches AGENTS.md's non-technical-executive-audience guidance (more familiar unit).
- `null` average (no data yet) hides the readout text entirely — never render a placeholder like "N/A".
- Microcopy stays sentence case, no ALL-CAPS (AGENTS.md design guardrails) — e.g. "Particle speed", not "PARTICLE SPEED".
- Slider range `0.5`–`2.5`, step `0.1`.

---

### Task 1: `averageSpeed()` pure function

**Files:**
- Create: `src/lib/windStats.js`
- Test: `src/lib/windStats.test.js`

**Interfaces:**
- Consumes: nothing (pure function, no dependencies)
- Produces: `averageSpeed(field)` — `field` is `null` or `{ speed: number[], ... }` (only `.speed` is read). Returns `number | null`. Later tasks (Task 3) call this as `averageSpeed(source)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/windStats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageSpeed } from './windStats.js';

test('averageSpeed: averages a normal multi-value array', () => {
  assert.equal(averageSpeed({ speed: [2, 4, 6] }), 4);
});

test('averageSpeed: empty speed array returns null', () => {
  assert.equal(averageSpeed({ speed: [] }), null);
});

test('averageSpeed: null field returns null', () => {
  assert.equal(averageSpeed(null), null);
});

test('averageSpeed: undefined field returns null', () => {
  assert.equal(averageSpeed(undefined), null);
});

test('averageSpeed: field with no speed property returns null', () => {
  assert.equal(averageSpeed({}), null);
});

test('averageSpeed: all-zero array returns 0, not null (calm wind is valid data)', () => {
  assert.equal(averageSpeed({ speed: [0, 0, 0] }), 0);
});

test('averageSpeed: single-value array returns that value', () => {
  assert.equal(averageSpeed({ speed: [7.5] }), 7.5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/windStats.test.js`
Expected: FAIL — `Cannot find module './windStats.js'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/windStats.js`:

```js
// Average of a wind field's per-cell speed (m/s) — the field's own `speed`
// array (see src/app/api/wind/route.js) is fetched but was previously
// discarded client-side; this is the first consumer of it.
export function averageSpeed(field) {
  if (!field?.speed?.length) return null;
  const sum = field.speed.reduce((a, b) => a + b, 0);
  return sum / field.speed.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/windStats.test.js`
Expected: PASS, 7/7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/windStats.js src/lib/windStats.test.js
git commit -m "$(cat <<'EOF'
Add averageSpeed() for wind field speed readout

Pure function over the wind field's already-fetched speed array, so
page.jsx can derive a km/h display value without any new API calls.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `WindParticleLayer` speed multiplier prop

**Files:**
- Modify: `src/components/map/WindParticleLayer.jsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `WindParticleLayer` now accepts an additional prop `speedMultiplier` (number, default `1`). Task 3 passes this prop from `page.jsx`.

- [ ] **Step 1: Add the prop and its ref, mirroring the existing `show`/`field` pattern**

In `src/components/map/WindParticleLayer.jsx`, change the component signature (currently line 49):

```js
export default function WindParticleLayer({ show = true, field = null, ambientField = null, speedMultiplier = 1 }) {
```

Add a new ref alongside the existing ones (currently lines 51-57, right after `showRef`):

```js
  const speedMultiplierRef = useRef(speedMultiplier);
```

Add a new mirroring effect alongside the existing ones (currently lines 59-61):

```js
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);
```

- [ ] **Step 2: Apply the multiplier in the animation loop**

In the `step()` function, change the two velocity lines (currently lines 111-112) from:

```js
          const nx = p.x + w.u * VELOCITY_SCALE;
          const ny = p.y - w.v * VELOCITY_SCALE; // screen y is down; +v is north
```

to:

```js
          const nx = p.x + w.u * VELOCITY_SCALE * speedMultiplierRef.current;
          const ny = p.y - w.v * VELOCITY_SCALE * speedMultiplierRef.current; // screen y is down; +v is north
```

Do not change `VELOCITY_SCALE` itself, and do not change how `spd` (used only for trail color) is computed — the multiplier only affects on-screen displacement, not the color mapping.

- [ ] **Step 3: Verify default behavior is unchanged**

There is no component test harness in this repo (only pure-`.js` files have `node --test` coverage). Verify by reading the diff: with `speedMultiplier` defaulting to `1` and `speedMultiplierRef.current` starting at `1`, `w.u * VELOCITY_SCALE * 1 === w.u * VELOCITY_SCALE` — arithmetically identical to before. Confirm no other line in the file references `VELOCITY_SCALE` in a way that would double-apply the multiplier (only the two lines above use it).

- [ ] **Step 4: Commit**

```bash
git add src/components/map/WindParticleLayer.jsx
git commit -m "$(cat <<'EOF'
Add speedMultiplier prop to WindParticleLayer

Scales the existing VELOCITY_SCALE constant via the same ref-mirroring
pattern already used for show/field/ambientField, so the animation
loop reads the current value without re-subscribing. Defaults to 1,
which is arithmetically identical to the prior hardcoded behavior.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire state and the average-speed readout through `page.jsx`

**Files:**
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `averageSpeed(field)` from Task 1 (`src/lib/windStats.js`); `speedMultiplier` prop from Task 2 (`WindParticleLayer`).
- Produces: `segmentProps` (passed to `SkySegmentContent`/`GroundSegmentContent`/`MobileControlSheet`) gains three new keys: `avgWindSpeedKmh` (`number | null`), `windSpeedMultiplier` (`number`), `onWindSpeedMultiplierChange` (`(value: number) => void`). Task 4 destructures these in `SkySegmentContent`.

- [ ] **Step 1: Import `averageSpeed`**

In `src/app/(dashboard)/page.jsx`, add to the existing `src/lib/*` imports (currently lines 34-35):

```js
import { averageSpeed } from '@/lib/windStats';
```

- [ ] **Step 2: Add the multiplier state**

Near the other wind-related state (currently line 72, `const [showWind, setShowWind] = useState(false);`), add directly after it:

```js
  // Visual-only override on top of the real-data-driven particle speed —
  // see WindParticleLayer's speedMultiplier prop. 1 = today's exact
  // behavior (VELOCITY_SCALE unscaled).
  const [windSpeedMultiplier, setWindSpeedMultiplier] = useState(1);
```

- [ ] **Step 3: Derive the average-speed readout**

After the existing `useWindField` call (currently line 205: `const { field: windField, ambientField: windAmbientField, status: windFieldStatus } = useWindField(mapBounds);`), add:

```js
  // Dense field preferred, ambient as fallback — same precedence
  // WindParticleLayer already uses when sampling per-particle velocity.
  const avgWindSpeedKmh = useMemo(() => {
    const source = windField?.speed?.length ? windField : windAmbientField;
    const avg = averageSpeed(source);
    return avg == null ? null : avg * 3.6; // m/s -> km/h
  }, [windField, windAmbientField]);
```

- [ ] **Step 4: Pass the multiplier prop to `WindParticleLayer`**

Change the existing render call (currently line 347):

```jsx
              <WindParticleLayer show={showWind} field={windField} ambientField={windAmbientField} />
```

to:

```jsx
              <WindParticleLayer show={showWind} field={windField} ambientField={windAmbientField} speedMultiplier={windSpeedMultiplier} />
```

- [ ] **Step 5: Add the three new keys to `segmentProps`**

Change the existing object (currently lines 377-383):

```js
              const segmentProps = {
                activeLayer, onLayerChange: handleLayerChange, onToggleHimawari: handleHimawariToggle,
                showMarkers, onToggleMarkers: setShowMarkers, showCoverage, onToggleCoverage: setShowCoverage,
                showWind, onToggleWind: setShowWind, windStatus: windFieldStatus,
                owmLayer, onOwmChange: setOwmLayer, permissions,
              };
```

to:

```js
              const segmentProps = {
                activeLayer, onLayerChange: handleLayerChange, onToggleHimawari: handleHimawariToggle,
                showMarkers, onToggleMarkers: setShowMarkers, showCoverage, onToggleCoverage: setShowCoverage,
                showWind, onToggleWind: setShowWind, windStatus: windFieldStatus,
                avgWindSpeedKmh, windSpeedMultiplier, onWindSpeedMultiplierChange: setWindSpeedMultiplier,
                owmLayer, onOwmChange: setOwmLayer, permissions,
              };
```

- [ ] **Step 6: Run the existing test suite to confirm no regressions**

Run: `node --test`
Expected: same pass/fail count as before this task (34 passed / 2 pre-existing unrelated failures in `colorScales.test.js`) — this task touches no tested pure-function files, only `page.jsx` wiring.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "$(cat <<'EOF'
Wire wind speed multiplier state and km/h readout into page.jsx

Derives avgWindSpeedKmh from the wind field's speed array via
averageSpeed(), owns windSpeedMultiplier state, and threads both plus
a setter through segmentProps and into WindParticleLayer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Slider and readout UI in the Wind card

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx`

**Interfaces:**
- Consumes: `avgWindSpeedKmh`, `windSpeedMultiplier`, `onWindSpeedMultiplierChange` from Task 3's `segmentProps` (already spread into `SkySegmentContent` via `{...segmentProps}` at the call site in `page.jsx`, no further wiring needed here).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Import `Slider`**

In `src/components/dashboard/SegmentTogglePanel.jsx`, add `Slider` to the existing MUI import (currently line 4):

```js
import { Box, Button, Typography, FormControlLabel, Switch, Slider, Tooltip, Chip, IconButton } from '@mui/material';
```

- [ ] **Step 2: Destructure the new props in `SkySegmentContent`**

Change the function signature (currently lines 154-159):

```js
export function SkySegmentContent({
  activeLayer, onToggleHimawari,
  showWind, onToggleWind, windStatus,
  owmLayer, onOwmChange,
  hideTitle,
}) {
```

to:

```js
export function SkySegmentContent({
  activeLayer, onToggleHimawari,
  showWind, onToggleWind, windStatus,
  avgWindSpeedKmh, windSpeedMultiplier, onWindSpeedMultiplierChange,
  owmLayer, onOwmChange,
  hideTitle,
}) {
```

- [ ] **Step 3: Render the readout and slider below the Wind toggle**

Change the existing block (currently lines 212-214):

```jsx
        {onToggleWind && (
          <LayerSwitch checked={showWind} onChange={onToggleWind} label="Wind (particles)" status={windStatus} />
        )}
```

to:

```jsx
        {onToggleWind && (
          <LayerSwitch checked={showWind} onChange={onToggleWind} label="Wind (particles)" status={windStatus} />
        )}
        {onToggleWind && showWind && (
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
                min={0.5}
                max={2.5}
                step={0.1}
                value={windSpeedMultiplier}
                onChange={(_, v) => onWindSpeedMultiplierChange(v)}
                sx={{ color: 'var(--nirmala-cyan)' }}
                aria-label="Particle speed multiplier"
              />
            </Box>
          </>
        )}
```

Note: the slider only depends on `showWind` being true, not on `windStatus` or `avgWindSpeedKmh` — it's enabled whenever the Wind toggle is on, per the spec's error-handling section (it scales `VELOCITY_SCALE`, not the underlying field data, so it works even while data is loading).

- [ ] **Step 4: Run the existing test suite to confirm no regressions**

Run: `node --test`
Expected: same pass/fail count as before (34 passed / 2 pre-existing unrelated failures) — no pure-function file changed in this task.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx
git commit -m "$(cat <<'EOF'
Add wind speed readout and particle-speed slider to Wind card

Shows the real average wind speed (km/h) from OpenWeather data and a
manual 0.5x-2.5x visual speed slider, both only while Wind (particles)
is toggled on.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end browser verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: the fully wired feature from Tasks 1-4.
- Produces: nothing — final confirmation task.

- [ ] **Step 1: Start the dev server preview and open the dashboard**

Use the project's preview tooling to open `http://localhost:3000` (or the assigned port), log in, and land on the Current tab.

- [ ] **Step 2: Toggle Wind (particles) on**

Open the Space segment panel, toggle "Wind (particles)" on. Confirm particles begin animating over the map (existing behavior).

- [ ] **Step 3: Confirm the km/h readout appears**

Wait for the wind field to load (a few seconds). Confirm a "~X.X km/h avg" caption appears under the toggle. If it never appears, check the browser console/network tab for `/api/wind` errors — a missing `OPENWEATHER_API_KEY` env var (`503 {error: "no_key"}` from the route) would explain a permanently-null reading; this is a pre-existing environment concern, not a bug in this feature.

- [ ] **Step 4: Confirm the slider changes visible particle speed**

Drag the "Particle speed" slider to `2.5`. Confirm particle streaks visibly move faster across the map. Drag it to `0.5`. Confirm they visibly slow down. Drag it back to `1`. Confirm the animation looks the same as it did in Step 2, before the slider was touched.

- [ ] **Step 5: Confirm no console errors**

Check the browser console for new errors introduced by this change (ignore any pre-existing, unrelated warnings/errors already present before this feature, e.g. Google Maps CORS warnings in dev).

- [ ] **Step 6: Toggle Wind off and confirm the readout/slider disappear**

Toggle "Wind (particles)" off. Confirm the km/h caption and slider are no longer rendered (per Task 4 Step 3's `showWind` gate).
