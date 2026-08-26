# Static Current Tab & Live Timestamp Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nirmala dashboard's Current tab fully static (no Play/scrubber for any mode) and replace the information it loses with a per-mode Live Timestamp Badge, per PRD v2.0 §4.1.

**Architecture:** Remove all time-travel state/UI from the Current-tab code path in `page.jsx`, delete the rain-history hooks that become fully dead as a result, add one small optional callback to `HimawariLayer` so it can report which satellite frame actually rendered (needed for an accurate badge), and add one new small presentational component (`LiveTimestampBadge`) that page.jsx feeds a `Date | null` per active mode.

**Tech Stack:** Next.js App Router, React, MUI v5, `@iconify/react`. Tests use the project's existing `node --test` + `node:assert/strict` setup (see `src/lib/jmaHimawari.test.js`) — no new test framework or dependency.

**Spec:** [docs/superpowers/specs/2026-08-26-static-current-tab-design.md](../specs/2026-08-26-static-current-tab-design.md)

## Global Constraints

- No new npm dependencies.
- No changes to `src/hooks/useSensorStream.js`, `src/hooks/useLightningStream.js`, `src/hooks/useThunderstormStream.js`, `src/hooks/useWindField.js`, `src/hooks/usePlatformData.js`, `src/app/api/*`, or `src/lib/nirmalaApi.js` — this plan touches presentation/state only, not the data layer.
- No new color tokens — reuse existing CSS vars (`--nirmala-glass-bg`, `--nirmala-cyan`, `--nirmala-glass-border`, `--font-family-mono`, `--z-overlay`, `--radius-full`, etc. from `src/app/globals.css` / `src/lib/theme.js`).
- `LiveTimestampBadge` never shows a fake or stale time — `timestamp == null` renders nothing.
- `HimawariLayer`'s existing `onStatus` callback signature is unchanged — `onBasetimeResolved` is a new, separate, optional callback.
- Tab Timeline (`TimelineComingSoon`) and its future real playback engine (Sub-project B: Himawari + OpenWeather historical playback) are explicitly out of scope for this plan — do not build any of that here.
- Every task commits locally only (`git commit`). Never run `git push` — that stays a manual, user-driven action.

---

### Task 1: `HimawariLayer` reports which basetime actually rendered

**Files:**
- Modify: `src/components/map/HimawariLayer.jsx`

**Interfaces:**
- Produces: a new optional prop `onBasetimeResolved?: (basetime: string | null) => void` on `HimawariLayer`. Called with the basetime string that actually crossfaded onto the map, or `null` when nothing is showing (inactive/no candidates, or all candidates failed to probe). Task 4 passes `setHimawariResolvedBasetime` (a `useState` setter) as this prop.

There is no component-test framework in this project (no React Testing Library) — verification for this task is by careful code reading plus `npm run build`, consistent with how every other `.jsx` component in this codebase is verified.

- [ ] **Step 1: Add the new prop to the component signature**

In `src/components/map/HimawariLayer.jsx`, change line 91 from:

```js
export default function HimawariLayer({ active, candidateBasetimes = [], prefetchBasetime = null, opacity = 0.7, onStatus, onZoomRangeChange }) {
```

to:

```js
export default function HimawariLayer({ active, candidateBasetimes = [], prefetchBasetime = null, opacity = 0.7, onStatus, onZoomRangeChange, onBasetimeResolved }) {
```

- [ ] **Step 2: Report `null` when there's nothing to show (inactive / no candidates)**

