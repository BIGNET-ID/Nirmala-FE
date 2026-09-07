# Dashboard UI/UX Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 9 independent usability/consistency fixes to the Nirmala dashboard: a smooth Himawari zoom-reset, segment-panel layout cleanup (reset toggle placement + no forced scroll), consistent OpenWeather toggle buttons, consistent hide-panel iconography, a new map-type switcher, a persistent province search bar, BMKG-based sensor hydration (temp/humidity), a mobile header avatar-clipping fix, and a final English-copy audit.

**Architecture:** Every task is additive or a targeted restyle of existing components — no new state-management pattern, no new library. Google Maps zoom gets a small hand-rolled step-tween utility (the platform has no native smooth zoom). BMKG hydration reuses the existing `haversineKm` formula (exported for the first time) with a plain brute-force scan — deliberately not a spatial index, since 511 points queried once-per-click doesn't warrant one and a full scan is strictly more accurate than a bucketed index at this scale.

**Tech Stack:** Next.js App Router, MUI, `motion/react`, `@vis.gl/react-google-maps`, `@iconify/react`, Node's built-in test runner (`node --test`).

**Spec:** `/Users/ekabayuperwita/.claude/plans/glimmering-percolating-stroustrup.md` (design doc — read alongside this plan; it carries the "why" and the deferred-scope decisions this plan does not repeat).

## Global Constraints

- No glassmorphism/backdrop-blur; solid panels with `var(--nirmala-glass-bg)` + `1px solid var(--nirmala-glass-border)`.
- At most one dominant accent color: `var(--nirmala-cyan)` / `var(--nirmala-cyan-dim)`.
- Sentence case on all new copy, never ALL CAPS (the one existing exception is the small `eyebrowSx` microcopy token — reuse it verbatim where it already applies, don't invent new uppercase text).
- Every new interactive element needs a hover state and a 150-300ms transition (`var(--duration-fast, 150ms)` / `var(--duration-slow, 300ms)`, `var(--ease-standard)`); never remove the browser's default focus ring.
- z-index on any new floating control must reference `var(--z-overlay, N)`, never a bare literal.
- BMKG-hydrated fields must be labeled as BMKG's regional reading, never presented as the sensor's own measurement (data-honesty rule already established for this feature).
- `npm test` must stay green after every task.

---

### Task 1: `smoothZoomTo` utility

**Files:**
- Create: `src/lib/smoothZoom.js`
- Test: `src/lib/smoothZoom.test.js`

**Interfaces:**
- Produces: `smoothZoomTo(map, targetZoom, onDone?)` — steps a Google Maps `map`-like object's zoom one integer level at a time toward `targetZoom`, waiting for an `'idle'` event between steps, calling `onDone()` once (if provided) when `targetZoom` is reached. Task 2 consumes this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/smoothZoom.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothZoomTo } from './smoothZoom.js';

// Minimal fake of the google.maps.Map surface smoothZoomTo actually uses:
// getZoom/setZoom/addListener('idle', cb) -> {remove()}. setZoom synchronously
// fires any pending 'idle' listeners, simulating "tiles settled instantly" —
// enough to make the recursive step logic deterministic in a test.
function makeFakeMap(startZoom) {
  let zoom = startZoom;
  const listeners = [];
  return {
    getZoom: () => zoom,
    setZoom: (z) => {
      zoom = z;
      const toFire = listeners.slice();
      listeners.length = 0;
      toFire.forEach((cb) => cb());
    },
    addListener: (event, cb) => {
      if (event === 'idle') listeners.push(cb);
      return { remove: () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      } };
    },
  };
}

test('smoothZoomTo: already at target zoom calls onDone immediately, no setZoom', () => {
  const map = makeFakeMap(5);
  let done = false;
  let setZoomCalls = 0;
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { setZoomCalls++; origSetZoom(z); };
  smoothZoomTo(map, 5, () => { done = true; });
  assert.equal(done, true);
  assert.equal(setZoomCalls, 0);
});

test('smoothZoomTo: steps down one level at a time from 10 to 5', () => {
  const map = makeFakeMap(10);
  const zoomsSeen = [];
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { zoomsSeen.push(z); origSetZoom(z); };
  let done = false;
  smoothZoomTo(map, 5, () => { done = true; });
  assert.deepEqual(zoomsSeen, [9, 8, 7, 6, 5]);
  assert.equal(done, true);
});

test('smoothZoomTo: steps up one level at a time when target is higher', () => {
  const map = makeFakeMap(2);
  const zoomsSeen = [];
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { zoomsSeen.push(z); origSetZoom(z); };
  smoothZoomTo(map, 5, () => {});
  assert.deepEqual(zoomsSeen, [3, 4, 5]);
});

test('smoothZoomTo: calls onDone exactly once at the end', () => {
  const map = makeFakeMap(8);
  let calls = 0;
  smoothZoomTo(map, 5, () => { calls++; });
  assert.equal(calls, 1);
});

