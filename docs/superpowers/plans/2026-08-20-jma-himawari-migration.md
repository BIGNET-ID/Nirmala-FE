# Migrasi Layer Himawari ke Citra JMA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bignet-backed Himawari satellite layer (Philippines-only, ~6h retention) with JMA's "Heavy Rainfall Potential Areas" imagery (all of Southeast Asia including Indonesia, ~24h retention), fetched directly client-side with no new backend proxy.

**Architecture:** All new logic is client-side. A pure helper module computes JMA image URLs from timestamps; a new hook generates 144 ten-minute ticks over a rolling 24h window; `HimawariLayer` gains a preload-with-fallback mechanism (tries the newest frame, falls back to older frames if the newest hasn't been published yet) and reports load status back to `page.jsx`, which shows an "unavailable" message when even the fallback chain fails.

**Tech Stack:** Next.js 16 (App Router), React (`'use client'` components), `@vis.gl/react-google-maps` (`useMap`), `google.maps.GroundOverlay`. No test runner exists in this repo (`npm test` is a stub) — verification is done via one-off Node scripts for pure logic and manual browser checks (already the pattern used throughout this codebase) for anything requiring the DOM/Google Maps.

## Global Constraints

- JMA image URL pattern: `https://www.data.jma.go.jp/mscweb/data/himawari/img/r2w/r2w_hrp_{HHMM}.jpg` — `HHMM` is **UTC**, zero-padded, on a 10-minute boundary (e.g. `0950`, not `950` or `09:50`).
- Coverage bounds (from JMA's official Users' Guide, Ver. 4 2015, §3(1)): `{ north: 30, south: -15, west: 90, east: 165 }`. Do not recompute or approximate these — use these exact values.
- No new backend route. JMA images load directly from the client (`<img>`/`GroundOverlay`) — confirmed no CORS/Referer restriction and no `robots.txt` disallow.
- Attribution is legally required by JMA's Terms of Use. The caveat text shown in the UI must mention "JMA" (see Task 3).
- This product detects *potential* convective rainfall from cloud-top temperature, not measured rainfall — the caveat text must say this is not an actual rainfall measurement (see Task 3).
- (Added for Tasks 5-6) Reading pixel data from the JMA image via `<canvas>` requires the image to be loaded with `crossOrigin = 'anonymous'`. This is confirmed to work: JMA's CloudFront-fronted server returns `Access-Control-Allow-Origin: *` when the request carries an `Origin` header (as a real browser `<img crossorigin>` request does) — verified live with `curl -H "Origin: http://localhost:3010" ...`. A plain `curl -I` with no `Origin` header misses this because CloudFront varies its response on `Origin`, which is why the original Task 1 investigation concluded (correctly, for plain display) that CORS didn't matter — that conclusion doesn't extend to canvas pixel access, which does need it and does get it.
- (Added for Tasks 5-6) Magenta "rainfall potential" pixel detection threshold, sampled from a live `r2w_hrp_*.jpg`: `r >= 180 && g <= 70 && b >= 100`. Do not use a different threshold without re-sampling — grayscale sky/cloud pixels have `r === g === b`, and JMA's own green country-border overlay lines have low `r`/`b` with mid-range `g`; both must fall outside this range.

---

### Task 1: JMA URL/date helper module

**Files:**
- Create: `src/lib/jmaHimawari.js`

**Interfaces:**
- Consumes: nothing (pure functions, no imports from the rest of the app).
- Produces (used by Task 3):
  - `JMA_SEA_BOUNDS: { north: number, south: number, west: number, east: number }`
  - `JMA_TICK_STEP_MINUTES: number` (= 10)
  - `JMA_TICK_COUNT: number` (= 144)
  - `roundDownToStep(date: Date, stepMinutes?: number): Date`
  - `buildJmaHimawariUrl(date: Date): string` — `date` must already be rounded to a step boundary; the function only reads `getUTCHours()`/`getUTCMinutes()`.

- [ ] **Step 1: Write the verification script (expected to fail — the module doesn't exist yet)**

Create a scratch file `/tmp/verify-jma-himawari.mjs` with this exact content:

```js
import {
  JMA_SEA_BOUNDS,
  JMA_TICK_STEP_MINUTES,
  JMA_TICK_COUNT,
  roundDownToStep,
  buildJmaHimawariUrl,
} from '/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3/src/lib/jmaHimawari.js';

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, expected ${e}`);
  console.log(`OK ${label}`);
}

assertEqual(JMA_SEA_BOUNDS, { north: 30, south: -15, west: 90, east: 165 }, 'JMA_SEA_BOUNDS');
assertEqual(JMA_TICK_STEP_MINUTES, 10, 'JMA_TICK_STEP_MINUTES');
assertEqual(JMA_TICK_COUNT, 144, 'JMA_TICK_COUNT');

assertEqual(
  roundDownToStep(new Date('2026-08-20T09:57:30.000Z')).toISOString(),
  '2026-08-20T09:50:00.000Z',
  'roundDownToStep rounds down mid-step',
);
assertEqual(
  roundDownToStep(new Date('2026-08-20T09:50:00.000Z')).toISOString(),
  '2026-08-20T09:50:00.000Z',
  'roundDownToStep is a no-op exactly on a boundary',
);
assertEqual(
  roundDownToStep(new Date('2026-08-20T00:05:00.000Z')).toISOString(),
  '2026-08-20T00:00:00.000Z',
  'roundDownToStep handles the top of the hour',
);