Find this block (it's the first branch inside the big `useEffect` that manages the overlay, right after the `basetimeKey` line):

```js
    if (!map || !window.google || !active || !candidateBasetimes.length) {
      cancelAnimationFrame(fadeRafRef.current);
      if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
      if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }
```

Change it to:

```js
    if (!map || !window.google || !active || !candidateBasetimes.length) {
      cancelAnimationFrame(fadeRafRef.current);
      if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
      if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      onBasetimeResolved?.(null);
      return;
    }
```

- [ ] **Step 3: Report `null` when every candidate fails to probe**

Find this block (inside `tryCandidate`, the "exhausted candidates" branch):

```js
    const tryCandidate = async (i) => {
      if (i >= candidateBasetimes.length) {
        if (cancelled) return;
        cancelAnimationFrame(fadeRafRef.current);
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
        overlayRef.current = null;
        prevOverlayRef.current = null;
        onStatus?.('unavailable');
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate basetimes failed to probe:', candidateBasetimes);
        }
        return;
      }
```

Change the `onStatus?.('unavailable');` line to also report `null`:

```js
      if (i >= candidateBasetimes.length) {
        if (cancelled) return;
        cancelAnimationFrame(fadeRafRef.current);
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
        overlayRef.current = null;
        prevOverlayRef.current = null;
        onStatus?.('unavailable');
        onBasetimeResolved?.(null);
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate basetimes failed to probe:', candidateBasetimes);
        }
        return;
      }
```

- [ ] **Step 4: Report the basetime that actually rendered**

Find this block (still inside `tryCandidate`, right after `crossfadeIn`):

```js
      const basetime = candidateBasetimes[i];
      const ok = await probeBasetime(basetime);
      if (cancelled) return;
      if (!ok) { tryCandidate(i + 1); return; }
      crossfadeIn(basetime);
      onStatus?.('ok');
    };
```

Change it to:

```js
      const basetime = candidateBasetimes[i];
      const ok = await probeBasetime(basetime);
      if (cancelled) return;
      if (!ok) { tryCandidate(i + 1); return; }
      crossfadeIn(basetime);
      onStatus?.('ok');
      onBasetimeResolved?.(basetime);
    };
```

Do **not** add `onBasetimeResolved` to the effect's dependency array — the effect already has an `// eslint-disable-next-line react-hooks/exhaustive-deps` comment right above its closing `}, [map, active, basetimeKey, opacity, onStatus]);` line precisely because callback props like `onStatus` are deliberately excluded (re-including a differently-identitied callback on every render would tear down and rebuild the overlay for no reason). `onBasetimeResolved` follows the same rule as `onStatus` — leave the dependency array exactly as it is.

- [ ] **Step 5: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds with no errors (this is a pure additive prop change — nothing consumes it yet, so no other file changes are needed for this to compile).

- [ ] **Step 6: Commit**

```bash
git add src/components/map/HimawariLayer.jsx
git commit -m "feat(himawari): report the basetime that actually rendered"
```

---

### Task 2: `LiveTimestampBadge` component

**Files:**
- Create: `src/components/dashboard/LiveTimestampBadge.jsx`

**Interfaces:**
- Produces: `LiveTimestampBadge({ label: string, timestamp: Date | null })` — presentational, no internal state. Renders `null` when `timestamp` is `null`.

- [ ] **Step 1: Create the component**

```jsx
import { Box, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

/**
 * Live Timestamp Badge (PRD §4.1) — shows when the Current tab's active
 * mode last actually synced data. Never shows a fake or stale time:
 * `timestamp == null` (no data yet, or Himawari's fallback probing found
 * nothing published) renders nothing rather than a placeholder dash.
 */
export default function LiveTimestampBadge({ label, timestamp }) {
  if (!timestamp) return null;

  const formatted = timestamp.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 112,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-overlay, 100)',
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Icon icon="material-symbols:schedule-rounded" width={14} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {label} · diperbarui{' '}
        <Box component="span" sx={{ fontFamily: 'var(--font-family-mono)', color: 'text.primary', fontWeight: 700 }}>
          {formatted}
        </Box>{' '}
        WIB
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (nothing imports this component yet, so this alone can't break anything — this just confirms the new file itself has no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/LiveTimestampBadge.jsx
git commit -m "feat: add LiveTimestampBadge component"
```

---

### Task 3: Remove the now-fully-dead rain-history code

**Files:**
- Delete: `src/hooks/useRainHistoryRange.js`
- Delete: `src/hooks/useHistoricalSensorSnapshot.js`
- Modify: `src/lib/timeTravelRange.js`

**Interfaces:**
- Produces: `src/lib/timeTravelRange.js` keeps exporting exactly one function after this task: `nearestTickIndex(ticks, target) -> number` (unchanged signature/behavior) — this is kept because it will be reused by a later, separate Timeline-playback project, not because anything in this plan calls it yet.

Before starting, confirm these are truly unused outside `page.jsx` (which Task 4 will update) and outside any test file:

- [ ] **Step 1: Confirm there are no test files referencing the code being removed**

Run: `grep -rln "useRainHistoryRange\|useHistoricalSensorSnapshot\|buildRainTicks\|parseSensorHistoryLabel\|RAIN_HISTORY_FALLBACK_DAYS\|RAIN_TICK_MINUTES" --include="*.test.js" .`
Expected: no output (no matches). If this finds a test file, stop and report it — do not delete the code it tests.

- [ ] **Step 2: Delete the two dead hook files**

```bash
git rm src/hooks/useRainHistoryRange.js src/hooks/useHistoricalSensorSnapshot.js
```

- [ ] **Step 3: Trim `src/lib/timeTravelRange.js` down to just `nearestTickIndex`**

Replace the entire contents of `src/lib/timeTravelRange.js` with:

```js
// Pure helpers for the global time-travel timeline. Kept dependency-free so
// the tick math is easy to reason about/test without React or Maps state.
//
// This file used to also hold buildRainTicks/parseSensorHistoryLabel for the
// Current-tab rain-history scrubber, which was removed (see
// docs/superpowers/specs/2026-08-26-static-current-tab-design.md) —
// Rainvision has no bulk-history backend endpoint yet and is not in scope
// for the Timeline playback project either. nearestTickIndex is kept: a
// future Timeline playback feature will use it to round a coarser-grained
// vendor's position to the nearest tick on a finer-grained master timeline.

/** Index of the tick whose date is nearest `target` (ticks assumed sorted ascending). */
export function nearestTickIndex(ticks, target) {
  if (!ticks.length) return -1;
  const t = target.getTime();
  let lo = 0, hi = ticks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].getTime() < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(ticks[lo - 1].getTime() - t) <= Math.abs(ticks[lo].getTime() - t)) return lo - 1;
  return lo;
}
```

- [ ] **Step 4: Confirm nothing else still imports the deleted files/exports**

Run: `grep -rn "useRainHistoryRange\|useHistoricalSensorSnapshot\|buildRainTicks\|parseSensorHistoryLabel\|RAIN_HISTORY_FALLBACK_DAYS\|RAIN_TICK_MINUTES" src/`
Expected: no output. (`page.jsx` still imports these at this point in the plan — Task 4 removes those imports next. If this grep finds anything OTHER than `page.jsx`, stop and investigate before continuing.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (this task doesn't touch anything with its own tests, but confirms the deletion didn't break module resolution elsewhere).

- [ ] **Step 6: Commit**

```bash
git add src/lib/timeTravelRange.js
git commit -m "refactor: remove dead rain-history scrub helpers (nearestTickIndex kept for later timeline work)"
```

(The `git rm` from Step 2 stages the deletions; include them in the same commit — `git add` on already-`git rm`'d paths is a no-op, so a single `git commit` after Steps 2 and 3 covers everything. If your git client requires it, run `git add -u` before committing to be sure the deletions are staged.)

---

### Task 4: Remove playback from Tab Current and wire up the Live Timestamp Badge

**Files:**
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `LiveTimestampBadge` from Task 2 (`{ label, timestamp }`), `onBasetimeResolved` prop from Task 1's `HimawariLayer`, `nearestTickIndex`-free `timeTravelRange.js` from Task 3 (this task removes the last import of the deleted exports).

This task replaces the entire file. The current file is 406 lines; read it yourself first (`src/app/(dashboard)/page.jsx`) to confirm it still matches what's described below before overwriting it — if Tasks 1-3 are already merged and nothing else has touched this file, it will match exactly.

- [ ] **Step 1: Replace the full contents of `src/app/(dashboard)/page.jsx`**

```jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { motion } from 'motion/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import SensorDotLayer from '@/components/map/SensorDotLayer';
import MeshLayer from '@/components/map/MeshLayer';
import OpenWeatherLayer from '@/components/map/OpenWeatherLayer';
import LightningLayer from '@/components/map/LightningLayer';
import ThunderstormLayer from '@/components/map/ThunderstormLayer';
import WindParticleLayer from '@/components/map/WindParticleLayer';
import HimawariLayer from '@/components/map/HimawariLayer';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ProvinceFilterSelect from '@/components/dashboard/ProvinceFilterSelect';
import SegmentTogglePanel from '@/components/dashboard/SegmentTogglePanel';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import SensorStatsCard from '@/components/dashboard/SensorStatsCard';
import MapInfoPill from '@/components/dashboard/MapInfoPill';
import LiveTimestampBadge from '@/components/dashboard/LiveTimestampBadge';
import MapControls from '@/components/map/MapControls';
import TimelineComingSoon from '@/components/dashboard/TimelineComingSoon';
import { usePlatformData } from '@/hooks/usePlatformData';
import { useSensorStream } from '@/hooks/useSensorStream';
import { useLightningStream } from '@/hooks/useLightningStream';
import { useThunderstormStream } from '@/hooks/useThunderstormStream';
import { useWindField } from '@/hooks/useWindField';
import { useJmaHimawariTicks } from '@/hooks/useJmaHimawariTicks';
import { useAuth } from '@/hooks/useAuth';
import { METRICS } from '@/constants/metrics';
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';
import { LAYER_STATUS } from '@/constants/layerStatus';
import { PROVINCES } from '@/constants/provinces';
import { filterStationsInBounds, summarizeStations } from '@/lib/provinceFilter';

// SSE streams report 'connecting'/'live'/'reconnecting'; a toggle also needs
// to say "connected but nothing to show right now" — this maps both signals
// into the one LAYER_STATUS vocabulary every layer indicator reads.
function streamStatus(sseStatus, count) {
  if (sseStatus === 'reconnecting') return LAYER_STATUS.ERROR;
  if (sseStatus === 'connecting') return LAYER_STATUS.LOADING;
  return count > 0 ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY;
}

export default function NirmalaDashboard() {
  const { sensors: apiSensors, lightning: apiLightning, thunderstorm: apiThunderstorm, health, loading, error } = usePlatformData();
  const { permissions, defaultMap, defaultLayer } = useAuth();

  // Initial REST snapshot seeds each SSE hook; live updates flow in via /api/stream/*.
  const { stations: SENSOR_STATIONS, status: sensorStreamStatus } = useSensorStream(apiSensors);
  const { strikes: lightning, status: lightningStreamStatus } = useLightningStream(apiLightning);
  const { storms: thunderstorm, status: thunderstormStreamStatus } = useThunderstormStream(apiThunderstorm);
  const { field: windField, status: windFieldStatus } = useWindField();

  const [activeLayer, setActiveLayer] = useState('rain');
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showLightning, setShowLightning] = useState(false);
  const [showStorms, setShowStorms] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [owmLayer, setOwmLayer] = useState(null); // OpenWeather tile layer id or null
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'timeline' — PRD §4.1 Dual-Tab
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(null);

  const himawari = useJmaHimawariTicks(activeLayer === 'himawari');
  const [himawariStatus, setHimawariStatus] = useState('ok'); // 'ok' | 'loading' | 'unavailable' — only 'unavailable' has UI today (see the notice box below); 'loading' is reserved for a future spinner.
  const [himawariZoomInRange, setHimawariZoomInRange] = useState(true); // JMA only serves this product at zoom 3-5 — see HimawariLayer's onZoomRangeChange
  // Which basetime HimawariLayer actually crossfaded onto the map (not just
  // "the newest tick") — HimawariLayer falls back through up to 4 recent
  // candidates when the newest hasn't published yet, so this is the only
  // reliable source for "as of" time. null = nothing currently shown.
  const [himawariResolvedBasetime, setHimawariResolvedBasetime] = useState(null);

  // Current tab is a static live snapshot (PRD §4.1: no Play/scrubber for
  // any mode) — no timelineIndex/isPlaying state here. himawariBasetimeCandidates
  // always uses the "most recent, with fallback" chain; there is no
  // scrubbed-to-a-specific-tick case to handle on this tab.
  const himawariBasetimeCandidates = useMemo(() => {
    if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
    return himawari.ticks.slice(-4).reverse().map((t) => t.basetime);
  }, [activeLayer, himawari.ticks]);

  // Live Timestamp Badge (PRD §4.1) sources, per mode:
  // - Himawari: the tick matching whichever basetime actually rendered
  //   (see himawariResolvedBasetime above) — null while nothing has
  //   resolved yet, or when every fallback candidate failed to probe.
  const himawariLastSynced = useMemo(() => {
    const tick = himawari.ticks.find((t) => t.basetime === himawariResolvedBasetime);
    return tick?.date ?? null;
  }, [himawari.ticks, himawariResolvedBasetime]);
  // - Rainvision (rain/mesh/node all read the same sensor stream): the most
  //   recent `lastUpdate` across all stations, not a fake "now".
  const rainvisionLastSynced = useMemo(() => {
    if (!SENSOR_STATIONS.length) return null;
    const times = SENSOR_STATIONS
      .map((s) => new Date(s.lastUpdate))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!times.length) return null;
    return new Date(Math.max(...times.map((d) => d.getTime())));
  }, [SENSOR_STATIONS]);
  const activeLayerLastSynced = activeLayer === 'himawari' ? himawariLastSynced : rainvisionLastSynced;

  // Manifest resolves async, after activeLayer's initial state and (likely) after
  // the map has already mounted with the hardcoded MAP_CENTER/MAP_ZOOM_DEFAULT —
  // apply its default_layer/default_map once each, the same way handleReset does.
  const appliedDefaultLayerRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultLayerRef.current || !defaultLayer) return;
    if (METRICS[defaultLayer]) setActiveLayer(defaultLayer);
    appliedDefaultLayerRef.current = true;
  }, [defaultLayer]);

  const appliedDefaultMapRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultMapRef.current || !map || !defaultMap) return;
    // If the user has already picked a province by the time the manifest
    // resolves, don't yank the viewport back to the default view — but
    // don't mark the ref as done either, so this can still apply later
    // once the province selection is cleared (checked in the effect body,
    // not the dependency array, so clearing the province alone doesn't
    // re-run this effect and isn't required to).
    if (selectedProvinceCode) return;
    map.setCenter({ lat: defaultMap.lat, lng: defaultMap.lng });
    // Never let the manifest zoom in tighter than our national-view floor —
    // it may only zoom out further.
    map.setZoom(Math.min(defaultMap.zoom, MAP_ZOOM_DEFAULT));
    appliedDefaultMapRef.current = true;
  }, [map, defaultMap]);

  const stats = {
    total: SENSOR_STATIONS.length,
    active: SENSOR_STATIONS.filter((s) => s.status === 'active').length,
    raining: SENSOR_STATIONS.filter((s) => s.isRaining).length,
    blacklist: SENSOR_STATIONS.filter((s) => s.blacklisted || s.status === 'blacklisted').length,
  };

  const handleZoom = (delta) => {
    if (!map) return;
    const nextZoom = Math.min(Math.max(map.getZoom() + delta, 4), 17);
    map.setZoom(nextZoom);
  };

  const handleReset = () => {
    setSelectedProvinceCode(null);
    if (!map) return;
    map.setCenter(MAP_CENTER);
    map.setZoom(MAP_ZOOM_DEFAULT);
  };

  // Shared by handleProvinceSelect and the "map became ready after a
  // province was already selected" effect below, so the LatLngBounds
  // construction only lives in one place.
  const fitBoundsToProvince = (targetMap, code) => {
    const province = PROVINCES.find((p) => p.code === code);
    if (!province || !targetMap) return;
    targetMap.fitBounds(new window.google.maps.LatLngBounds(
      { lat: province.bounds.south, lng: province.bounds.west },
      { lat: province.bounds.north, lng: province.bounds.east },
    ));
  };

  const handleProvinceSelect = (code) => {
    setSelectedProvinceCode(code);
    if (!code) {
      handleReset();
      return;
    }
    fitBoundsToProvince(map, code);
  };

  // Race guard: if the user picks a province before the map has finished
  // loading, handleProvinceSelect's fitBounds call above is a no-op (no
  // `map` yet) and never retries. Re-apply the fit once `map` becomes
  // available while a province is still selected.
  useEffect(() => {
    if (!map || !selectedProvinceCode) return;
    fitBoundsToProvince(map, selectedProvinceCode);
  }, [map, selectedProvinceCode]);

  const matchedProvinceStations = useMemo(() => {
    if (!selectedProvinceCode) return null;
    const province = PROVINCES.find((p) => p.code === selectedProvinceCode);
    if (!province) return null;
    return summarizeStations(filterStationsInBounds(SENSOR_STATIONS, province.bounds));
  }, [selectedProvinceCode, SENSOR_STATIONS]);

  return (
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', bgcolor: 'var(--nirmala-map-bg)', overflow: 'hidden' }}>
        
        {/* Emerge-from-the-light reveal (continues the login fly-through flash) */}
        <Box
          component={motion.div}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          sx={{ position: 'fixed', inset: 0, bgcolor: '#eef5ff', pointerEvents: 'none', zIndex: 3000 }}
        />

        <DashboardHeader
          stats={stats}
          health={health}
          streamStatus={sensorStreamStatus}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === 'current' && (
          <ProvinceFilterSelect
            selectedCode={selectedProvinceCode}
            onSelectCode={handleProvinceSelect}
            matched={matchedProvinceStations}
          />
        )}

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: activeTab === 'current' ? 'block' : 'none' }}>
            <GoogleMapWrapper onMapLoad={setMap}>
              <OpenWeatherLayer layer={owmLayer} />
              {activeLayer === 'rain' && (
                <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
              )}
              {activeLayer === 'mesh' && <MeshLayer stations={SENSOR_STATIONS} />}
              {activeLayer === 'himawari' && (
                <HimawariLayer
                  active
                  candidateBasetimes={himawariBasetimeCandidates}
                  onStatus={setHimawariStatus}
                  onZoomRangeChange={setHimawariZoomInRange}
                  onBasetimeResolved={setHimawariResolvedBasetime}
                />
              )}
              <ThunderstormLayer storms={thunderstorm} show={showStorms} />
              <LightningLayer strikes={lightning} show={showLightning} />
              <WindParticleLayer show={showWind} field={windField} />
              <SensorDotLayer
                stations={SENSOR_STATIONS}
                showMarkers={activeLayer === 'rain' ? showMarkers : true}
                selectedId={selectedStation?.id ?? null}
                onSelect={setSelectedStation}
                focus={activeLayer === 'node'}
              />
            </GoogleMapWrapper>

            {/* Soften the Google attribution strip to match the theme, without
                covering or reducing the legibility of the logo/Terms link. */}
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 40,
                pointerEvents: 'none',
                zIndex: 1,
                background: 'linear-gradient(to top, var(--nirmala-map-bg) 0%, transparent 100%)',
                opacity: 0.55,
              }}
            />

            {/* Left: Sky/Ground Segment panel */}
            <SegmentTogglePanel
              activeLayer={activeLayer}
              onLayerChange={setActiveLayer}
              showMarkers={showMarkers}
              onToggleMarkers={setShowMarkers}
              showCoverage={showCoverage}
              onToggleCoverage={setShowCoverage}
              showLightning={showLightning}
              onToggleLightning={setShowLightning}
              lightningCount={lightning?.length || 0}
              lightningStatus={streamStatus(lightningStreamStatus, lightning?.length || 0)}
              showStorms={showStorms}
              onToggleStorms={setShowStorms}
              stormCount={thunderstorm?.length || 0}
              stormStatus={streamStatus(thunderstormStreamStatus, thunderstorm?.length || 0)}
              showWind={showWind}
              onToggleWind={setShowWind}
              windStatus={windFieldStatus}
              owmLayer={owmLayer}
              onOwmChange={setOwmLayer}
              permissions={permissions}
            />

            {/* Right: Legend */}
            <ColorRampLegend activeLayer={activeLayer} showCoverage={showCoverage} />

            {/* Top-center: contextual info pill */}
            <MapInfoPill raining={stats.raining} total={stats.total} loading={loading && stats.total === 0} />

            {/* Top-center, below the info pill: Live Timestamp Badge (PRD §4.1) —
                when each mode's data was actually last synced. Renders nothing
                until a real timestamp is known (see LiveTimestampBadge). */}
            <LiveTimestampBadge
              label={METRICS[activeLayer]?.label ?? ''}
              timestamp={activeLayerLastSynced}
            />

            {/* Top-center, below the timestamp badge: Himawari notice — either
                "zoom out of range" (JMA only serves this product at zoom 3-5;
                takes priority since it explains why nothing shows regardless of
                data status) or the load-failure notice (rare: JMA hasn't
                published any of the last 4 frames). Neither needs a permanent
                slot the way MapInfoPill/LiveTimestampBadge do. Hidden below the
                `sm` breakpoint like those — on mobile a failed overlay shows a
                blank map with no explanation, but the legend note still
                communicates the data's limitations regardless. */}
            {activeLayer === 'himawari' && (!himawariZoomInRange || himawariStatus === 'unavailable') && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 152,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 'var(--z-overlay, 100)',
                  px: 1.75,
                  py: 0.75,
                  display: { xs: 'none', sm: 'block' },
                  backdropFilter: 'blur(20px)',
                  background: 'var(--nirmala-glass-bg)',
                  border: '1px solid var(--nirmala-glass-border)',
                  borderRadius: 'var(--radius-full, 9999px)',
                  fontSize: '0.78rem',
                  color: 'text.primary',
                }}
              >
                {himawariZoomInRange
                  ? 'Citra tidak tersedia untuk waktu ini'
                  : 'Perbesar/perkecil peta ke level zoom 3–5 untuk melihat citra satelit'}
              </Box>
            )}

            {/* Bottom-left: sensor statistics */}
            <SensorStatsCard stats={stats} />

            {/* Map Controls */}
            <MapControls
              onZoomIn={() => handleZoom(1)}
              onZoomOut={() => handleZoom(-1)}
              onReset={handleReset}
            />

            {/* Detail drawer */}
            <SensorDetailDrawer
              station={selectedStation}
              open={Boolean(selectedStation)}
              onClose={() => setSelectedStation(null)}
            />
          </Box>

          {activeTab === 'timeline' && <TimelineComingSoon />}
        </Box>
      </Box>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`

- On the Current tab, confirm there is **no** Play button or scrubber anywhere on screen, for every mode (Kerapatan Hujan, Mesh Map, Node Sensor, Himawari).
- Select "Kerapatan Hujan" (rain mode) — confirm a small pill appears below the existing top-center info pill reading something like "Kerapatan Hujan · diperbarui HH.mm WIB", with a real time (not blank, not "Invalid Date").
- Switch to "Node Sensor" or "Mesh Map" — confirm the badge label updates (e.g. "Node Sensor · diperbarui HH.mm WIB") using the same underlying sensor timestamp.
- Switch to "Himawari" — confirm the badge label changes to "Himawari · diperbarui HH.mm WIB" and the time roughly matches when the satellite image actually last updated (JMA publishes every 10 minutes) — not simply "now".
- If you can force the Himawari zoom-out-of-range notice (zoom out below level 3, or above level 5, while in Himawari mode), confirm the notice box appears below the timestamp badge without overlapping it.
- Confirm all previously-working features are unaffected: Provincial Filter (pick a province, confirm map pans/zooms and the filter bar's summary still works), lightning/storm/wind toggles, OpenWeather Hujan/Awan tiles, sensor dot click → detail drawer, Tab Timeline still shows the "Fase 2" placeholder.
- Open the browser console — confirm no new runtime errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (this task removed the last references to the deleted rain-history code; nothing here has its own automated test, consistent with every other `.jsx` component in this codebase).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat: remove playback from Current tab, add Live Timestamp Badge"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 (remove playback) → Task 4. §3.2 (delete dead rain-history code) → Task 3. §3.3 (`LiveTimestampBadge` component) → Task 2. §3.4 (per-mode timestamp sources) → Task 4. §3.5 (`HimawariLayer` reports resolved basetime) → Task 1. §4 (error handling: null-safe badge, null-safe timestamp memos) → covered in Tasks 2 and 4's code. §5 (verification steps) → covered in each task's manual-verification step, consolidated most thoroughly in Task 4 Step 2 since that's where all the pieces come together. §6 (out of scope) → no task in this plan touches Timeline playback, OpenWeather historical integration, or `MapInfoPill`.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command; no "similar to Task N" back-references — every task's code is fully spelled out in place.
- **Type/name consistency:** `onBasetimeResolved` (Task 1) matches the prop name Task 4 passes (`onBasetimeResolved={setHimawariResolvedBasetime}`). `LiveTimestampBadge`'s props (`label`, `timestamp`) match exactly how Task 4 calls it (`label={METRICS[activeLayer]?.label ?? ''}`, `timestamp={activeLayerLastSynced}`). `nearestTickIndex` (Task 3) is the one export Task 3 keeps and no task in this plan imports it yet — correctly noted as being for later use, not a dangling requirement.