test('smoothZoomTo: works with no onDone callback provided', () => {
  const map = makeFakeMap(7);
  assert.doesNotThrow(() => smoothZoomTo(map, 5));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/smoothZoom.test.js`
Expected: FAIL — `Cannot find module './smoothZoom.js'`.

- [ ] **Step 3: Write `src/lib/smoothZoom.js`**

```js
/**
 * Google Maps' setZoom() has no built-in tween — it's always an instant
 * jump. This steps one integer zoom level at a time, waiting for each
 * level's tiles to settle ('idle') before advancing, so a large zoom
 * change reads as a smooth zoom-out/in instead of a jarring snap. Used by
 * the Himawari activation flow (see page.jsx) to bring the map back into
 * Himawari's usable 3-5 zoom range without disorienting the user.
 */
export function smoothZoomTo(map, targetZoom, onDone) {
  const current = map.getZoom();
  if (current === targetZoom) { onDone?.(); return; }
  const step = current > targetZoom ? -1 : 1;
  const listener = map.addListener('idle', () => {
    listener.remove();
    if (map.getZoom() === targetZoom) { onDone?.(); return; }
    smoothZoomTo(map, targetZoom, onDone);
  });
  map.setZoom(current + step);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/smoothZoom.test.js`
Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/smoothZoom.js src/lib/smoothZoom.test.js
git commit -m "feat: add smoothZoomTo step-tween utility for Google Maps"
```

---

### Task 2: Wire smooth zoom-reset into Himawari activation

**Files:**
- Modify: `src/app/(dashboard)/page.jsx:66-68` (`handleHimawariToggle`)

**Interfaces:**
- Consumes: `smoothZoomTo(map, targetZoom, onDone?)` (Task 1).

- [ ] **Step 1: Add the import**

In `src/app/(dashboard)/page.jsx`, add to the import block (after the `averageSpeed` import, line 37):

```js
import { smoothZoomTo } from '@/lib/smoothZoom';
```

- [ ] **Step 2: Update `handleHimawariToggle`**

Find (line 66-68):

```js
  const handleHimawariToggle = (checked) => {
    setActiveLayer(checked ? 'himawari' : groundLayer);
  };
```

Replace with:

```js
  const handleHimawariToggle = (checked) => {
    setActiveLayer(checked ? 'himawari' : groundLayer);
    // Himawari tiles only render at zoom 3-5 (see HimawariLayer.jsx) — if
    // the user is zoomed in past that when activating, step the zoom back
    // out smoothly instead of leaving them looking at a blank layer with
    // only a passive text hint to explain why.
    if (checked && map && map.getZoom() > 5) {
      smoothZoomTo(map, 5);
    }
  };
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass (no test covers `page.jsx` directly — this guards against an accidental syntax error).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat: smooth zoom-reset when activating Himawari while zoomed in"
```

---

### Task 3: Segment panel — reset toggle below tabs, remove scroll cap

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx:329-429` (the `CollapsiblePanel` component)

**Interfaces:** none new — internal restructure only, same props (`icon, title, titleContent, children, resetActive, onResetToggle`).

- [ ] **Step 1: Replace `CollapsiblePanel` in full**

Find the entire function (starting at the `function CollapsiblePanel({ icon, title, titleContent, children, resetActive, onResetToggle }) {` line through its closing `}` — currently lines 329-429) and replace it with:

```jsx
function CollapsiblePanel({ icon, title, titleContent, children, resetActive, onResetToggle }) {
  const [open, setOpen] = useState(true);

  return (
    <Box
      component={motion.div}
      transition={collapseTransition}
      animate={{ width: open ? EXPANDED_WIDTH : COLLAPSED_SIZE }}
      onClick={() => !open && setOpen(true)}
      sx={{
        zIndex: 'var(--z-overlay, 100)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: open ? 'var(--radius-lg, 12px)' : 'var(--radius-md, 8px)',
        cursor: open ? 'default' : 'pointer',
      }}
    >
      <Box
        onClick={(e) => { if (open) { e.stopPropagation(); setOpen(false); } }}
        sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}
      >
        <Box
          sx={{
            display: 'flex', alignItems: 'center',
            justifyContent: open ? 'space-between' : 'center',
            gap: 1, height: COLLAPSED_SIZE, px: open ? 1.75 : 0,
            cursor: 'pointer',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {(!titleContent || !open) && (
              <Icon icon={icon} width={20} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
            )}
            <AnimatePresence>
              {open && (
                <Box
                  component={motion.span}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  sx={titleContent ? { overflow: 'hidden' } : { ...eyebrowSx, whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                  {titleContent ?? title}
                </Box>
              )}
            </AnimatePresence>
          </Box>
          {open && (
            <Tooltip title="Hide panel">
              <IconButton size="small" disableRipple sx={{ p: 0.25, color: 'text.secondary', flexShrink: 0 }}>
                <Icon icon="material-symbols:chevron-left-rounded" width={18} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {open && onResetToggle && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              height: 32, px: 1.75, pb: 0.5, cursor: 'default',
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
              Show all layers
            </Typography>
            <Tooltip title={resetActive ? 'Turn off all filters' : 'Turn on all filters'}>
              <Switch
                checked={resetActive}
                onChange={(e) => onResetToggle(e.target.checked)}
                size="small"
                sx={switchSx}
              />
            </Tooltip>
          </Box>
        )}
      </Box>

      <AnimatePresence>
        {open && (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            sx={{ width: EXPANDED_WIDTH, display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}
          >
            <Box sx={{ px: 1.75, pb: 1.75, flex: '1 1 auto', minHeight: 0 }}>
              {children}
            </Box>
          </Box>
        )}
      </AnimatePresence>
    </Box>
  );
}
```

Two behavioral changes from the original, both intentional: (1) the reset `Switch` moved to its own row below the tab pills, with a persistent "Show all layers" label instead of only a hover tooltip; (2) the children wrapper dropped `maxHeight: 'min(320px, 38vh)'` and `overflowY: 'auto'` — content now sizes to itself instead of scrolling inside a fixed box. Task 9 will reserve bottom-corner space in `page.jsx` so this doesn't visually collide with the new map-type control introduced there.

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass (no test covers this file — canvas/JSX UI components in this codebase don't have dedicated test files, consistent with existing convention).

- [ ] **Step 3: Start the dev server and manually verify**

Open the dashboard, expand the Space/Ground panel, confirm: the reset switch now sits on its own row below the Space/Ground tab pills with a visible "Show all layers" label; the Ground Segment content (all 3 vendor cards) renders without an inner scrollbar.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx
git commit -m "refactor: move segment panel reset toggle below tabs, remove scroll cap"
```

---

### Task 4: OpenWeather Rain/Clouds/Wind — consistent toggle buttons

**Files:**
- Modify: `src/components/dashboard/SegmentTogglePanel.jsx:143-147` (`OWM_LAYERS`), `:174-255` (the OpenWeather `VendorCard` inside `SkySegmentContent`)

**Interfaces:** none new — same `owmLayer`/`onOwmChange`/`showWind`/`onToggleWind`/`windStatus` props `SkySegmentContent` already receives.

- [ ] **Step 1: Remove the `OWM_LAYERS` constant**

Delete lines 143-147:

```js
const OWM_LAYERS = [
  { id: null, label: 'Off' },
  { id: 'precipitation_new', label: 'Rain' },
  { id: 'clouds_new', label: 'Clouds' },
];
```

(No longer needed — Rain/Clouds become individually-toggled buttons, not a mapped list with an `Off` entry.)

- [ ] **Step 2: Add a shared chip-style helper above `SkySegmentContent`**

Insert this function where `OWM_LAYERS` used to be (same location, replacing it):

```js
function owmChipSx(active) {
  return {
    flex: 1, minWidth: 0, px: 0.5, py: 0.5, fontSize: '0.68rem', fontWeight: 700,
    borderRadius: 'var(--radius-sm, 4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
    color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
    border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
    background: active ? 'var(--nirmala-cyan-dim)' : 'rgba(255,255,255,0.03)',
    transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard), border-color var(--duration-fast, 150ms) var(--ease-standard)',
    '&:hover': { background: 'var(--nirmala-cyan-dim)' },
  };
}
```

- [ ] **Step 3: Replace the OWM chip row and the Wind `LayerSwitch`**

Find (lines 179-215, from the `<Box sx={{ display: 'flex', gap: 0.5 }}>` chip row through the Wind `LayerSwitch` line):

```jsx
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {OWM_LAYERS.map((o) => {
            const active = owmLayer === o.id;
            return (
              <Button
                key={o.label}
                onClick={() => onOwmChange(o.id)}
                disableRipple
                sx={{
                  flex: 1, minWidth: 0, px: 0.5, py: 0.5, fontSize: '0.68rem', fontWeight: 700,
                  borderRadius: 'var(--radius-sm, 4px)',
                  color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
                  border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
                  background: active ? 'var(--nirmala-cyan-dim)' : 'rgba(255,255,255,0.03)',
                  '&:hover': { background: 'var(--nirmala-cyan-dim)' },
                }}
              >
                {o.label}
              </Button>
            );
          })}
        </Box>
        {/* Both Himawari (cloud-top IR) and this tile depict cloud/weather
            cover over the same area — layering them at full strength makes
            them hard to tell apart. OpenWeather's tile opacity is lowered
            automatically (see page.jsx) while Himawari is active; this note
            is the only way the user learns why the overlay looks fainter,
            since color alone can't communicate it (OpenWeather's tile
            colors are fixed server-side, not something we can restyle). */}
        {himawariActive && owmLayer && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
            Opacity automatically reduced while Himawari is active
          </Typography>
        )}
        {onToggleWind && (
          <LayerSwitch checked={showWind} onChange={onToggleWind} label="Wind (particles)" status={windStatus} />
        )}
```

Replace with:

```jsx
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            onClick={() => onOwmChange(owmLayer === 'precipitation_new' ? null : 'precipitation_new')}
            disableRipple
            aria-pressed={owmLayer === 'precipitation_new'}
            aria-label="Toggle OpenWeather rain overlay"
            sx={owmChipSx(owmLayer === 'precipitation_new')}
          >
            <Icon icon="material-symbols:rainy-rounded" width={14} />
            Rain
          </Button>
          <Button
            onClick={() => onOwmChange(owmLayer === 'clouds_new' ? null : 'clouds_new')}
            disableRipple
            aria-pressed={owmLayer === 'clouds_new'}
            aria-label="Toggle OpenWeather cloud overlay"
            sx={owmChipSx(owmLayer === 'clouds_new')}
          >
            <Icon icon="material-symbols:cloud-outline-rounded" width={14} />
            Clouds
          </Button>
        </Box>
        {onToggleWind && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <Button
              onClick={() => onToggleWind(!showWind)}
              disableRipple
              aria-pressed={showWind}
              aria-label="Toggle wind particles"
              sx={owmChipSx(showWind)}
            >
              <Icon icon="material-symbols:air-rounded" width={14} />
              Wind
              {STATUS_DOT[windStatus] && (
                <Tooltip title={STATUS_DOT[windStatus].title}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: STATUS_DOT[windStatus].color, flexShrink: 0 }} />
                </Tooltip>
              )}
            </Button>
          </Box>
        )}
        {/* Both Himawari (cloud-top IR) and this tile depict cloud/weather
            cover over the same area — layering them at full strength makes
            them hard to tell apart. OpenWeather's tile opacity is lowered
            automatically (see page.jsx) while Himawari is active; this note
            is the only way the user learns why the overlay looks fainter,
            since color alone can't communicate it (OpenWeather's tile
            colors are fixed server-side, not something we can restyle). */}
        {himawariActive && owmLayer && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
            Opacity automatically reduced while Himawari is active
          </Typography>
        )}
```

Note the "opacity reduced" caption moved to after the Wind row (was between the chip row and the Wind switch before) — this is a deliberate reordering so Rain/Clouds (row 1) and Wind (row 2) sit adjacent to each other with no caption wedged between them, matching the "Wind is a second row of the same button family" framing. Everything after this block (avg-wind-speed caption, particle-speed slider, refresh-interval/attribution captions) is unchanged — do not touch it.

- [ ] **Step 4: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 5: Start the dev server and manually verify**

Confirm: clicking Rain activates it and deactivates Clouds (and vice versa); clicking the currently-active one turns it off; there is no separate "Off" button; Wind toggles independently of Rain/Clouds state; hover states are visible on all three buttons.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx
git commit -m "feat: redesign OpenWeather Rain/Clouds/Wind as consistent toggle buttons"
```

---

### Task 5: Hide-panel icon consistency (desktop -> mobile)

**Files:**
- Modify: `src/components/map/MapExtrasCluster.jsx:84`

**Interfaces:** none new.

- [ ] **Step 1: Swap the icon names**

Find (line 84):

```jsx
          <Icon icon={controlsVisible ? 'material-symbols:visibility-off-rounded' : 'material-symbols:visibility-rounded'} width={iconWidth} />
```

Replace with:

```jsx
          <Icon icon={controlsVisible ? 'material-symbols:layers-rounded' : 'material-symbols:layers-clear-rounded'} width={iconWidth} />
```

(Matches mobile's `MobileControlSheet.jsx` FAB glyph family — `layers-rounded` when visible — while keeping a distinct second glyph, `layers-clear-rounded`, for the hidden state, so the icon alone still communicates current state the way the old `visibility`/`visibility-off` pair did. No other logic or styling changes.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/MapExtrasCluster.jsx
git commit -m "fix: match desktop hide-controls icon family to mobile (layers, not visibility)"
```

---

### Task 6: `GoogleMapWrapper.jsx` — add map-type support

**Files:**
- Modify: `src/components/map/GoogleMapWrapper.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GoogleMapWrapper({ children, onMapLoad, mapType = 'roadmap' })` — new `mapType` prop, one of `'roadmap' | 'satellite' | 'outline'`. Task 8 (`page.jsx` wiring) passes this down.

- [ ] **Step 1: Add two new stylers arrays**

In `src/components/map/GoogleMapWrapper.jsx`, immediately after the closing `];` of `MAP_STYLE_DARK` (currently ending at line 253), insert:

```js
// "Outline" map type — line/boundary-only, no fills/labels/POI clutter.
// Stays on mapTypeId 'roadmap' (see below) and re-styles it; still follows
// whichever light/dark theme is active, it's a map TYPE choice, not a
// second place to change theme (that stays owned by ThemeToggleControl).
const MAP_STYLE_OUTLINE_LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#94a3b8' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#64748b' }, { weight: 1.4 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

const MAP_STYLE_OUTLINE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#050811' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3b4a63' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#5b6b82' }, { weight: 1.4 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#050811' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
];
```

- [ ] **Step 2: Extend the component to accept and apply `mapType`**

Find (currently lines 255-285):

```jsx
export default function GoogleMapWrapper({ children, onMapLoad }) {
  const { mode } = useThemeMode();
  return (
    // Wrap in our own div rather than passing className to <Map> — that prop
    // replaces (not merges with) the library's own sizing class internally,
    // which silently zeroes the map's height.
    <APIProvider apiKey={API_KEY}>
      <div className="nirmala-gmap" style={{ width: '100%', height: '100%' }}>
        <Map
          defaultCenter={MAP_CENTER}
          defaultZoom={MAP_ZOOM_DEFAULT}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          styles={mode === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
          disableDefaultUI={true}
          gestureHandling="greedy"
          onIdle={(e) => onMapLoad?.(e.map)}
          // Regional restriction (Indonesia + wider Asia) — also keeps the
          // world from wrapping into repeated copies at low zoom.
          restriction={{
            latLngBounds: MAP_BOUNDS_ASIA,
            strictBounds: true,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
        </Map>
      </div>
    </APIProvider>
  );
}
```

Replace with:

```jsx
export default function GoogleMapWrapper({ children, onMapLoad, mapType = 'roadmap' }) {
  const { mode } = useThemeMode();
  // Satellite ignores `styles` entirely — Google's own platform behavior,
  // imagery can't be recolored — so this only matters for roadmap/outline.
  const styles = mapType === 'outline'
    ? (mode === 'dark' ? MAP_STYLE_OUTLINE_DARK : MAP_STYLE_OUTLINE_LIGHT)
    : (mode === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);
  const mapTypeId = mapType === 'satellite' ? 'satellite' : 'roadmap';

  return (
    // Wrap in our own div rather than passing className to <Map> — that prop
    // replaces (not merges with) the library's own sizing class internally,
    // which silently zeroes the map's height.
    <APIProvider apiKey={API_KEY}>
      <div className="nirmala-gmap" style={{ width: '100%', height: '100%' }}>
        <Map
          defaultCenter={MAP_CENTER}
          defaultZoom={MAP_ZOOM_DEFAULT}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          mapTypeId={mapTypeId}
          styles={styles}
          disableDefaultUI={true}
          gestureHandling="greedy"
          onIdle={(e) => onMapLoad?.(e.map)}
          // Regional restriction (Indonesia + wider Asia) — also keeps the
          // world from wrapping into repeated copies at low zoom.
          restriction={{
            latLngBounds: MAP_BOUNDS_ASIA,
            strictBounds: true,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
        </Map>
      </div>
    </APIProvider>
  );
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/GoogleMapWrapper.jsx
git commit -m "feat: add roadmap/satellite/outline mapType support to GoogleMapWrapper"
```

---

### Task 7: New `MapTypeControl.jsx`

**Files:**
- Create: `src/components/map/MapTypeControl.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MapTypeControl({ mapType, onChange })` (default export) — `mapType` is `'roadmap' | 'satellite' | 'outline'`, `onChange(nextMapType)` fires on segment click. Task 8 (`page.jsx`) renders this.

- [ ] **Step 1: Create the file**

```jsx
'use client';

import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const SEGMENTS = [
  { id: 'roadmap', label: 'Default map', icon: 'material-symbols:map-rounded' },
  { id: 'satellite', label: 'Satellite', icon: 'material-symbols:satellite-alt-rounded' },
  { id: 'outline', label: 'Outline', icon: 'material-symbols:map-outline-rounded' },
];

/**
 * Bottom-left map-type switcher — Default (roadmap) / Satellite / Outline
 * (a minimal line-only style, following whichever light/dark theme is
 * active). Vertical-pill shape mirrors ThemeToggleControl (a single-active-
 * of-N selector), not MapControls' stack of one-shot action buttons — this
 * is a persistent selection, not a fire-once action. Deliberately separate
 * from ThemeToggleControl (top-left): this control only switches map TYPE,
 * it is not a second place to change light/dark theme.
 */
export default function MapTypeControl({ mapType, onChange }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;

  const segmentSx = (active) => ({
    width: size,
    height: size,
    borderRadius: 'var(--radius-md, 8px)',
    color: active ? '#fff' : 'var(--color-text-muted)',
    bgcolor: active ? 'var(--nirmala-cyan)' : 'transparent',
    transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard)',
    '&:hover': { bgcolor: active ? 'var(--nirmala-cyan)' : 'var(--nirmala-cyan-dim)' },
  });

  return (
    <Box
      sx={{
        position: 'absolute', left: 16, bottom: 16, zIndex: 'var(--z-overlay, 100)',
        display: 'flex', flexDirection: 'column', gap: 0.25, p: 0.25,
        border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-lg, 12px)',
        bgcolor: 'var(--nirmala-glass-bg)',
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = mapType === seg.id;
        return (
          <Tooltip key={seg.id} title={seg.label} placement="right">
            <IconButton
              onClick={() => onChange(seg.id)}
              aria-pressed={active}
              aria-label={seg.label}
              disableRipple
              sx={segmentSx(active)}
            >
              <Icon icon={seg.icon} width={isWallTV ? 22 : undefined} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
```

(If `material-symbols:map-outline-rounded` doesn't resolve via `@iconify/react`'s bundled icon set at verification time, replace it with `material-symbols:polyline-rounded` — check this during Task 8's manual verification step.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass (no test file for this component — consistent with every other map-control component in this codebase).

- [ ] **Step 3: Commit**

```bash
git add src/components/map/MapTypeControl.jsx
git commit -m "feat: add MapTypeControl (Default/Satellite/Outline switcher)"
```

---

### Task 8: Wire `MapTypeControl` into `page.jsx`

**Files:**
- Modify: `src/app/(dashboard)/page.jsx:6` (imports), `:99-107` (state), `:355` (`<GoogleMapWrapper>` usage), `:437-448` (segment panel wrapping `Box`), `:461-481` (map controls area)

**Interfaces:**
- Consumes: `MapTypeControl` (Task 7), `mapType` prop on `GoogleMapWrapper` (Task 6).

- [ ] **Step 1: Add the import**

In `src/app/(dashboard)/page.jsx`, add after the `ThemeToggleControl` import (line 22):

```js
import MapTypeControl from '@/components/map/MapTypeControl';
```

- [ ] **Step 2: Add `mapType` state**

Find (line 99-100):

```js
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);
```

Replace with:

```js
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);
  const [mapType, setMapType] = useState('roadmap');
```

- [ ] **Step 3: Pass `mapType` to `GoogleMapWrapper`**

Find (line 355):

```jsx
            <GoogleMapWrapper onMapLoad={setMap}>
```

Replace with:

```jsx
            <GoogleMapWrapper onMapLoad={setMap} mapType={mapType}>
```

- [ ] **Step 4: Reserve bottom-corner space for the new control and render it**

Find (lines 437-448, the segment panel wrapping `Box`):

```jsx
                  <Box sx={{
                    position: 'absolute', top: 72, bottom: 16, left: 16, zIndex: 'var(--z-overlay, 100)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5,
                  }}>
                    <SegmentPanel
                      {...segmentProps}
                      skyFilterActive={skyFilterActive}
                      onSkyFilterToggle={handleSkyFilterToggle}
                      groundFilterActive={groundFilterActive}
                      onGroundFilterToggle={handleGroundFilterToggle}
                    />
                  </Box>
```

Replace with (the `bottom` value reserves space for `MapTypeControl`'s 3-segment pill — `size` per breakpoint plus its own padding/gaps: `3*38 + 2*4 + 2*2 = 122` desktop, `3*44 + 2*4 + 2*2 = 140` compact/wallTV — using the same `isWallTV`/`isCompact` values `useResponsiveLayout()` already provides at the top of this component):

```jsx
                  <Box sx={{
                    position: 'absolute', top: 72,
                    bottom: 16 + (isWallTV ? 140 : 122) + 16,
                    left: 16, zIndex: 'var(--z-overlay, 100)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5,
                  }}>
                    <SegmentPanel
                      {...segmentProps}
                      skyFilterActive={skyFilterActive}
                      onSkyFilterToggle={handleSkyFilterToggle}
                      groundFilterActive={groundFilterActive}
                      onGroundFilterToggle={handleGroundFilterToggle}
                    />
                  </Box>
```

`isWallTV` is not currently destructured from `useResponsiveLayout()` at the top of this file (line 50 only takes `isCompact`) — update that line too. Find (line 50):

```js
  const { isCompact } = useResponsiveLayout();
```

Replace with:

```js
  const { isCompact, isWallTV } = useResponsiveLayout();
```

- [ ] **Step 5: Render `MapTypeControl`**

Find (line 471, right after the theme toggle comment/component):

```jsx
            {/* Theme toggle — top-left, standalone */}
            <ThemeToggleControl />
```

Replace with:

```jsx
            {/* Theme toggle — top-left, standalone */}
            <ThemeToggleControl />

            {/* Map type (Default/Satellite/Outline) — bottom-left, standalone */}
            <MapTypeControl mapType={mapType} onChange={setMapType} />
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 7: Start the dev server and manually verify**

Confirm all 3 map types render (roadmap, satellite imagery, outline in both light and dark theme via the existing theme toggle), confirm no visual overlap between the Space/Ground panel column and the new bottom-left control even when the panel is at its tallest (Ground Segment, all cards visible). Confirm the `map-outline-rounded` icon actually renders (see Task 7's fallback note if not).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat: wire MapTypeControl into the dashboard, reserve panel space for it"
```

---

### Task 9: Persistent province search bar (desktop)

**Files:**
- Modify: `src/components/dashboard/ProvinceFilterSelect.jsx`, `src/components/map/MapExtrasCluster.jsx`

**Interfaces:**
- Consumes: `useResponsiveLayout()`'s `isCompact` (already available in `MapExtrasCluster.jsx`).
- `ProvinceFilterSelect` keeps its existing prop names (`selectedCode, onSelectCode, matched`) but drops `btnSx`/`iconWidth` (only needed for the old icon-trigger button, which stays only in the compact branch — see below) and gains an internal `isCompact` read via the same hook, so `MapExtrasCluster` doesn't need to pass anything new.

- [ ] **Step 1: Rewrite `ProvinceFilterSelect.jsx`**

Replace the entire file with:

```jsx
'use client';

import { useState } from 'react';
import { Box, Autocomplete, TextField, IconButton, Tooltip, Typography, Popover, Chip } from '@mui/material';
import { Icon } from '@iconify/react';
import { PROVINCES } from '@/constants/provinces';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

function MatchedCaption({ matched }) {
  if (!matched) return null;
  return (
    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
      {matched.total === 0 ? (
        'No sensor data detected in this region yet'
      ) : (
        <>
          <Box component="span" sx={{ color: 'var(--nirmala-cyan)' }}>{matched.total}</Box>
          {' '}sensors{' · '}<Box component="span">{matched.raining}</Box> reporting rain
        </>
      )}
    </Typography>
  );
}

function ProvinceAutocomplete({ selected, onSelectCode }) {
  const handlePick = (_, option) => onSelectCode(option ? option.code : null);
  return (
    <Autocomplete
      autoFocus
      openOnFocus
      size="small"
      // No disablePortal: the suggestions list needs to escape whatever
      // small fixed-width container this is mounted in (a Popover paper on
      // compact, a persistent card on desktop).
      options={PROVINCES}
      value={selected}
      getOptionLabel={(p) => p.name}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      onChange={handlePick}
      popupIcon={<Icon icon="material-symbols:keyboard-arrow-down-rounded" width={18} style={{ color: 'var(--color-text-muted)' }} />}
      clearIcon={<Icon icon="material-symbols:close-rounded" width={16} style={{ color: 'var(--color-text-muted)' }} />}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="Search a region..."
          fullWidth
          slotProps={{ ...params.slotProps, input: { ...params.slotProps?.input, disableUnderline: true } }}
        />
      )}
      sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem', color: 'text.primary' } }}
    />
  );
}

/**
 * Provincial Boundary Filter (PRD §4.3). Selecting a province pans/zooms the
 * map to its bounding box (handled by the parent's onSelectCode) and shows
 * an approximate sensor count for that box — see provinceFilter.js for why
 * "approximate" (no real province_code from the backend yet).
 *
 * Desktop/tablet-landscape: an always-visible search card (matches the
 * product reference: rounded card, "Province" eyebrow, "Search a
 * region..." input, chevron). Compact/mobile: keeps the original icon-
 * button + Popover interaction — a persistent 300px+ bar would crowd a
 * phone's top bar.
 */
export default function ProvinceFilterSelect({ selectedCode, onSelectCode, matched, btnSx, iconWidth }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const [anchorEl, setAnchorEl] = useState(null);
  const selected = PROVINCES.find((p) => p.code === selectedCode) || null;
  const open = Boolean(anchorEl);

  if (!isCompact) {
    return (
      <Box
        sx={{
          width: isWallTV ? 340 : 300,
          display: 'flex', flexDirection: 'column', gap: 0.5, px: 1.5, py: 1.25,
          bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-lg, 8px)',
          transition: 'border-color var(--duration-fast, 150ms) var(--ease-standard)',
          '&:hover': { borderColor: 'var(--nirmala-cyan-dim)' },
        }}
      >
        <Typography sx={eyebrowSx}>Province</Typography>
        <ProvinceAutocomplete selected={selected} onSelectCode={onSelectCode} />
        <MatchedCaption matched={selected ? matched : null} />
      </Box>
    );
  }

  return (
    <>
      <Tooltip title={selected ? `Province: ${selected.name}` : 'Search province'} placement="bottom">
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Search province" sx={{ ...btnSx, position: 'relative' }}>
          <Icon icon="material-symbols:location-on-rounded" width={iconWidth} />
          {selected && (
            <Box sx={{
              position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%',
              bgcolor: 'var(--nirmala-cyan)', border: '1.5px solid var(--nirmala-glass-bg)',
            }} />
          )}
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: {
          mt: 1, p: 1.5, width: 260,
          bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-md, 8px)',
        } } }}
      >
        <Typography sx={{ ...eyebrowSx, mb: 1 }}>Province</Typography>
        <ProvinceAutocomplete selected={selected} onSelectCode={(code) => { onSelectCode(code); setAnchorEl(null); }} />
        {selected && (
          <Chip
            label={selected.name}
            onDelete={() => onSelectCode(null)}
            size="small"
            sx={{ mt: 1.5, bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)', fontWeight: 600 }}
          />
        )}
        <MatchedCaption matched={selected ? matched : null} />
      </Popover>
    </>
  );
}
```

(The compact/mobile popover keeps its original `Chip`-based clear affordance and click-to-close-on-pick behavior exactly as before; only the desktop path is new. `MatchedCaption` and `ProvinceAutocomplete` are extracted so both paths share the exact same rendering instead of duplicating JSX.)

- [ ] **Step 2: Update `MapExtrasCluster.jsx`'s row alignment**

Find (line 58-67):

```jsx
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        top: 16,
        zIndex: 'var(--z-overlay, 1300)',
        display: 'flex',
        flexDirection: 'row',
        gap: 1,
      }}
    >
```

Replace with:

```jsx
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        top: 16,
        zIndex: 'var(--z-overlay, 1300)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
      }}
    >
```

(The persistent search card is taller than its sibling 38/44px square buttons on non-compact viewports; `alignItems: 'center'` keeps the row looking intentional instead of top-aligned.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 4: Start the dev server and manually verify**

Desktop: confirm the persistent search card appears in the top-right cluster, matches the reference screenshot's look (eyebrow "Province", "Search a region..." placeholder, chevron), and picking a province still pans/zooms the map. Compact/mobile (resize the browser or use device emulation): confirm the icon-button + popover path still works exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProvinceFilterSelect.jsx src/components/map/MapExtrasCluster.jsx
git commit -m "feat: persistent province search bar on desktop, keep popover on mobile"
```

---

### Task 10: Export `haversineKm` from `meshTopology.js`

**Files:**
- Modify: `src/lib/meshTopology.js:26`

**Interfaces:**
- Produces: `haversineKm({lat, lng}, {lat, lng})` — now exported. Task 11 consumes this.

- [ ] **Step 1: Export the function**

Find (line 26):

```js
function haversineKm(a, b) {
```

Replace with:

```js
export function haversineKm(a, b) {
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass — `meshTopology.js` has no dedicated test file today (no regression risk from exporting an already-correct function; behavior is unchanged, only its visibility).

- [ ] **Step 3: Commit**

```bash
git add src/lib/meshTopology.js
git commit -m "refactor: export haversineKm from meshTopology.js for reuse"
```

---

### Task 11: `findNearestKabupaten` (BMKG hydration lookup)

**Files:**
- Create: `src/lib/bmkgHydration.js`
- Test: `src/lib/bmkgHydration.test.js`

**Interfaces:**
- Consumes: `haversineKm` (Task 10, from `@/lib/meshTopology`).
- Produces: `findNearestKabupaten(lat, lng, kabupaten)` — returns the closest kabupaten object (by real-world distance) from a `kabupaten` array shaped `{lat, lon, ...}` (BMKG's field is `lon`, not `lng` — matches the shape already used by `useBmkgWeather`/`BmkgRainLayer`), or `null` if `kabupaten` is empty. Task 13 consumes this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bmkgHydration.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNearestKabupaten } from './bmkgHydration.js';

const SAMPLE = [
  { kab: '11.01', name: 'Kabupaten Aceh Selatan', lat: 3.2548, lon: 97.1741 },
  { kab: '11.02', name: 'Kabupaten Aceh Tenggara', lat: 3.4734, lon: 97.8192 },
  { kab: '11.03', name: 'Kabupaten Aceh Timur', lat: 4.9327, lon: 97.7838 },
];

test('findNearestKabupaten: returns the closest kabupaten by real distance', () => {
  // A point right on top of Aceh Selatan's coordinate should return Aceh Selatan.
  const result = findNearestKabupaten(3.2548, 97.1741, SAMPLE);
  assert.equal(result.kab, '11.01');
});

test('findNearestKabupaten: picks the true nearest even when it is not first in the array', () => {
  // Close to Aceh Timur (4.9327, 97.7838), which is last in SAMPLE.
  const result = findNearestKabupaten(4.9, 97.8, SAMPLE);
  assert.equal(result.kab, '11.03');
});

test('findNearestKabupaten: empty kabupaten array returns null', () => {
  assert.equal(findNearestKabupaten(3.25, 97.17, []), null);
});

test('findNearestKabupaten: single-entry array always returns that entry', () => {
  const result = findNearestKabupaten(0, 0, [SAMPLE[1]]);
  assert.equal(result.kab, '11.02');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/bmkgHydration.test.js`
Expected: FAIL — `Cannot find module './bmkgHydration.js'`.

- [ ] **Step 3: Write `src/lib/bmkgHydration.js`**

```js
import { haversineKm } from '@/lib/meshTopology';

/**
 * Brute-force nearest-kabupaten lookup over BMKG's ~511 points. Deliberately
 * NOT a spatial index (K-D Tree/grid-bucket): this runs once per sensor
 * click, not per-frame and not for all sensors at once, so a full scan is
 * imperceptibly cheap — and a full scan is strictly MORE accurate than a
 * bucketed index at this scale (a grid-bucket only checks a neighborhood
 * block, which can silently miss the true nearest point in the sparse
 * regions BMKG's own coverage has, e.g. Papua/Kalimantan).
 *
 * `kabupaten` entries use `lon` (BMKG's own field name, see
 * useBmkgWeather.js), converted to `lng` here since haversineKm expects
 * that property name (meshTopology.js's convention, matching sensor
 * stations' own `{lat, lng}` shape).
 */
export function findNearestKabupaten(lat, lng, kabupaten) {
  let best = null;
  let bestDist = Infinity;
  for (const k of kabupaten) {
    const d = haversineKm({ lat, lng }, { lat: k.lat, lng: k.lon });
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/bmkgHydration.test.js`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmkgHydration.js src/lib/bmkgHydration.test.js
git commit -m "feat: add findNearestKabupaten brute-force hydration lookup"
```

---

### Task 12: Wire BMKG hydration into `SensorDetailDrawer`

**Files:**
- Modify: `src/app/(dashboard)/page.jsx:114` (`useBmkgWeather` call), `:484-488` (`<SensorDetailDrawer>` usage), `src/components/dashboard/SensorDetailDrawer.jsx:1-9` (imports), `:67` (component signature), `:168-174` (metadata `Stack`)

**Interfaces:**
- Consumes: `findNearestKabupaten` (Task 11).

- [ ] **Step 1: Fetch BMKG data unconditionally in `page.jsx`**

Find (line 114):

```js
  const { kabupaten: bmkgKabupaten, lastSyncedAt: bmkgLastSynced } = useBmkgWeather(activeLayer === 'bmkg');
```

Replace with:

```js
  // Always fetch (not just while activeLayer === 'bmkg'): SensorDetailDrawer
  // needs this data regardless of which ground mode is active, so a user
  // can click a sensor while on Rain Density and still see nearest-BMKG
  // temp/humidity. Cheap to keep warm — 511 points, 2h server-side TTL.
  const { kabupaten: bmkgKabupaten, lastSyncedAt: bmkgLastSynced } = useBmkgWeather(true);
```

- [ ] **Step 2: Pass `bmkgKabupaten` to `SensorDetailDrawer`**

Find (lines 484-488):

```jsx
            <SensorDetailDrawer
              station={selectedStation}
              open={Boolean(selectedStation)}
              onClose={() => setSelectedStation(null)}
            />
```

Replace with:

```jsx
            <SensorDetailDrawer
              station={selectedStation}
              open={Boolean(selectedStation)}
              onClose={() => setSelectedStation(null)}
              bmkgKabupaten={bmkgKabupaten}
            />
```

- [ ] **Step 3: Import `findNearestKabupaten` in `SensorDetailDrawer.jsx`**

Find (line 9, the last import before the `const STATUS_LABEL` block):

```js
import { statusBucket, statusColor } from '@/lib/sensorColor';
```

Replace with:

```js
import { statusBucket, statusColor } from '@/lib/sensorColor';
import { findNearestKabupaten } from '@/lib/bmkgHydration';
```

- [ ] **Step 4: Accept the new prop and compute the nearest kabupaten**

Find (line 67):

```js
export default function SensorDetailDrawer({ station, open, onClose }) {
```

Replace with:

```js
export default function SensorDetailDrawer({ station, open, onClose, bmkgKabupaten = [] }) {
```

Then find (line 89, right after the data-fetching `useEffect` and before `if (!station) return null;`):

```js
  if (!station) return null;
  const sm = statusMeta(station);
```

Replace with:

```js
  if (!station) return null;
  const sm = statusMeta(station);
  const nearestKabupaten = findNearestKabupaten(station.lat, station.lng, bmkgKabupaten);
```

- [ ] **Step 5: Add the hydrated fields to the metadata block**

Find (lines 168-174):

```jsx
        <Stack spacing={1.75} sx={{ mb: 2 }}>
          <Meta label="Coordinates" value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Meta label="Currently Raining" value={station.isRaining ? 'Yes' : 'No'} />
            <Meta label="Last Update" value={fmtTime(station.lastUpdate)} />
          </Box>
        </Stack>
```

Replace with:

```jsx
        <Stack spacing={1.75} sx={{ mb: 2 }}>
          <Meta label="Coordinates" value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Meta label="Currently Raining" value={station.isRaining ? 'Yes' : 'No'} />
            <Meta label="Last Update" value={fmtTime(station.lastUpdate)} />
          </Box>
          {nearestKabupaten && (
            <>
              <Meta label="Nearest BMKG region" value={nearestKabupaten.name} />
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Meta label="Temperature (BMKG)" value={`${nearestKabupaten.now.temp_c}°C`} />
                <Meta label="Humidity (BMKG)" value={`${nearestKabupaten.now.humidity_pct}%`} />
              </Box>
            </>
          )}
        </Stack>
```

(Labels explicitly say "(BMKG)"/"Nearest BMKG region" — this is a regional estimate from the nearest kabupaten centroid, never presented as the sensor's own measurement, per the data-honesty rule already established for this feature.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 7: Start the dev server and manually verify**

Click several sensors in different regions of Indonesia, confirm the "Nearest BMKG region"/"Temperature (BMKG)"/"Humidity (BMKG)" fields appear with plausible values, distinctly labeled as BMKG-sourced.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/page.jsx" src/components/dashboard/SensorDetailDrawer.jsx
git commit -m "feat: hydrate sensor detail drawer with nearest-BMKG temp/humidity"
```

---

### Task 13: Mobile header avatar-clipping fix

**Files:**
- Modify: `src/components/dashboard/DashboardHeader.jsx:157` (`<TabSwitcher>` usage)

**Interfaces:** none new.

- [ ] **Step 1: Wrap `TabSwitcher` in a shrinkable container**

Find (line 157):

```jsx
      <TabSwitcher activeTab={activeTab} onChange={onTabChange} />
```

Replace with:

```jsx
      <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
        <TabSwitcher activeTab={activeTab} onChange={onTabChange} />
      </Box>
```

(Neither the logo section, `flexShrink: 0`, line 144, nor the right-hand status/notification/avatar group, `flexShrink: 0`, line 160, can shrink — `TabSwitcher` was the only element that could theoretically absorb overflow on a narrow phone viewport, but its own content had no `minWidth: 0` floor to actually shrink below, so on very narrow screens the whole row exceeded the viewport width and the rightmost item — the avatar — got silently clipped by the page's outer `overflow: hidden`. This wrapper lets `TabSwitcher` compress narrower than its natural content width instead, so the avatar stays fully visible; in the most extreme narrow case, `TabSwitcher` itself may clip slightly instead — an acceptable tradeoff, since a secondary nav control clipping is far less disruptive than the user's own account avatar/menu disappearing off-screen.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 3: Start the dev server and manually verify**

Resize the browser (or use device emulation) to a narrow phone width (e.g. 360px), confirm the avatar circle is fully visible and not clipped at the right edge.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardHeader.jsx
git commit -m "fix: prevent mobile header avatar clipping by letting TabSwitcher shrink"
```

---

### Task 14: English-copy audit

**Files:** none modified directly by this task — verification only, may produce follow-up fixes.

**Interfaces:** none.

- [ ] **Step 1: Compile the review document**

Collect every new/changed user-facing string from Tasks 1-13 into a short markdown document at `docs/superpowers/specs/2026-09-07-uiux-copy-audit.md`: the "Show all layers" label (Task 3), Rain/Clouds/Wind button labels and their `aria-label`s (Task 4), the `layers`/`layers-clear` tooltip text (unchanged text, Task 5 only changed icons — skip), the 3 `MapTypeControl` segment labels/tooltips (Task 7), the "Province"/"Search a region..." copy (Task 9, unchanged from the original but now more visible — include for completeness), the new `Meta` labels "Nearest BMKG region"/"Temperature (BMKG)"/"Humidity (BMKG)" (Task 12).

- [ ] **Step 2: Invoke the `doc-coauthoring` skill**

Run the `doc-coauthoring` skill against the compiled document to check English consistency/correctness, per explicit instruction (rather than an ad-hoc self-check).

- [ ] **Step 3: Apply any corrections found**

If the audit flags issues, fix the corresponding source file(s) from Tasks 1-13 directly, re-run `npm test`, and commit each fix with a message like `fix: correct English copy in <component> per audit`.

- [ ] **Step 4: Final commit (if no corrections were needed)**

```bash
git add docs/superpowers/specs/2026-09-07-uiux-copy-audit.md
git commit -m "docs: add English-copy audit for the dashboard UI/UX update"
```

---

## Final Verification (after all tasks)

- `npm test` — full suite green.
- Manual, in-browser, both light and dark theme, both desktop and compact/mobile breakpoints:
  - Zoom in past level 8, activate Himawari, confirm a visible stepped zoom-out to level 5.
  - Ground Segment panel: reset switch below tabs with a visible label, no inner scrollbar with all 3 vendor cards visible.
  - OpenWeather: Rain/Clouds mutually exclusive with no Off button, Wind independent, all 3 show hover states.
  - Desktop hide-controls icon shows `layers-rounded`/`layers-clear-rounded`.
  - All 3 map types render correctly with no panel overlap.
  - Province search bar matches the reference screenshot on desktop, mobile keeps the popover.
  - Sensor click shows nearest-BMKG temp/humidity, clearly labeled.
  - Narrow phone width: avatar fully visible.
