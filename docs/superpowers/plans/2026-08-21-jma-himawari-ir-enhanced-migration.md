# JMA Himawari IR-Enhanced Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Himawari mode's JMA "Heavy Rainfall Potential Areas" (HRP) source — a binary magenta-mask product client-recolored to cyan — with JMA's tile-based "Cloud-top Enhanced" (IR-Enhanced, band `SND/ETC`) product, which is already colorized server-side and matches the imagery shown on BMKG's `himawari-ir-enhanced` reference page.

**Architecture:** Swap `HimawariLayer.jsx` from a single `google.maps.GroundOverlay` (one static JPEG + client-side canvas recolor) to a `google.maps.ImageMapType` tile pyramid (z/x/y), following the existing `OpenWeatherLayer.jsx` pattern already in this codebase. Crossfade between frames is re-implemented on top of `ImageMapType.setOpacity()` instead of `GroundOverlay.setOpacity()`, keeping the same requestAnimationFrame/guard structure. The magenta-mask recolor pipeline (`jmaHimawariRecolor.js`) is deleted entirely — JMA sends the enhanced color palette pre-rendered.

**Tech Stack:** Next.js (App Router), React, `@vis.gl/react-google-maps` (`useMap()` for direct `google.maps.*` access), vanilla `google.maps.ImageMapType`. No new dependencies. Pure-logic unit tests use Node's built-in `node:test` + `node:assert/strict` runner (Node 24 is available in this environment; no test framework is installed in this project today, and none is being introduced — `node --test` needs no dependency).

## Global Constraints