assertEqual(
  buildJmaHimawariUrl(new Date('2026-08-20T09:50:00.000Z')),
  'https://www.data.jma.go.jp/mscweb/data/himawari/img/r2w/r2w_hrp_0950.jpg',
  'buildJmaHimawariUrl pads hours/minutes',
);
assertEqual(
  buildJmaHimawariUrl(new Date('2026-08-20T00:00:00.000Z')),
  'https://www.data.jma.go.jp/mscweb/data/himawari/img/r2w/r2w_hrp_0000.jpg',
  'buildJmaHimawariUrl pads midnight to 0000',
);

console.log('ALL PASS');
```

- [ ] **Step 2: Run it, confirm it fails**

Run:
```bash
node /tmp/verify-jma-himawari.mjs
```
Expected: an error like `Cannot find module '/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3/src/lib/jmaHimawari.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `src/lib/jmaHimawari.js`**

```js
'use client';

/**
 * JMA "Heavy Rainfall Potential Areas" imagery (Southeast Asia, native
 * resolution). Public, no auth. Loaded as a plain <img>/GroundOverlay (not
 * fetched via JS), so the lack of an Access-Control-Allow-Origin header on
 * JMA's response doesn't matter — confirmed no Referer/robots.txt block
 * either. See docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md.
 */

const BASE_URL = 'https://www.data.jma.go.jp/mscweb/data/himawari/img/r2w';

// From JMA's "Users' Guide to Imagery with Heavy Rainfall Potential Areas"
// (Ver. 4, 2015), section 3(1): Southeast Asia coverage is 30N-15S, 90E-165E.
// This is a plain equirectangular rectangle (the 1501x901 image's pixel
// aspect ratio matches the 75x45 degree aspect ratio exactly), so it can be
// used directly as GroundOverlay bounds with no reprojection.
export const JMA_SEA_BOUNDS = { north: 30, south: -15, west: 90, east: 165 };

export const JMA_TICK_STEP_MINUTES = 10;
export const JMA_TICK_COUNT = 144; // 24h of history at a 10-minute step

/** Round `date` down to the nearest `stepMinutes` boundary, in UTC. */
export function roundDownToStep(date, stepMinutes = JMA_TICK_STEP_MINUTES) {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

/** Build the JMA image URL for an already-rounded UTC `date`. */
export function buildJmaHimawariUrl(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${BASE_URL}/r2w_hrp_${hh}${mm}.jpg`;
}
```

- [ ] **Step 4: Run the verification script again, confirm it passes**

Run:
```bash
node /tmp/verify-jma-himawari.mjs
```
Expected output: 8 `OK ...` lines followed by `ALL PASS`, no errors.

- [ ] **Step 5: Delete the scratch file and commit**

```bash
rm /tmp/verify-jma-himawari.mjs
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3"
git add src/lib/jmaHimawari.js
git commit -m "$(cat <<'EOF'
feat(himawari): add JMA image URL/date helpers

Pure functions for the JMA-to-Google-Maps migration: rounding a
timestamp to the nearest 10-minute boundary and building the JMA
Heavy Rainfall Potential Areas image URL for it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `HimawariLayer` — preload-with-fallback and status reporting

**Files:**
- Modify: `src/components/map/HimawariLayer.jsx` (currently 38 lines, full file shown below)