- Tile URL pattern: `https://www.jma.go.jp/bosai/himawari/data/satimg/{basetime}/fd/{basetime}/SND/ETC/{z}/{x}/{y}.jpg`, where `basetime` is `YYYYMMDDHHMMSS` (UTC) and is used for both the basetime and validtime path segments (this is an observation product, not a forecast).
- Tile scheme is standard slippy-map z/x/y (same convention as `OpenWeatherLayer.jsx`'s `getTileUrl`), tile size 256×256.
- `JMA_TICK_STEP_MINUTES = 10`, `JMA_TICK_COUNT = 144`, `JMA_PUBLISH_LAG_MINUTES = 20` (all already defined in `src/lib/jmaHimawari.js`) — unchanged by this migration.
- No backend proxy for these tiles — fetched directly client-side (JMA sends `Access-Control-Allow-Origin: *`, no API key required).
- Crossfade duration stays `CROSSFADE_MS = 400` (unchanged from the current implementation).
- New Himawari caveat/attribution copy (Indonesian, exact string): `Citra infrared awan (suhu puncak awan) · Sumber: JMA (Japan Meteorological Agency)`
- No automated tests exist anywhere else in this repo (`package.json`'s `test` script is a stub). This plan does not add a test framework as a side effect — Task 1's tests run via Node's zero-install built-in runner (`node --test`), and are removable without leaving a framework behind.

---

### Task 1: Basetime + tile URL helpers in `jmaHimawari.js`

**Files:**
- Modify: `src/lib/jmaHimawari.js`
- Test: `src/lib/jmaHimawari.test.js` (create)

**Interfaces:**
- Consumes: nothing new (pure date math, no other project files).
- Produces:
  - `buildJmaHimawariBasetime(date: Date): string` — `date` is a UTC-rounded `Date`, returns `YYYYMMDDHHMMSS`.
  - `buildJmaHimawariTileUrl(basetime: string, z: number, x: number, y: number): string`.
  - `roundDownToStep`, `JMA_TICK_STEP_MINUTES`, `JMA_TICK_COUNT`, `JMA_PUBLISH_LAG_MINUTES` remain exported unchanged (Task 2 and later depend on these exact names).
  - `JMA_SEA_BOUNDS` and `buildJmaHimawariUrl` are removed (no longer meaningful for a tile-based, full-disk product).

- [ ] **Step 1: Write the failing test file**

Create `src/lib/jmaHimawari.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJmaHimawariBasetime, buildJmaHimawariTileUrl, roundDownToStep } from './jmaHimawari.js';

test('buildJmaHimawariBasetime formats a UTC date as YYYYMMDDHHMMSS', () => {
  const date = new Date(Date.UTC(2026, 7, 21, 2, 30, 0)); // 2026-08-21T02:30:00Z
  assert.equal(buildJmaHimawariBasetime(date), '20260821023000');
});

test('buildJmaHimawariBasetime pads single-digit month/day/hour/minute', () => {
  const date = new Date(Date.UTC(2026, 0, 5, 3, 40, 0)); // 2026-01-05T03:40:00Z
  assert.equal(buildJmaHimawariBasetime(date), '20260105034000');
});

test('buildJmaHimawariTileUrl builds the JMA satimg tile pattern', () => {
  const url = buildJmaHimawariTileUrl('20260821023000', 5, 26, 12);
  assert.equal(
    url,
    'https://www.jma.go.jp/bosai/himawari/data/satimg/20260821023000/fd/20260821023000/SND/ETC/5/26/12.jpg',
  );
});

test('roundDownToStep still rounds down to a 10-minute UTC boundary', () => {
  const date = new Date(Date.UTC(2026, 7, 21, 2, 37, 45));
  const rounded = roundDownToStep(date);
  assert.equal(rounded.toISOString(), '2026-08-21T02:30:00.000Z');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/jmaHimawari.test.js`
Expected: FAIL — `buildJmaHimawariBasetime` and `buildJmaHimawariTileUrl` are not exported yet (import will resolve to `undefined`, calling them throws `TypeError: ... is not a function`).

- [ ] **Step 3: Update `src/lib/jmaHimawari.js`**

Replace the full file content with:

```js
/**
 * JMA Himawari "Cloud-top Enhanced" (IR-Enhanced) tile imagery — the same
 * product shown on BMKG's himawari-ir-enhanced reference page. Unlike the
 * old "Heavy Rainfall Potential Areas" (HRP) product this replaces (see
 * docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md), this
 * is served as a standard z/x/y tile pyramid, already colorized server-side
 * — no client-side recolor step is needed.
 *
 * See docs/superpowers/specs/2026-08-21-jma-himawari-ir-enhanced-migration-design.md
 * for how this URL pattern and the 10-minute step were confirmed (network
 * trace against jma.go.jp/bosai/map.html's "雲頂強調画像" layer).
 */

const TILE_BASE_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg';

export const JMA_TICK_STEP_MINUTES = 10;
export const JMA_TICK_COUNT = 144; // 24h of history at a 10-minute step

// JMA overwrites each basetime slot in place and does NOT 404 an unpublished
// slot — it serves the PREVIOUS day's tiles at that same HHMM with a clean
// 200 (confirmed on the previous HRP product; assumed to hold here too since
// it's the same publishing pipeline). Without this offset, "live" mode would
// silently display a stale frame as current.
export const JMA_PUBLISH_LAG_MINUTES = 20; // rounded up from the ~12min observed lag on HRP

/** Round `date` down to the nearest `stepMinutes` boundary, in UTC. */
export function roundDownToStep(date, stepMinutes = JMA_TICK_STEP_MINUTES) {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

/** Build the `YYYYMMDDHHMMSS` basetime string JMA expects, from an already-rounded UTC `date`. */
export function buildJmaHimawariBasetime(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}00`;
}

/**
 * Build one tile URL for the Cloud-top Enhanced (`SND/ETC`) product.
 * `basetime` and `validtime` are always identical for this observation
 * product (see this plan's Global Constraints).
 */
export function buildJmaHimawariTileUrl(basetime, z, x, y) {
  return `${TILE_BASE_URL}/${basetime}/fd/${basetime}/SND/ETC/${z}/${x}/${y}.jpg`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/lib/jmaHimawari.test.js`
Expected: PASS (4 passing tests, 0 failing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jmaHimawari.js src/lib/jmaHimawari.test.js
git commit -m "feat(himawari): switch tile helpers to JMA Cloud-top Enhanced product"
```

---

### Task 2: Ticks carry `basetime` instead of a static image `url`

**Files:**
- Modify: `src/hooks/useJmaHimawariTicks.js`

**Interfaces:**
- Consumes: `buildJmaHimawariBasetime`, `roundDownToStep`, `JMA_TICK_COUNT`, `JMA_TICK_STEP_MINUTES`, `JMA_PUBLISH_LAG_MINUTES` from `@/lib/jmaHimawari` (Task 1).
- Produces: `useJmaHimawariTicks(active): { ticks: Array<{date: Date, basetime: string}>, loading: false }` — note `bounds` is removed from the return value (tile layers don't need a `LatLngBounds`); Task 5 (page.jsx wiring) depends on this shape and on `bounds` no longer being present.

There is no React Testing Library in this project, and adding one is out of scope for this migration (see Global Constraints) — this hook's correctness is exercised end-to-end in Task 6's manual verification. The change here is small and mechanical enough to review by inspection; Task 1's tests already cover the underlying date math this hook calls.

- [ ] **Step 1: Update `src/hooks/useJmaHimawariTicks.js`**

Replace the full file content with:

```js
'use client';

import { useEffect, useState } from 'react';
import { JMA_TICK_COUNT, JMA_TICK_STEP_MINUTES, JMA_PUBLISH_LAG_MINUTES, roundDownToStep, buildJmaHimawariBasetime } from '@/lib/jmaHimawari';

// Real time keeps moving while the user sits in Himawari mode — re-derive
// the tick list periodically so "live" advances, the same way the old
// bignet-backed hook polled its manifest every 5 minutes. This is pure
// client-side math (no network call), so a short interval is cheap.
const REFRESH_MS = 60 * 1000;

// NOTE: if the user has scrubbed to a specific historical tick when the
// 10-minute bucket rolls, that index now points 10 minutes further back in
// absolute time — visible via the updated displayed timestamp, not silent,
// and the old bignet-backed hook drifted the same way. Freezing ticks while
// scrubbed would require this hook to know about page.jsx's timelineIndex
// state; left as-is to avoid that coupling for a cosmetic issue.
function buildTicks() {
  const latest = roundDownToStep(new Date(Date.now() - JMA_PUBLISH_LAG_MINUTES * 60 * 1000));
  const out = [];
  for (let i = JMA_TICK_COUNT - 1; i >= 0; i--) {
    const date = new Date(latest.getTime() - i * JMA_TICK_STEP_MINUTES * 60 * 1000);
    out.push({ date, basetime: buildJmaHimawariBasetime(date) });
  }
  return out;
}

/** Generates a rolling 24h/10-minute tick list for the JMA Himawari layer. */
export function useJmaHimawariTicks(active) {
  const [ticks, setTicks] = useState([]);

  useEffect(() => {
    if (!active) { setTicks([]); return; }
    setTicks(buildTicks());
    const id = setInterval(() => setTicks(buildTicks()), REFRESH_MS);
    return () => clearInterval(id);
  }, [active]);

  return { ticks, loading: false };
}
```

- [ ] **Step 2: Sanity-check by inspection**

Run: `grep -n "bounds" src/hooks/useJmaHimawariTicks.js`
Expected: no matches (confirms `bounds` was fully removed, not just from the return statement).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useJmaHimawariTicks.js
git commit -m "feat(himawari): ticks carry basetime instead of a static image URL"
```

---

### Task 3: Rewrite `HimawariLayer.jsx` as a crossfading tile layer

**Files:**
- Modify: `src/components/map/HimawariLayer.jsx`
- Delete: `src/lib/jmaHimawariRecolor.js`

**Interfaces:**
- Consumes: `buildJmaHimawariTileUrl` from `@/lib/jmaHimawari` (Task 1); `useMap` from `@vis.gl/react-google-maps` (unchanged import, already used by the current file).
- Produces: `HimawariLayer` component props: `active` (bool), `candidateBasetimes` (array of basetime strings, newest first — same fallback-chain role `candidateUrls` played before), `opacity` (number, default `0.7`), `onStatus` (callback, same `'ok' | 'loading' | 'unavailable'` contract as before). `bounds` and `candidateUrls` props are removed. Task 4 (prefetch-ahead) and Task 5 (page.jsx wiring) both depend on this exact prop list — Task 4 adds one more prop (`prefetchBasetime`) on top of it.

This component talks to the real Google Maps API and canvas-free tile rendering — there's no automated test harness for it in this project (matches the prior HRP-era plan's own testing section, which was manual-only for the same reason). Verification is manual, folded into Task 6's end-to-end pass; this task's own "did it work" check is a build/lint pass plus a quick load in the running dev server.

- [ ] **Step 1: Replace `src/components/map/HimawariLayer.jsx`**

Replace the full file content with:

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildJmaHimawariTileUrl } from '@/lib/jmaHimawari';

const CROSSFADE_MS = 400;
const TILE_SIZE = 256;

// Fixed probe tile used only to check whether a basetime has been published
// yet. z=0/x=0/y=0 covers the entire globe in a single tile, so it always
// falls inside JMA's full-disk ('fd') footprint regardless of which part of
// the world the map viewport is currently showing — no need to convert the
// current viewport into tile coordinates just to ask "does this basetime
// exist yet?". All z/x/y tiles for one basetime are published together (or
// not at all), so checking this one tile is a valid stand-in for the whole
// pyramid.
const PROBE_TILE = { z: 0, x: 0, y: 0 };

/**
 * Himawari (JMA) satellite overlay. Renders JMA's "Cloud-top Enhanced"
 * (IR-Enhanced) product as a z/x/y tile pyramid via google.maps.ImageMapType
 * — the same approach OpenWeatherLayer.jsx uses for OpenWeather tiles,
 * unlike the old GroundOverlay+client-recolor approach this replaces (see
 * docs/superpowers/specs/2026-08-21-jma-himawari-ir-enhanced-migration-design.md).
 * JMA's tiles are already colorized server-side, so no canvas recolor step
 * is needed here at all.
 *
 * JMA has no manifest telling us which basetimes actually have published
 * tiles (same situation as the old HRP product) — `candidateBasetimes` lets
 * the caller supply a fallback chain (newest first); each candidate is
 * probed with a single fixed tile (see PROBE_TILE) before being committed
 * to, so a not-yet-published basetime doesn't show a half-loaded layer.
 *
 * Frame changes crossfade over CROSSFADE_MS instead of an abrupt swap:
 * ImageMapType.setOpacity() is animated on both the incoming and outgoing
 * map types simultaneously via requestAnimationFrame, then the outgoing one
 * is removed from map.overlayMapTypes. This requires the per-tick effect's
 * cleanup to NOT tear down the currently-visible map type (only the two
 * guard/exhausted branches below do that) — otherwise the "outgoing" map
 * type would already be gone by the time the next tick's probe resolves,
 * and the crossfade would just be a fade-in from blank every time. Actual
 * teardown on unmount is handled by the separate mount-only effect at the
 * bottom.
 *
 * map.overlayMapTypes is shared with OpenWeatherLayer.jsx (both can be
 * active at once — Himawari mode plus an OpenWeather layer selection are
 * independent toggles in page.jsx) — map types are always removed by
 * identity (removeOverlayMapType below), never by a stored index, since the
 * array's indices shift whenever the other layer pushes/removes its own
 * entry.
 */

function removeOverlayMapType(map, type) {
  const arr = map.overlayMapTypes;
  for (let i = arr.getLength() - 1; i >= 0; i--) {
    if (arr.getAt(i) === type) { arr.removeAt(i); return; }
  }
}

function makeImageMapType(basetime, opacity) {
  return new window.google.maps.ImageMapType({
    name: `himawari-${basetime}`,
    tileSize: new window.google.maps.Size(TILE_SIZE, TILE_SIZE),
    opacity,
    getTileUrl: (coord, zoom) => {
      const n = 1 << zoom;
      const x = ((coord.x % n) + n) % n; // wrap horizontally
      if (coord.y < 0 || coord.y >= n) return null;
      return buildJmaHimawariTileUrl(basetime, zoom, x, coord.y);
    },
  });
}

function probeBasetime(basetime) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = buildJmaHimawariTileUrl(basetime, PROBE_TILE.z, PROBE_TILE.x, PROBE_TILE.y);
  });
}

export default function HimawariLayer({ active, candidateBasetimes = [], opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  // Stabilize on basetime content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying basetimes
  // haven't changed (the 10-minute bucket didn't roll), and depending on
  // `candidateBasetimes` by reference would tear down and rebuild the
  // overlay every minute for no reason.
  const basetimeKey = candidateBasetimes.join('|');

  useEffect(() => {
    if (!map || !window.google || !active || !candidateBasetimes.length) {
      cancelAnimationFrame(fadeRafRef.current);
      if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
      if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    onStatus?.('loading');

    const crossfadeIn = (basetime) => {
      const outgoing = overlayRef.current;
      cancelAnimationFrame(fadeRafRef.current);
      // Finalize whatever the previous crossfade left mid-flight — cancelling
      // its rAF loop above means its own `outgoing` (tracked in
      // prevOverlayRef) never reaches the t>=1 branch that would remove it,
      // so it would otherwise be stranded on the map at a partial opacity
      // forever (reachable by scrubbing across cached ticks faster than
      // CROSSFADE_MS).
      if (prevOverlayRef.current && prevOverlayRef.current !== outgoing) {
        removeOverlayMapType(map, prevOverlayRef.current);
      }
      const incoming = makeImageMapType(basetime, 0);
      map.overlayMapTypes.push(incoming);
      prevOverlayRef.current = outgoing;
      overlayRef.current = incoming;

      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / CROSSFADE_MS);
        incoming.setOpacity(t * opacity);
        outgoing?.setOpacity((1 - t) * opacity);
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          if (outgoing) removeOverlayMapType(map, outgoing);
          if (prevOverlayRef.current === outgoing) prevOverlayRef.current = null;
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    };

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

      const basetime = candidateBasetimes[i];
      const ok = await probeBasetime(basetime);
      if (cancelled) return;
      if (!ok) { tryCandidate(i + 1); return; }
      crossfadeIn(basetime);
      onStatus?.('ok');
    };

    // Debounce: scrubbing the time-travel slider can change `basetimeKey`
    // many times per second (every intermediate drag position), and each
    // attempt costs a probe request — skip intermediate positions instead
    // of doing that work for frames the user never settles on. This also
    // shrinks (though doesn't by itself eliminate — see the crossfadeIn
    // finalize step above) the window for two crossfades to overlap.
    const debounceId = setTimeout(() => tryCandidate(0), 200);

    return () => {
      cancelled = true;
      clearTimeout(debounceId);
      // Deliberately does NOT touch overlayRef/prevOverlayRef/fadeRafRef
      // here — this cleanup runs on every re-render where basetimeKey
      // changes (e.g. the user scrubbing to a new tick), and the
      // currently-visible map type (and any crossfade already in progress)
      // must keep showing until the NEXT tick's own tryCandidate/crossfadeIn
      // explicitly takes over as `outgoing`. See the two branches above
      // (inactive/no candidates, and exhausted candidates) for the only
      // cases that actually mean "there's nothing to show" — and the
      // mount-only effect below for teardown on real unmount.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, basetimeKey, opacity, onStatus]);

  // Real unmount only (empty deps) — the per-tick effect above deliberately
  // leaves the map type in place across ordinary re-runs, so something has
  // to remove it when this component actually leaves the tree (e.g. the
  // user switches away from Himawari mode entirely).
  useEffect(() => {
    return () => {
      cancelAnimationFrame(fadeRafRef.current);
      if (map) {
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      }
      overlayRef.current = null;
      prevOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
```

- [ ] **Step 2: Delete the now-unused recolor module**

```bash
git rm src/lib/jmaHimawariRecolor.js
```

- [ ] **Step 3: Verify no leftover references**

Run: `grep -rn "jmaHimawariRecolor\|recolorToTransparentPng\|isMagentaPixel\|JMA_SEA_BOUNDS\|buildJmaHimawariUrl\b" --include="*.js" --include="*.jsx" src`
Expected: no matches. (`page.jsx` and `TimeTravelBar.jsx` still reference the old `candidateUrls`/`bounds` props at this point in the plan — that's expected and fixed in Task 5; this grep is only checking for the deleted module and removed exports.)

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: build fails at this point only because `page.jsx` (Task 5, not yet done) still passes the old `candidateUrls`/`bounds` props and imports `himawari.bounds` — confirm the failure is specifically about those, not about `HimawariLayer.jsx` or the deleted recolor module. If Next's build doesn't statically fail on extra/unknown props (it won't — JSX prop mismatches aren't a build error, just an unused prop at runtime), this step instead just confirms the project still compiles with the recolor module gone; skip straight to Task 5 either way.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/HimawariLayer.jsx
git commit -m "feat(himawari): render JMA tiles via crossfading ImageMapType, drop recolor pipeline"
```

---

### Task 4: Prefetch the next frame ahead of time during Play

**Files:**
- Modify: `src/components/map/HimawariLayer.jsx`

**Interfaces:**
- Consumes: `makeImageMapType`, `removeOverlayMapType` (defined in Task 3, same file).
- Produces: new `HimawariLayer` prop `prefetchBasetime` (string or `null`) — Task 5 (page.jsx) computes and passes this.

- [ ] **Step 1: Add the `prefetchBasetime` prop and preload effect**

In `src/components/map/HimawariLayer.jsx`, change the function signature:

```jsx
export default function HimawariLayer({ active, candidateBasetimes = [], prefetchBasetime = null, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  const preloadRef = useRef(null); // { basetime, type } | null — a hidden (opacity 0) map type warming the browser's tile cache for the upcoming frame
  const basetimeKey = candidateBasetimes.join('|');
```

Add a new effect right after the `basetimeKey` line, before the main per-tick effect:

```jsx
  // While playing, warm the browser's HTTP cache for the *next* frame's
  // actual viewport tiles (not just the single probe tile) while the
  // current frame is still showing, by pushing a hidden (opacity 0)
  // ImageMapType for it — Google Maps will issue real tile requests for the
  // current viewport against this type immediately. When the timeline
  // actually advances to this basetime, crossfadeIn (below) reuses this
  // already-warm map type instead of creating a fresh one, so the fade-in
  // doesn't stall on network fetches.
  useEffect(() => {
    if (!map || !window.google || !active || !prefetchBasetime) return;
    if (preloadRef.current?.basetime === prefetchBasetime) return;
    if (preloadRef.current) removeOverlayMapType(map, preloadRef.current.type);
    const type = makeImageMapType(prefetchBasetime, 0);
    map.overlayMapTypes.push(type);
    preloadRef.current = { basetime: prefetchBasetime, type };
  }, [map, active, prefetchBasetime]);
```

Inside the existing `crossfadeIn` function, replace the "create incoming" lines:

```jsx
      const incoming = makeImageMapType(basetime, 0);
      map.overlayMapTypes.push(incoming);
```

with:

```jsx
      let incoming;
      if (preloadRef.current?.basetime === basetime) {
        incoming = preloadRef.current.type;
        preloadRef.current = null;
      } else {
        incoming = makeImageMapType(basetime, 0);
        map.overlayMapTypes.push(incoming);
      }
```

Finally, in the mount-only unmount effect at the bottom, add preload cleanup:

```jsx
  useEffect(() => {
    return () => {
      cancelAnimationFrame(fadeRafRef.current);
      if (map) {
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
        if (preloadRef.current) removeOverlayMapType(map, preloadRef.current.type);
      }
      overlayRef.current = null;
      prevOverlayRef.current = null;
      preloadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Verify by inspection**

Run: `grep -n "prefetchBasetime\|preloadRef" src/components/map/HimawariLayer.jsx`
Expected: matches at the prop destructure, the new preload effect, both branches inside `crossfadeIn`, and the unmount cleanup — five call sites total. If any is missing, the edit from Step 1 was incomplete.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/HimawariLayer.jsx
git commit -m "feat(himawari): prefetch the next frame's tiles ahead of time during Play"
```

---

### Task 5: Wire `page.jsx` to the new basetime-based props

**Files:**
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `useJmaHimawariTicks` returning `{ ticks: [{date, basetime}], loading }` (Task 2); `HimawariLayer` props `active`, `candidateBasetimes`, `prefetchBasetime`, `onStatus` (Tasks 3–4).
- Produces: nothing consumed by later tasks — this is the final integration point.

- [ ] **Step 1: Replace `himawariCandidateUrls` with `himawariBasetimeCandidates`**

In `src/app/(dashboard)/page.jsx`, find this block (around line 120):

```jsx
  const himawariCandidateUrls = useMemo(() => {
    if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
    if (timelineIndex != null) {
      const tick = himawari.ticks[timelineIndex];
      return tick ? [tick.url] : [];
    }
    return himawari.ticks.slice(-4).reverse().map((t) => t.url);
  }, [activeLayer, himawari.ticks, timelineIndex]);
```

Replace it with:

```jsx
  const himawariBasetimeCandidates = useMemo(() => {
    if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
    if (timelineIndex != null) {
      const tick = himawari.ticks[timelineIndex];
      return tick ? [tick.basetime] : [];
    }
    return himawari.ticks.slice(-4).reverse().map((t) => t.basetime);
  }, [activeLayer, himawari.ticks, timelineIndex]);

  // While Play is running, hand HimawariLayer the *next* tick's basetime so
  // it can warm the tile cache ahead of time (see HimawariLayer.jsx's
  // prefetch effect) — only meaningful mid-playback with a known index.
  const himawariPrefetchBasetime = useMemo(() => {
    if (activeLayer !== 'himawari' || !isPlaying || timelineIndex == null) return null;
    return himawari.ticks[timelineIndex + 1]?.basetime ?? null;
  }, [activeLayer, isPlaying, timelineIndex, himawari.ticks]);
```

- [ ] **Step 2: Update the `<HimawariLayer>` JSX**

Find (around line 190):

```jsx
            {activeLayer === 'himawari' && (
              <HimawariLayer
                active
                bounds={himawari.bounds}
                candidateUrls={himawariCandidateUrls}
                onStatus={setHimawariStatus}
              />
            )}
```

Replace with:

```jsx
            {activeLayer === 'himawari' && (
              <HimawariLayer
                active
                candidateBasetimes={himawariBasetimeCandidates}
                prefetchBasetime={himawariPrefetchBasetime}
                onStatus={setHimawariStatus}
              />
            )}
```

- [ ] **Step 3: Update the Himawari caveat text**

Find (around line 302):

```jsx
              caveat={activeLayer === 'himawari' ? 'Deteksi awan berpotensi hujan lebat, bukan pengukuran curah hujan aktual · Sumber: JMA (Japan Meteorological Agency)' : null}
```

Replace with:

```jsx
              caveat={activeLayer === 'himawari' ? 'Citra infrared awan (suhu puncak awan) · Sumber: JMA (Japan Meteorological Agency)' : null}
```

- [ ] **Step 4: Verify no leftover references to the old prop names**

Run: `grep -n "himawariCandidateUrls\|himawari\.bounds\|candidateUrls=" "src/app/(dashboard)/page.jsx"`
Expected: no matches.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/page.jsx"
git commit -m "feat(himawari): wire page.jsx to basetime-based tile candidates and prefetch"
```

---

### Task 6: Manual end-to-end verification against JMA/BMKG

**Files:** none (verification only — no code changes expected unless a check below fails, in which case fix the relevant file from Tasks 1–5 and re-run this task's checks).

- [ ] **Step 1: Start the dev server and open Himawari mode**

Run: `npm run dev` (or use the project's preview tooling), open the dashboard, switch the layer selector to Himawari mode.
Expected: satellite imagery appears using a rainbow/enhanced color palette (not solid cyan blobs) — confirms the tile source switch took effect.

- [ ] **Step 2: Compare against BMKG's reference page**

Open https://www.bmkg.go.id/cuaca/satelit/himawari-ir-enhanced in a separate tab for the same rough time window.
Expected: cloud shapes and color bands broadly match (same storm systems, same color at the same cloud-top temperatures) — this is the core acceptance criterion for the whole migration.

- [ ] **Step 3: Zoom in and out across several levels**

Use the map's zoom controls to go from the national view down to a close-in zoom and back out.
Expected: tiles keep loading at each level. If imagery visibly stops updating or turns solid-gray/blank past some zoom level, note the zoom level — that is the signal to add an explicit `maxZoom` clamp to `makeImageMapType` in `HimawariLayer.jsx` (not needed unless this is observed).

- [ ] **Step 4: Press Play and watch a full loop**

Click the Play button on the time-travel bar and let it run for at least 30 seconds without touching the scrubber.
Expected: frames advance roughly once per second with a visible crossfade, clouds appear to move/evolve, no long freezes. Compare the sense of motion against JMA's own animated slider (https://www.jma.go.jp/bosai/map.html#5/34.5/137/&elem=ir&contents=himawari, "雲頂強調画像" layer, Play button bottom-left) for a sanity check — motion doesn't need to be frame-identical, just comparably smooth.

- [ ] **Step 5: Scrub rapidly back and forth**

Drag the time-travel slider quickly across several ticks in both directions.
Expected: no overlay gets stuck at a partial opacity (a faint "ghost" frame that never fully clears); the map settles cleanly on the tick you stop on.

- [ ] **Step 6: Scrub to "now" during a publish gap**

Scrub to the live/rightmost position right after the dashboard loads.
Expected: imagery loads via automatic fallback to a slightly older basetime if the newest hasn't published yet (no blank overlay, no "unavailable" message under normal conditions).

- [ ] **Step 7: Scrub to a basetime unlikely to exist**

Pick a timestamp far enough in the past that it's outside the 24h retention window (use the jump-to-time dropdown, select the oldest available entry, then reason about whether anything earlier would be probed — or temporarily test by editing `JMA_TICK_COUNT` locally to a larger number and picking an entry near the new end, then revert the edit).
Expected: the "Citra tidak tersedia untuk waktu ini" message appears — confirms the probe-based fallback correctly reports unavailability instead of silently showing nothing.

- [ ] **Step 8: Switch away from Himawari mode while Play is active**

Start Play in Himawari mode, then switch the layer selector to Rain mode mid-playback.
Expected: no leftover Himawari tiles remain visible on the map after switching (confirms the unmount cleanup, including the Task 4 preload cleanup, removes every `overlayMapTypes` entry this component added).

- [ ] **Step 9: Confirm the caveat/attribution text**

With Himawari mode active, read the text above the time-travel bar.
Expected: reads exactly `Citra infrared awan (suhu puncak awan) · Sumber: JMA (Japan Meteorological Agency)`.

- [ ] **Step 10: Final grep sweep**

Run: `grep -rn "jmaHimawariRecolor\|candidateUrls\|JMA_SEA_BOUNDS\|buildJmaHimawariUrl\b\|r2w_hrp" --include="*.js" --include="*.jsx" src`
Expected: no matches anywhere in `src/` — confirms every trace of the old HRP/GroundOverlay/recolor approach is gone, not just the files this plan explicitly touched.

- [ ] **Step 11: Commit (only if Steps 1–10 required fixes)**

If every check passed with no code changes, there is nothing to commit for this task. If a fix was needed (e.g. a `maxZoom` clamp from Step 3), commit it separately:

```bash
git add -A
git commit -m "fix(himawari): <describe the specific fix made during manual QA>"
```