**Interfaces:**
- Consumes: nothing new from other tasks (only touches this one component's own props).
- Produces (used by Task 3):
  - New prop `candidateUrls: string[]` **replaces** the old `frameUrl: string` prop. Ordered most-preferred first — the component tries `candidateUrls[0]`, and on load failure tries `candidateUrls[1]`, etc., stopping at the first one that loads.
  - New prop `onStatus?: (status: 'ok' | 'loading' | 'unavailable') => void` — called whenever the resolved status changes. `'ok'` means an overlay is showing (or nothing is active — see below), `'loading'` while preloading the first candidate, `'unavailable'` when every candidate in `candidateUrls` failed to load.
  - `active` and `bounds` props keep their exact current meaning and shape (`bounds: { north, south, west, east }`).

This task can only be code-reviewed in isolation (there is no test runner and this component only does anything inside a live Google Map) — its behavior is verified end-to-end in Task 3 once `page.jsx` actually supplies `candidateUrls`. Read through the diff carefully; there is no separate automated check for this task.

- [ ] **Step 1: Replace the full contents of `src/components/map/HimawariLayer.jsx`**

Current file (for reference — this is what you're replacing):
```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Himawari satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile pyramid),
 * the grid API returns ONE static PNG per timestamp covering a fixed lat/lng
 * box — so this uses google.maps.GroundOverlay, not ImageMapType.
 */
export default function HimawariLayer({ active, frameUrl, bounds, opacity = 0.7 }) {
  const map = useMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google || !active || !frameUrl || !bounds) {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      return;
    }

    const gmBounds = new window.google.maps.LatLngBounds(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east },
    );
    const overlay = new window.google.maps.GroundOverlay(frameUrl, gmBounds, { opacity });
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map, active, frameUrl, bounds, opacity]);

  return null;
}
```

New file:
```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Himawari (JMA) satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile
 * pyramid), JMA returns ONE static JPEG per timestamp covering a fixed
 * lat/lng box — so this uses google.maps.GroundOverlay, not ImageMapType.
 *
 * JMA has no manifest telling us which timestamps actually have a published
 * image (unlike the old bignet API), and the newest frame is sometimes not
 * published yet when we ask for it. `candidateUrls` lets the caller supply a
 * fallback chain (newest first) — this preloads each with a plain Image()
 * (not GroundOverlay directly) so a 404 can be caught and the next
 * candidate tried, instead of silently showing a blank overlay.
 */
export default function HimawariLayer({ active, candidateUrls = [], bounds, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google || !active || !candidateUrls.length || !bounds) {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    onStatus?.('loading');

    const tryCandidate = (i) => {
      if (i >= candidateUrls.length) {
        if (cancelled) return;
        overlayRef.current?.setMap(null);
        overlayRef.current = null;
        onStatus?.('unavailable');
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const gmBounds = new window.google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        overlayRef.current?.setMap(null);
        const overlay = new window.google.maps.GroundOverlay(candidateUrls[i], gmBounds, { opacity });
        overlay.setMap(map);
        overlayRef.current = overlay;
        onStatus?.('ok');
      };
      img.onerror = () => { if (!cancelled) tryCandidate(i + 1); };
      img.src = candidateUrls[i];
    };
    tryCandidate(0);

    return () => {
      cancelled = true;
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
    };
  }, [map, active, candidateUrls, bounds, opacity, onStatus]);

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3"
git add src/components/map/HimawariLayer.jsx
git commit -m "$(cat <<'EOF'
feat(himawari): add preload-with-fallback to HimawariLayer

Replaces the single frameUrl prop with candidateUrls (newest first)
and an onStatus callback — JMA has no manifest of which timestamps
are actually published, so the newest frame may 404 and needs a
fallback chain instead of a blank overlay.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire JMA into `page.jsx`, add the new hook, update copy

**Files:**
- Create: `src/hooks/useJmaHimawariTicks.js`
- Modify: `src/app/(dashboard)/page.jsx`
- Modify: `src/constants/metrics.js:39`

**Interfaces:**
- Consumes:
  - From Task 1: `JMA_SEA_BOUNDS`, `roundDownToStep`, `buildJmaHimawariUrl`, `JMA_TICK_STEP_MINUTES`, `JMA_TICK_COUNT` from `@/lib/jmaHimawari`.
  - From Task 2: `HimawariLayer`'s new props `candidateUrls` and `onStatus`.
- Produces: `useJmaHimawariTicks(active: boolean): { ticks: Array<{date: Date, url: string}>, bounds: typeof JMA_SEA_BOUNDS, loading: false }` — same return shape as the old `useHimawariGrid`, so nothing downstream of `himawari.ticks`/`himawari.bounds`/`himawari.loading` in `page.jsx` needs to change except what's listed below.

- [ ] **Step 1: Create `src/hooks/useJmaHimawariTicks.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import { JMA_TICK_COUNT, JMA_TICK_STEP_MINUTES, JMA_SEA_BOUNDS, roundDownToStep, buildJmaHimawariUrl } from '@/lib/jmaHimawari';

// Real time keeps moving while the user sits in Himawari mode — re-derive
// the tick list periodically so "live" advances, the same way the old
// bignet-backed hook polled its manifest every 5 minutes. This is pure
// client-side math (no network call), so a short interval is cheap.
const REFRESH_MS = 60 * 1000;

function buildTicks() {
  const latest = roundDownToStep(new Date());
  const out = [];
  for (let i = JMA_TICK_COUNT - 1; i >= 0; i--) {
    const date = new Date(latest.getTime() - i * JMA_TICK_STEP_MINUTES * 60 * 1000);
    out.push({ date, url: buildJmaHimawariUrl(date) });
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

  return { ticks, bounds: JMA_SEA_BOUNDS, loading: false };
}
```

- [ ] **Step 2: Swap the hook import in `page.jsx`**

In `src/app/(dashboard)/page.jsx`, find:
```js
import { useHimawariGrid } from '@/hooks/useHimawariGrid';
```
Replace with:
```js
import { useJmaHimawariTicks } from '@/hooks/useJmaHimawariTicks';
```

- [ ] **Step 3: Add a `himawariStatus` state and the candidate-URL memo**

In `src/app/(dashboard)/page.jsx`, find this block (around line 74):
```js
  const himawari = useHimawariGrid(activeLayer === 'himawari');
  const rainHistoryRefSensorId = SENSOR_STATIONS.find((s) => s.status === 'active')?.id ?? SENSOR_STATIONS[0]?.id;
  const rainHistory = useRainHistoryRange(activeLayer === 'rain', rainHistoryRefSensorId);
```
Replace with:
```js
  const himawari = useJmaHimawariTicks(activeLayer === 'himawari');
  const [himawariStatus, setHimawariStatus] = useState('ok'); // 'ok' | 'loading' | 'unavailable'
  const rainHistoryRefSensorId = SENSOR_STATIONS.find((s) => s.status === 'active')?.id ?? SENSOR_STATIONS[0]?.id;
  const rainHistory = useRainHistoryRange(activeLayer === 'rain', rainHistoryRefSensorId);
```

Then find (around line 114, right after `rainStations` is computed):
```js
  const currentHimawariTick = activeLayer === 'himawari'
    ? (timelineIndex != null ? himawari.ticks[timelineIndex] : himawari.ticks[himawari.ticks.length - 1])
    : null;
```
Replace with:
```js
  // When "live" (no explicit scrub position), retry the last few ticks —
  // JMA sometimes hasn't published the newest 10-minute frame yet. A
  // user-picked historical tick gets no fallback: if that exact minute
  // wasn't published, say so (HimawariLayer's onStatus) rather than
  // silently substituting a different time than the one they picked.
  const himawariCandidateUrls = useMemo(() => {
    if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
    if (timelineIndex != null) {
      const tick = himawari.ticks[timelineIndex];
      return tick ? [tick.url] : [];
    }
    return himawari.ticks.slice(-4).reverse().map((t) => t.url);
  }, [activeLayer, himawari.ticks, timelineIndex]);
```

(Note: `currentHimawariTick` is removed entirely — nothing else in the file reads it once Step 4 below is applied.)

- [ ] **Step 4: Update the `<HimawariLayer>` render and add the unavailable-message box**

In `src/app/(dashboard)/page.jsx`, find:
```jsx
            {activeLayer === 'himawari' && (
              <HimawariLayer active bounds={himawari.bounds} frameUrl={currentHimawariTick?.url} />
            )}
```
Replace with:
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

Then find the `{/* Top-center: contextual info pill */}` block (around line 237):
```jsx
          {/* Top-center: contextual info pill */}
          <MapInfoPill raining={stats.raining} total={stats.total} loading={loading && stats.total === 0} />
```
Add a new block immediately after it (still inside the same map-container `<Box>`, as a sibling of `<MapInfoPill>`):
```jsx
          {/* Top-center, below the info pill: Himawari load-failure notice.
              Rare (only when JMA hasn't published any of the last 4 frames,
              or a specifically-scrubbed frame doesn't exist), so it doesn't
              need a permanent slot the way MapInfoPill does. */}
          {activeLayer === 'himawari' && himawariStatus === 'unavailable' && (
            <Box
              sx={{
                position: 'absolute',
                top: 128,
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
              Citra tidak tersedia untuk waktu ini
            </Box>
          )}
```

- [ ] **Step 5: Update the Himawari caveat text**

In `src/app/(dashboard)/page.jsx`, find:
```jsx
              caveat={activeLayer === 'himawari' ? 'Waktu di atas adalah jam citra satelit tersedia, bukan waktu sekarang · Cakupan: Filipina saja' : null}
```
Replace with:
```jsx
              caveat={activeLayer === 'himawari' ? 'Deteksi awan berpotensi hujan lebat, bukan pengukuran curah hujan aktual · Sumber: JMA (Japan Meteorological Agency)' : null}
```

- [ ] **Step 6: Update the leftover time-travel comment**

In `src/app/(dashboard)/page.jsx`, find the comment above `timelineIndex`'s declaration (around line 66):
```js
  // Global time-travel control (Play + scrubber). `timelineIndex === null`
  // means "live"; otherwise it indexes into `ticks` below. Ticks are per-mode:
  // rain history's actual retained window (discovered from a reference
  // sensor's timeseries — the backend has no fixed/contractual retention, see
  // useRainHistoryRange), or the Himawari API's own rolling frame window
  // (~hours, not days — see constants/metrics.js note).
```
Replace with:
```js
  // Global time-travel control (Play + scrubber). `timelineIndex === null`
  // means "live"; otherwise it indexes into `ticks` below. Ticks are per-mode:
  // rain history's actual retained window (discovered from a reference
  // sensor's timeseries — the backend has no fixed/contractual retention, see
  // useRainHistoryRange), or a fixed rolling 24h/10-minute window computed
  // client-side from JMA's Himawari image URL pattern (see useJmaHimawariTicks).
```

- [ ] **Step 7: Update `src/constants/metrics.js:39`**

Find:
```js
    legendNote: 'Citra satelit Himawari. Cakupan: Filipina saja, mengikuti jendela waktu yang disediakan API.',
```
Replace with:
```js
    legendNote: 'Deteksi awan berpotensi hujan lebat dari JMA. Cakupan: Asia Tenggara (termasuk Indonesia), bukan pengukuran curah hujan aktual.',
```

- [ ] **Step 8: Verify in the browser**

Start (or confirm already running) the dev server, then in a browser:

1. Open the app, click "Himawari" in the Layer Data panel.
2. Confirm the satellite overlay now visually covers Indonesia (Sumatra/Java/Kalimantan/Sulawesi), not just the Philippines — compare against the coastline.
3. Open the time-travel dropdown (the "Lompat ke waktu..." combobox in the bottom bar) and confirm it lists roughly 144 options spanning ~24 hours, not ~36 spanning ~6 hours.
4. Confirm the caveat text above the time-travel bar now reads "Deteksi awan berpotensi hujan lebat, bukan pengukuran curah hujan aktual · Sumber: JMA (Japan Meteorological Agency)".
5. Open the browser's Network tab, filter by `data.jma.go.jp`, and confirm requests to `r2w_hrp_*.jpg` succeed (status 200) with no requests to `c4c-nirmala.api.bignet.host/api/grid` anywhere.
6. Scrub the time-travel slider to several different points (including near "live" and near the oldest tick) and confirm the overlay image updates each time without a JS console error.
7. Check the legend panel (bottom-right, "HIMAWARI" box) shows the updated note mentioning Indonesia/Asia Tenggara, not "Filipina saja".
8. Verify the fallback-retry path: while in "live" mode (don't scrub), watch the Network tab filtered by `r2w_hrp`. Because the newest 10-minute frame is often not published yet, you should sometimes see **two or more** requests fire in quick succession for different timestamps (e.g. `r2w_hrp_1000.jpg` then `r2w_hrp_0950.jpg`) with only the last one used — this proves `HimawariLayer`'s fallback chain is being exercised, not just its happy path.
9. Verify the "unavailable" failure path deterministically (this can't be relied on to occur naturally): open DevTools → Network tab → set "Offline" (or use Network request blocking for the pattern `*data.jma.go.jp*`), then switch to Himawari mode. Confirm the "Citra tidak tersedia untuk waktu ini" box (added in Step 4) appears below the top-center info pill within a few seconds. Turn the network condition back to "Online"/unblock afterwards and confirm the message disappears and the overlay loads normally again.

- [ ] **Step 9: Commit**

```bash
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3"
git add src/hooks/useJmaHimawariTicks.js "src/app/(dashboard)/page.jsx" src/constants/metrics.js
git commit -m "$(cat <<'EOF'
feat(himawari): switch the map layer to JMA imagery

Replaces bignet's Philippines-only, 6-hour-retention Himawari grid
with JMA's Heavy Rainfall Potential Areas product, which covers all
of Southeast Asia (including Indonesia) with a 24-hour rolling
window, fetched directly client-side (no proxy needed — confirmed no
CORS/Referer restriction).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove the now-dead bignet Himawari code

**Files:**
- Delete: `src/hooks/useHimawariGrid.js`
- Modify: `src/lib/nirmalaApi.js` (remove the `getHimawariGrid` method)
- Modify: `src/lib/timeTravelRange.js` (remove `buildHimawariTicks` and `parseHimawariTime`)

**Interfaces:**
- Consumes: none (this task only removes code Task 3 made unreachable).
- Produces: nothing new — this is a cleanup task.

- [ ] **Step 1: Confirm nothing still references the code being removed**

Run:
```bash
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3"
grep -rn "getHimawariGrid\|buildHimawariTicks\|parseHimawariTime\|useHimawariGrid" src/
```
Expected: matches **only** inside `src/hooks/useHimawariGrid.js` and the two definition sites in `src/lib/nirmalaApi.js` / `src/lib/timeTravelRange.js` themselves (i.e., no references from `page.jsx` or anywhere else — Task 3 already removed those). If anything else shows up, stop and investigate before continuing — do not delete code that's still referenced.

- [ ] **Step 2: Delete the old hook file**

```bash
git rm src/hooks/useHimawariGrid.js
```

- [ ] **Step 3: Remove `getHimawariGrid` from `src/lib/nirmalaApi.js`**

Find:
```js
  /** GET /api/grid — Himawari satellite frame manifest (public, no auth). */
  async getHimawariGrid() {
    try {
      return await nirmalaApi.get('/api/grid');
    } catch (error) {
      console.warn('[Nirmala API] /api/grid unavailable:', error.message);
      return null;
    }
  },

```
Delete this whole block (including the blank line after it).

- [ ] **Step 4: Remove `buildHimawariTicks` and `parseHimawariTime` from `src/lib/timeTravelRange.js`**

Find:
```js
/** Tick list for Himawari mode: one tick per real frame the API returned. */
export function buildHimawariTicks(frames) {
  return (frames || [])
    .map((f) => ({ date: parseHimawariTime(f.time), url: f.url }))
    .filter((f) => !Number.isNaN(f.date.getTime()))
    .sort((a, b) => a.date - b.date);
}

/** Himawari's "YYYY-MM-DDTHHmm" (no colon in the time part) -> Date (UTC). */
export function parseHimawariTime(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/.exec(raw || '');
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
}

```
Delete this whole block (including the blank line after it).

- [ ] **Step 5: Re-run the reference check**

```bash
grep -rn "getHimawariGrid\|buildHimawariTicks\|parseHimawariTime\|useHimawariGrid" src/
```
Expected: no matches at all.

- [ ] **Step 6: Confirm the app still builds**

```bash
npm run build
```
Expected: build succeeds with no errors (in particular, no "module not found" for the deleted hook, and no unused-import lint failures if the build runs lint).

- [ ] **Step 7: Re-verify the Himawari layer still works in the browser**

Repeat Task 3 Step 8's checks 1–4 (switch to Himawari mode, confirm Indonesia coverage, confirm ~144-tick dropdown, confirm caveat text) — this is a regression check that the cleanup didn't break anything.

- [ ] **Step 8: Commit**

```bash
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3"
git add -A
git commit -m "$(cat <<'EOF'
chore(himawari): remove dead bignet grid code

useHimawariGrid.js, nirmalaApi.getHimawariGrid, and the
buildHimawariTicks/parseHimawariTime helpers are unreachable now that
page.jsx uses useJmaHimawariTicks instead.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Extension: recolor + crossfade (Tasks 5-6)

Added after the original 4 tasks shipped and passed final review. The
raw JMA JPEG (grayscale sky/cloud + magenta rainfall-potential blobs, no
transparency) was being shown as-is, covering the whole 30°N-15°S/90°E-165°E
box opaquely — obscuring the app's own basemap everywhere, not just where
clouds actually are. This extension recolors each frame client-side so only
the magenta shapes render (in the app's brand cyan), everything else fully
transparent, and crossfades between frames instead of an abrupt swap.

### Task 5: Recolor helper module

**Files:**
- Create: `src/lib/jmaHimawariRecolor.js`

**Interfaces:**
- Consumes: nothing (pure functions; `recolorToTransparentPng` takes a DOM
  `HTMLImageElement` as a parameter rather than importing/loading one itself).
- Produces (used by Task 6):
  - `DEFAULT_RECOLOR_TARGET: { r: number, g: number, b: number, a: number }`
  - `isMagentaPixel(r: number, g: number, b: number): boolean`
  - `recolorToTransparentPng(image: HTMLImageElement, target?: typeof DEFAULT_RECOLOR_TARGET): string` — returns a `data:image/png;base64,...` URL. Throws if `image` wasn't loaded with `crossOrigin = 'anonymous'` (canvas taint) — Task 6's caller is responsible for that and for catching this.

- [ ] **Step 1: Write the verification script for `isMagentaPixel` (expected to fail — the module doesn't exist yet)**

`recolorToTransparentPng` needs a real `<canvas>`/`Image`, which plain Node doesn't have — only `isMagentaPixel` (pure arithmetic) is verified this way. `recolorToTransparentPng` gets verified in the browser as part of Task 6, since it's only meaningful wired into `HimawariLayer`.

Create `/tmp/verify-jma-recolor.mjs`:

```js
import { isMagentaPixel, DEFAULT_RECOLOR_TARGET } from '/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3/.claude/worktrees/jma-himawari-migration/src/lib/jmaHimawariRecolor.js';

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, expected ${e}`);
  console.log(`OK ${label}`);
}

// Sampled true-magenta cluster from a live r2w_hrp_*.jpg: R in [201,255], G in [0,53], B in [120,203].
assertEqual(isMagentaPixel(255, 0, 180), true, 'core magenta');
assertEqual(isMagentaPixel(210, 40, 130), true, 'edge-of-cluster magenta');
assertEqual(isMagentaPixel(37, 37, 37), false, 'grayscale sky/cloud (r=g=b)');
assertEqual(isMagentaPixel(0, 75, 0), false, 'JMA green border line');
assertEqual(isMagentaPixel(255, 217, 255), false, 'bright white cloud (g not low)');
assertEqual(isMagentaPixel(179, 0, 100), false, 'just below the r threshold');
assertEqual(isMagentaPixel(180, 71, 100), false, 'just above the g threshold');
assertEqual(isMagentaPixel(180, 0, 99), false, 'just below the b threshold');
assertEqual(DEFAULT_RECOLOR_TARGET, { r: 0, g: 229, b: 255, a: 217 }, 'DEFAULT_RECOLOR_TARGET is Nirmala cyan at ~0.85 alpha');

console.log('ALL PASS');
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
node /tmp/verify-jma-recolor.mjs
```
Expected: a "Cannot find module" error (the file doesn't exist yet).

- [ ] **Step 3: Create `src/lib/jmaHimawariRecolor.js`**

```js
/**
 * Recolors JMA's raw "Heavy Rainfall Potential Areas" JPEG into a
 * transparent-background PNG: only the magenta "rainfall potential" blobs
 * are kept (recolored to the app's brand cyan), everything else — plain
 * sky/cloud grayscale, JMA's own green country-border overlay lines — is
 * made fully transparent so the app's own basemap and coastlines stay
 * visible underneath.
 *
 * Thresholds were derived by sampling actual pixel values from a live
 * r2w_hrp_*.jpg (see docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md):
 * true magenta blobs cluster at R in [201,255], G in [0,53], B in [120,203];
 * plain grayscale sky/cloud has R=G=B; JMA's green border lines have low
 * R/B and mid-range G. `isMagentaPixel` uses a slightly wider margin than
 * the sampled cluster to tolerate JPEG compression noise at blob edges.
 *
 * Requires `image` to have been loaded with `crossOrigin = 'anonymous'` —
 * see this plan's Global Constraints for why that's safe to rely on with
 * JMA's server specifically.
 */

export const DEFAULT_RECOLOR_TARGET = { r: 0, g: 229, b: 255, a: 217 }; // var(--nirmala-cyan), ~0.85 alpha

export function isMagentaPixel(r, g, b) {
  return r >= 180 && g <= 70 && b >= 100;
}

/**
 * Draws `image` (an already-loaded, CORS-clean HTMLImageElement) to an
 * offscreen canvas, recolors magenta pixels to `target`, makes everything
 * else transparent, and returns a `data:image/png` URL. Synchronous once
 * the image is decoded — no network calls. Throws (SecurityError) if
 * `image` wasn't loaded with `crossOrigin = 'anonymous'`.
 */
export function recolorToTransparentPng(image, target = DEFAULT_RECOLOR_TARGET) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (isMagentaPixel(data[i], data[i + 1], data[i + 2])) {
      data[i] = target.r;
      data[i + 1] = target.g;
      data[i + 2] = target.b;
      data[i + 3] = target.a;
    } else {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 4: Run the verification script again, confirm it passes**

```bash
node /tmp/verify-jma-recolor.mjs
```
Expected: 9 `OK ...` lines followed by `ALL PASS`.

- [ ] **Step 5: Delete the scratch file and commit**

```bash
rm /tmp/verify-jma-recolor.mjs
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3/.claude/worktrees/jma-himawari-migration"
git add src/lib/jmaHimawariRecolor.js
git commit -m "$(cat <<'EOF'
feat(himawari): add magenta-recolor-to-transparent-PNG helper

Pure canvas-processing function: given a loaded JMA frame image, keeps
only the magenta rainfall-potential pixels (recolored to Nirmala's
brand cyan) and makes everything else transparent, so the frame can be
overlaid without hiding the basemap under grayscale sky/cloud.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire recolor + crossfade into `HimawariLayer`

**Files:**
- Modify: `src/components/map/HimawariLayer.jsx` (full file shown below — this replaces the version Tasks 2-4 left in place, including their fixes from the final review's fix round)

**Interfaces:**
- Consumes: `recolorToTransparentPng` from `@/lib/jmaHimawariRecolor` (Task 5).
- Produces: no prop/interface changes — `active`, `candidateUrls`, `bounds`, `opacity`, `onStatus` keep the exact same meaning as before. `page.jsx` needs no changes for this task.

This task, like Task 2, can only be meaningfully exercised inside a live Google Map — there is no test runner. Verification is the Step 2 browser checklist below.

- [ ] **Step 1: Replace the full contents of `src/components/map/HimawariLayer.jsx`**

Current file (for reference — this is what you're replacing; if what's actually on disk differs from this in more than trivial whitespace, STOP and report NEEDS_CONTEXT rather than guessing which version is authoritative):

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Himawari (JMA) satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile
 * pyramid), JMA returns ONE static JPEG per timestamp covering a fixed
 * lat/lng box — so this uses google.maps.GroundOverlay, not ImageMapType.
 *
 * JMA has no manifest telling us which timestamps actually have a published
 * image (unlike the old bignet API), and the newest frame is sometimes not
 * published yet when we ask for it. `candidateUrls` lets the caller supply a
 * fallback chain (newest first) — this preloads each with a plain Image()
 * (not GroundOverlay directly) so a 404 can be caught and the next
 * candidate tried, instead of silently showing a blank overlay.
 */
export default function HimawariLayer({ active, candidateUrls = [], bounds, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  // Stabilize on URL content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying URLs haven't
  // changed (the 10-minute bucket didn't roll), and depending on
  // `candidateUrls` by reference would tear down and rebuild the overlay
  // every minute for no reason.
  const urlKey = candidateUrls.join('|');

  useEffect(() => {
    if (!map || !window.google || !active || !candidateUrls.length || !bounds) {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    let currentImg = null;
    onStatus?.('loading');

    const tryCandidate = (i) => {
      if (i >= candidateUrls.length) {
        if (cancelled) return;
        overlayRef.current?.setMap(null);
        overlayRef.current = null;
        onStatus?.('unavailable');
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate frames failed to load:', candidateUrls);
        }
        return;
      }

      const img = new Image();
      currentImg = img;
      img.onload = () => {
        if (cancelled) return;
        const gmBounds = new window.google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        overlayRef.current?.setMap(null);
        const overlay = new window.google.maps.GroundOverlay(candidateUrls[i], gmBounds, { opacity });
        overlay.setMap(map);
        overlayRef.current = overlay;
        onStatus?.('ok');
      };
      img.onerror = () => { if (!cancelled) tryCandidate(i + 1); };
      img.src = candidateUrls[i];
    };
    tryCandidate(0);

    return () => {
      cancelled = true;
      if (currentImg) currentImg.src = ''; // abort any in-flight preload
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, urlKey, bounds, opacity, onStatus]);

  return null;
}
```

New file:

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { recolorToTransparentPng } from '@/lib/jmaHimawariRecolor';

const CROSSFADE_MS = 400;

/**
 * Himawari (JMA) satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile
 * pyramid), JMA returns ONE static JPEG per timestamp covering a fixed
 * lat/lng box — so this uses google.maps.GroundOverlay, not ImageMapType.
 *
 * JMA has no manifest telling us which timestamps actually have a published
 * image (unlike the old bignet API), and the newest frame is sometimes not
 * published yet when we ask for it. `candidateUrls` lets the caller supply a
 * fallback chain (newest first) — this preloads each with a plain Image()
 * (not GroundOverlay directly) so a load failure can be caught and the next
 * candidate tried, instead of silently showing a blank overlay.
 *
 * Each successfully-loaded frame is recolored client-side (see
 * jmaHimawariRecolor.js) so only the magenta "rainfall potential" shapes
 * show, transparent everywhere else — the app's own basemap stays visible.
 * Recoloring needs pixel-level canvas access, which requires the image to
 * be loaded with crossOrigin='anonymous' (JMA's server supports this — see
 * this plan's Global Constraints).
 *
 * Frame changes crossfade over CROSSFADE_MS instead of an abrupt swap:
 * GroundOverlay.setOpacity() is animated on both the incoming and outgoing
 * overlay simultaneously via requestAnimationFrame, then the outgoing one
 * is removed.
 */
export default function HimawariLayer({ active, candidateUrls = [], bounds, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  // Stabilize on URL content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying URLs haven't
  // changed (the 10-minute bucket didn't roll), and depending on
  // `candidateUrls` by reference would tear down and rebuild the overlay
  // every minute for no reason.
  const urlKey = candidateUrls.join('|');

  useEffect(() => {
    if (!map || !window.google || !active || !candidateUrls.length || !bounds) {
      cancelAnimationFrame(fadeRafRef.current);
      overlayRef.current?.setMap(null);
      prevOverlayRef.current?.setMap(null);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    let currentImg = null;
    onStatus?.('loading');

    const crossfadeIn = (dataUrl, gmBounds) => {
      const outgoing = overlayRef.current;
      const incoming = new window.google.maps.GroundOverlay(dataUrl, gmBounds, { opacity: 0 });
      incoming.setMap(map);
      prevOverlayRef.current = outgoing;
      overlayRef.current = incoming;

      cancelAnimationFrame(fadeRafRef.current);
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / CROSSFADE_MS);
        incoming.setOpacity(t * opacity);
        outgoing?.setOpacity((1 - t) * opacity);
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          outgoing?.setMap(null);
          if (prevOverlayRef.current === outgoing) prevOverlayRef.current = null;
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    };

    const tryCandidate = (i) => {
      if (i >= candidateUrls.length) {
        if (cancelled) return;
        cancelAnimationFrame(fadeRafRef.current);
        overlayRef.current?.setMap(null);
        prevOverlayRef.current?.setMap(null);
        overlayRef.current = null;
        prevOverlayRef.current = null;
        onStatus?.('unavailable');
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate frames failed to load:', candidateUrls);
        }
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      currentImg = img;
      img.onload = () => {
        if (cancelled) return;
        let dataUrl;
        try {
          dataUrl = recolorToTransparentPng(img);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[HimawariLayer] recolor failed, trying next candidate:', err);
          }
          tryCandidate(i + 1);
          return;
        }
        if (cancelled) return;
        const gmBounds = new window.google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        crossfadeIn(dataUrl, gmBounds);
        onStatus?.('ok');
      };
      img.onerror = () => { if (!cancelled) tryCandidate(i + 1); };
      img.src = candidateUrls[i];
    };
    tryCandidate(0);

    return () => {
      cancelled = true;
      if (currentImg) currentImg.src = ''; // abort any in-flight preload
      cancelAnimationFrame(fadeRafRef.current);
      overlayRef.current?.setMap(null);
      prevOverlayRef.current?.setMap(null);
      overlayRef.current = null;
      prevOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, urlKey, bounds, opacity, onStatus]);

  return null;
}
```

- [ ] **Step 2: Verify in the browser**

The Browser pane should already have a tab open and logged into the running dev server (check with `mcp__Claude_Browser__tabs_context` — do not attempt any login yourself; if no tab is logged in, report NEEDS_CONTEXT and ask for one).

1. Switch to Himawari mode. Confirm the overlay now shows ONLY colored (cyan) blob shapes over the map — the plain grayscale sky/cloud background and JMA's green border lines should be gone, with the app's own basemap/coastlines fully visible everywhere else.
2. Zoom in on a cyan blob and confirm its edges look reasonably clean (not a solid rectangle, not obviously inverted — i.e. the transparent/opaque regions are the right way around).
3. Use the "Lompat ke waktu..." dropdown to scrub between two adjacent ticks (10 minutes apart) and confirm the shape crossfades smoothly over roughly 400ms rather than popping instantly — this can be checked by taking two screenshots ~150-200ms apart during the transition and confirming the older shape is still partially visible (not a hard cut).
4. Confirm the "Reset tampilan"/zoom/pan controls and other layers (sensor dots, legend, caveat text) still work normally with Himawari active — this task should not have regressed anything from Tasks 1-4.
5. Open the console and confirm no new errors appear (a `SecurityError` here would mean the `crossOrigin` fix isn't working — treat that as a real failure, not noise, and investigate rather than reporting DONE).
6. Trigger the "unavailable" path once (same technique as Task 3's Step 8 item 9 — read that task's report for the method) and confirm it still shows the "Citra tidak tersedia untuk waktu ini" message correctly with recoloring now in the mix.

- [ ] **Step 3: Commit**

```bash
cd "/Users/ekabayuperwita/Documents/Kerjaan/Nirmala 3/.claude/worktrees/jma-himawari-migration"
git add src/components/map/HimawariLayer.jsx
git commit -m "$(cat <<'EOF'
feat(himawari): recolor frames to transparent PNG, crossfade transitions

Only the magenta rainfall-potential shapes render now (recolored to
Nirmala's brand cyan) — plain grayscale sky/cloud and JMA's own
country-border overlay lines are made transparent, so the app's own
basemap stays visible everywhere except where clouds actually are.
Frame changes crossfade over 400ms instead of popping instantly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
