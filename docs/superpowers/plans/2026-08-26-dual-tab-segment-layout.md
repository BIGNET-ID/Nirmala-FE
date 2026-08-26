# Dual-Tab & Sky/Ground Segment Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relayout the Nirmala dashboard to expose PRD v2.0's Dual-Tab (Current/Timeline) navigation and Sky/Ground Segment vendor grouping, plus a Provincial Boundary Filter — as new UI components layered on top of the existing map/data logic, with zero changes to hooks, API calls, or already-working layer behavior.

**Architecture:** Five additive/replacing UI components (`TabSwitcher`, `ProvinceFilterSelect`, `TimelineComingSoon`, `SegmentTogglePanel`, plus a small province data/filter helper module) are wired into the existing `(dashboard)/page.jsx` and `DashboardHeader.jsx`. `MetricLayerSelector.jsx` is retired once its controls are reproduced (regrouped by vendor) inside `SegmentTogglePanel.jsx`. All existing hooks (`usePlatformData`, `useSensorStream`, `useJmaHimawariTicks`, etc.) and their props/handlers in `page.jsx` are reused unchanged — only their presentation moves.

**Tech Stack:** Next.js App Router, React, MUI v5, `@iconify/react`, `@vis.gl/react-google-maps` (already in use). Tests use the project's existing `node --test` + `node:assert/strict` setup (see `src/lib/jmaHimawari.test.js`) — no new test framework or dependency.

**Spec:** [docs/superpowers/specs/2026-08-26-dual-tab-segment-layout-design.md](../specs/2026-08-26-dual-tab-segment-layout-design.md)

## Global Constraints

- No changes to `src/hooks/*`, `src/app/api/*`, or `src/lib/nirmalaApi.js` — data/API layer is untouched (spec §1).
- No new npm dependencies — build everything from MUI/Iconify/React already installed.
- No new color tokens — reuse existing CSS vars (`--nirmala-glass-bg`, `--nirmala-cyan`, `--nirmala-glass-border`, `--font-family-mono`, etc. from `src/app/globals.css` / `src/lib/theme.js`).
- All new component/vendor labels use the default body font (`Google Sans Flex`, already MUI's typography default) — `--font-family-mono` is reserved for numeric/status values only, matching existing usage in `DashboardHeader.jsx`/`MapInfoPill.jsx`.
- Provincial filtering is a client-side bounding-box approximation (`src/constants/provinces.js` + `src/lib/provinceFilter.js`) because `/api/sensors` carries no `province_code` yet (spec §2) — this is intentional, not a bug to fix in this plan.
- Every task commits locally only (`git commit`). Never run `git push` — that stays a manual, user-driven action.

---

### Task 1: Province data & bounding-box filter helpers

**Files:**
- Create: `src/constants/provinces.js`
- Create: `src/constants/provinces.test.js`
- Create: `src/lib/provinceFilter.js`
- Create: `src/lib/provinceFilter.test.js`

**Interfaces:**
- Produces: `PROVINCES` — array of `{ code: string, name: string, bounds: { north: number, south: number, west: number, east: number } }`, one entry per Indonesian province (BPS/Kemendagri 2-digit codes, matching the `province_code` shape in PRD §7.2's sample payload, e.g. `"31"` = DKI Jakarta).
- Produces: `isPointInBounds(lat, lng, bounds) -> boolean`.
- Produces: `filterStationsInBounds(stations, bounds) -> array` — `stations` items must have `.lat`/`.lng` (matches `normalizeSensor`'s output shape in `src/lib/nirmalaApi.js`).
- Produces: `summarizeStations(stations) -> { total: number, active: number, raining: number }` — `stations` items must have `.status` and `.isRaining` (same shape).

- [ ] **Step 1: Write the failing test for `PROVINCES`**

Create `src/constants/provinces.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES } from './provinces.js';

test('PROVINCES has 38 entries (BPS 2023 province count)', () => {
  assert.equal(PROVINCES.length, 38);
});

test('PROVINCES codes are unique', () => {
  const codes = PROVINCES.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('every province has a valid bounding box (north > south, east > west)', () => {
  for (const p of PROVINCES) {
    assert.ok(p.bounds.north > p.bounds.south, `${p.name}: north <= south`);
    assert.ok(p.bounds.east > p.bounds.west, `${p.name}: east <= west`);
  }
});

test('DKI Jakarta uses BPS code 31 (matches PRD §7.2 sample payload)', () => {
  const jakarta = PROVINCES.find((p) => p.name === 'DKI Jakarta');
  assert.equal(jakarta?.code, '31');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/constants/provinces.test.js`
Expected: FAIL — `Cannot find module './provinces.js'`

- [ ] **Step 3: Create `src/constants/provinces.js`**

```js
/**
 * Indonesian provinces (BPS/Kemendagri 2-digit codes) with an approximate
 * bounding box for client-side pan/zoom (PRD §4.3 Auto Bounding-Box Zoom).
 *
 * These boxes are NOT precise administrative polygons — they're generous
 * rectangles good enough for map fitBounds() and rough sensor-count
 * filtering (see src/lib/provinceFilter.js). Swap to real polygons / the
 * backend's own `province_code` once it's available on /api/sensors.
 */
export const PROVINCES = [
  { code: '11', name: 'Aceh', bounds: { north: 6.05, south: 1.85, west: 94.85, east: 98.30 } },
  { code: '12', name: 'Sumatera Utara', bounds: { north: 4.25, south: -0.60, west: 96.50, east: 100.00 } },
  { code: '13', name: 'Sumatera Barat', bounds: { north: 0.55, south: -3.35, west: 98.50, east: 101.90 } },
  { code: '14', name: 'Riau', bounds: { north: 2.60, south: -1.30, west: 100.00, east: 104.40 } },
  { code: '15', name: 'Jambi', bounds: { north: -0.45, south: -2.85, west: 101.00, east: 104.90 } },
  { code: '16', name: 'Sumatera Selatan', bounds: { north: -1.10, south: -5.00, west: 102.00, east: 106.40 } },
  { code: '17', name: 'Bengkulu', bounds: { north: -2.00, south: -5.35, west: 101.00, east: 103.90 } },
  { code: '18', name: 'Lampung', bounds: { north: -3.40, south: -6.00, west: 103.40, east: 106.10 } },
  { code: '19', name: 'Kepulauan Bangka Belitung', bounds: { north: -1.15, south: -3.60, west: 105.00, east: 108.90 } },
  { code: '21', name: 'Kepulauan Riau', bounds: { north: 4.90, south: -1.20, west: 103.00, east: 109.60 } },
  { code: '31', name: 'DKI Jakarta', bounds: { north: -5.10, south: -6.35, west: 106.65, east: 106.97 } },
  { code: '32', name: 'Jawa Barat', bounds: { north: -5.85, south: -7.85, west: 106.35, east: 108.90 } },
  { code: '33', name: 'Jawa Tengah', bounds: { north: -5.75, south: -8.30, west: 108.50, east: 111.50 } },
  { code: '34', name: 'DI Yogyakarta', bounds: { north: -7.60, south: -8.25, west: 110.00, east: 110.85 } },
  { code: '35', name: 'Jawa Timur', bounds: { north: -6.45, south: -8.80, west: 111.00, east: 116.50 } },
  { code: '36', name: 'Banten', bounds: { north: -5.70, south: -7.05, west: 105.10, east: 106.65 } },
  { code: '51', name: 'Bali', bounds: { north: -8.05, south: -8.90, west: 114.40, east: 115.75 } },
  { code: '52', name: 'Nusa Tenggara Barat', bounds: { north: -8.10, south: -9.10, west: 115.80, east: 119.40 } },
  { code: '53', name: 'Nusa Tenggara Timur', bounds: { north: -8.10, south: -11.10, west: 118.80, east: 125.50 } },
  { code: '61', name: 'Kalimantan Barat', bounds: { north: 2.10, south: -3.10, west: 108.00, east: 114.20 } },
  { code: '62', name: 'Kalimantan Tengah', bounds: { north: 0.90, south: -3.60, west: 110.60, east: 115.90 } },
  { code: '63', name: 'Kalimantan Selatan', bounds: { north: -1.00, south: -4.20, west: 114.20, east: 116.60 } },
  { code: '64', name: 'Kalimantan Timur', bounds: { north: 3.30, south: -2.70, west: 113.90, east: 119.10 } },
  { code: '65', name: 'Kalimantan Utara', bounds: { north: 4.30, south: 1.90, west: 114.50, east: 118.20 } },
  { code: '71', name: 'Sulawesi Utara', bounds: { north: 5.50, south: -0.90, west: 121.00, east: 127.00 } },
  { code: '72', name: 'Sulawesi Tengah', bounds: { north: 2.00, south: -3.50, west: 119.20, east: 124.20 } },
  { code: '73', name: 'Sulawesi Selatan', bounds: { north: -0.90, south: -8.40, west: 118.70, east: 121.60 } },
  { code: '74', name: 'Sulawesi Tenggara', bounds: { north: -2.80, south: -6.20, west: 120.50, east: 124.60 } },
  { code: '75', name: 'Gorontalo', bounds: { north: 1.10, south: -0.40, west: 121.30, east: 123.60 } },
  { code: '76', name: 'Sulawesi Barat', bounds: { north: 0.40, south: -3.50, west: 118.50, east: 119.90 } },
  { code: '81', name: 'Maluku', bounds: { north: -2.00, south: -8.60, west: 125.90, east: 135.00 } },
  { code: '82', name: 'Maluku Utara', bounds: { north: 3.40, south: -1.00, west: 124.00, east: 129.80 } },
  { code: '91', name: 'Papua', bounds: { north: -3.00, south: -9.50, west: 137.00, east: 141.05 } },
  { code: '92', name: 'Papua Barat', bounds: { north: -1.00, south: -4.00, west: 130.80, east: 135.50 } },
  { code: '93', name: 'Papua Selatan', bounds: { north: -5.00, south: -9.50, west: 137.00, east: 141.05 } },
  { code: '94', name: 'Papua Tengah', bounds: { north: -3.00, south: -5.00, west: 133.50, east: 138.50 } },
  { code: '95', name: 'Papua Pegunungan', bounds: { north: -3.00, south: -5.50, west: 137.00, east: 141.00 } },
  { code: '96', name: 'Papua Barat Daya', bounds: { north: -0.20, south: -4.00, west: 130.00, east: 133.70 } },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/constants/provinces.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for the filter helpers**

Create `src/lib/provinceFilter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPointInBounds, filterStationsInBounds, summarizeStations } from './provinceFilter.js';

const JAKARTA_BOUNDS = { north: -5.10, south: -6.35, west: 106.65, east: 106.97 };

test('isPointInBounds: point inside returns true', () => {
  assert.equal(isPointInBounds(-6.1552, 106.8456, JAKARTA_BOUNDS), true); // Kemayoran
});

test('isPointInBounds: point outside returns false', () => {
  assert.equal(isPointInBounds(-7.25, 112.75, JAKARTA_BOUNDS), false); // Surabaya
});

test('isPointInBounds: point exactly on the boundary is inclusive', () => {
  assert.equal(isPointInBounds(JAKARTA_BOUNDS.north, JAKARTA_BOUNDS.west, JAKARTA_BOUNDS), true);
});

test('filterStationsInBounds: keeps only stations inside the box', () => {
  const stations = [
    { id: 'a', lat: -6.1552, lng: 106.8456 }, // inside
    { id: 'b', lat: -7.25, lng: 112.75 }, // outside
  ];
  const result = filterStationsInBounds(stations, JAKARTA_BOUNDS);
  assert.deepEqual(result.map((s) => s.id), ['a']);
});

test('summarizeStations: counts total/active/raining correctly', () => {
  const stations = [
    { status: 'active', isRaining: true },
    { status: 'active', isRaining: false },
    { status: 'blacklisted', isRaining: false },
  ];
  assert.deepEqual(summarizeStations(stations), { total: 3, active: 2, raining: 1 });
});

test('summarizeStations: empty array yields all zeros', () => {
  assert.deepEqual(summarizeStations([]), { total: 0, active: 0, raining: 0 });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test src/lib/provinceFilter.test.js`
Expected: FAIL — `Cannot find module './provinceFilter.js'`

- [ ] **Step 7: Create `src/lib/provinceFilter.js`**

```js
/**
 * Client-side province filtering (PRD §4.3). /api/sensors carries no
 * province_code today — this is a bounding-box approximation, not the real
 * thing. Swap to the backend's own province_code once it exists; the shape
 * of `summarizeStations`'s return value is what ProvinceFilterSelect
 * expects, so that swap only touches where the filtered list comes from.
 */
export function isPointInBounds(lat, lng, bounds) {
  return lat <= bounds.north && lat >= bounds.south && lng >= bounds.west && lng <= bounds.east;
}

export function filterStationsInBounds(stations, bounds) {
  return stations.filter((s) => isPointInBounds(s.lat, s.lng, bounds));
}

export function summarizeStations(stations) {
  return {
    total: stations.length,
    active: stations.filter((s) => s.status === 'active').length,
    raining: stations.filter((s) => s.isRaining).length,
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test src/lib/provinceFilter.test.js`
Expected: PASS (6 tests)

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: All tests pass (existing `jmaHimawari.test.js` tests + the 10 new ones above).

- [ ] **Step 10: Commit**

```bash
git add src/constants/provinces.js src/constants/provinces.test.js src/lib/provinceFilter.js src/lib/provinceFilter.test.js
git commit -m "feat: add province bbox data and client-side sensor filter helpers"
```

---

### Task 2: TabSwitcher (Dual-Tab navigation)

**Files:**
- Create: `src/components/dashboard/TabSwitcher.jsx`
- Modify: `src/components/dashboard/DashboardHeader.jsx`
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TabSwitcher({ activeTab: 'current' | 'timeline', onChange: (tab) => void })` — presentational, no internal state.
- Produces (in `page.jsx`): `activeTab` state (`'current' | 'timeline'`) and `setActiveTab` — later tasks (3, 4) read this to conditionally render `ProvinceFilterSelect` and swap the map for `TimelineComingSoon`.

- [ ] **Step 1: Create `src/components/dashboard/TabSwitcher.jsx`**

```jsx
'use client';

import { Box, Button } from '@mui/material';
import { Icon } from '@iconify/react';

const TABS = [
  { key: 'current', label: 'Current', icon: 'material-symbols:radar-rounded' },
  { key: 'timeline', label: 'Timeline', icon: 'material-symbols:schedule-rounded' },
];

/**
 * Dual-Tab navigation (PRD §4.1) — switches the dashboard between the
 * static live snapshot (Current) and the 24-hour playback roadmap
 * placeholder (Timeline). Presentational only; page.jsx owns the state.
 */
export default function TabSwitcher({ activeTab, onChange }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.25,
        p: 0.25,
        borderRadius: 'var(--radius-full, 9999px)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--nirmala-glass-border)',
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            disableRipple
            startIcon={<Icon icon={tab.icon} width={15} />}
            sx={{
              px: 1.5,
              height: 32,
              gap: 0.75,
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              color: active ? '#04141a' : 'var(--color-text-muted)',
              background: active ? 'var(--nirmala-cyan)' : 'transparent',
              transition: 'color var(--duration-fast,150ms) var(--ease-standard), background var(--duration-fast,150ms) var(--ease-standard)',
              '&:hover': { background: active ? 'var(--nirmala-cyan)' : 'rgba(255,255,255,0.06)' },
            }}
          >
            {tab.label}
          </Button>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Wire `TabSwitcher` into `DashboardHeader.jsx`**

In `src/components/dashboard/DashboardHeader.jsx`:

Add the import (after the existing `useThemeMode` import on line 9):

```js
import TabSwitcher from '@/components/dashboard/TabSwitcher';
```

Change the function signature (line 23) from:

```js
export default function DashboardHeader({ stats, health, streamStatus }) {
```

to:

```js
export default function DashboardHeader({ stats, health, streamStatus, activeTab, onTabChange }) {
```

Insert a divider + `TabSwitcher` right after the closing `</Box>` of the "Nav tabs" block (the block that renders `NAV.map(...)`, ending right before the `{/* Right group ... */}` comment). The file currently reads:

```jsx
      {/* Nav tabs */}
      <Box sx={{ display: 'flex', gap: 0.25, minWidth: 0 }}>
        {NAV.map((item) => {
          /* ... unchanged ... */
        })}
      </Box>

      {/* Right group — pinned right, never shrinks */}
```

Change it to:

```jsx
      {/* Nav tabs */}
      <Box sx={{ display: 'flex', gap: 0.25, minWidth: 0 }}>
        {NAV.map((item) => {
          /* ... unchanged ... */
        })}
      </Box>

      <Box sx={{ width: '1px', height: 20, background: 'var(--nirmala-glass-border)', flexShrink: 0 }} />

      <TabSwitcher activeTab={activeTab} onChange={onTabChange} />

      {/* Right group — pinned right, never shrinks */}
```

(Only the two new lines — the divider `Box` and `<TabSwitcher ... />` — are inserted; nothing inside the `NAV.map` block changes.)

- [ ] **Step 3: Add `activeTab` state to `page.jsx` and pass it down**

In `src/app/(dashboard)/page.jsx`, add the import (grouped with the other dashboard component imports, e.g. right after the `TimeTravelBar` import on line 22):

```js
import TabSwitcher from '@/components/dashboard/TabSwitcher'; // eslint-disable-line no-unused-vars -- imported for clarity; DashboardHeader renders it
```

Actually `TabSwitcher` is only rendered inside `DashboardHeader`, not directly in `page.jsx` — skip that import. Instead, add the state (grouped with the other `useState` calls, e.g. right after the `map` state on line 64):

```js
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'timeline' — PRD §4.1 Dual-Tab
```

Then change the `<DashboardHeader ... />` call (line 189) from:

```jsx
        <DashboardHeader stats={stats} health={health} streamStatus={sensorStreamStatus} />
```

to:

```jsx
        <DashboardHeader
          stats={stats}
          health={health}
          streamStatus={sensorStreamStatus}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
```

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`

Open the dashboard, and in the header confirm:
- A pill-shaped "Current"/"Timeline" switcher appears next to the existing "Peta Radar"/"Pengaturan" nav.
- "Current" starts highlighted (cyan background).
- Clicking "Timeline" highlights it instead and un-highlights "Current" — the map underneath is unaffected for now (that wiring is Task 4).
- Clicking back to "Current" re-highlights it.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TabSwitcher.jsx src/components/dashboard/DashboardHeader.jsx "src/app/(dashboard)/page.jsx"
git commit -m "feat: add Dual-Tab TabSwitcher (Current/Timeline) to dashboard header"
```

---

### Task 3: ProvinceFilterSelect

**Files:**
- Create: `src/components/dashboard/ProvinceFilterSelect.jsx`
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `PROVINCES` from `src/constants/provinces.js` (Task 1), `filterStationsInBounds`/`summarizeStations` from `src/lib/provinceFilter.js` (Task 1), `activeTab` state from `page.jsx` (Task 2).
- Produces: `ProvinceFilterSelect({ selectedCode: string | null, onSelectCode: (code: string | null) => void, matched: { total: number, active: number, raining: number } | null })` — presentational.
- Produces (in `page.jsx`): `selectedProvinceCode` state and `handleProvinceSelect(code)` handler, which later tasks do not depend on.

- [ ] **Step 1: Create `src/components/dashboard/ProvinceFilterSelect.jsx`**

```jsx
'use client';

import { Box, Select, MenuItem, IconButton, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { PROVINCES } from '@/constants/provinces';

const monoSx = { fontFamily: 'var(--font-family-mono)' };

/**
 * Provincial Boundary Filter (PRD §4.3). Selecting a province pans/zooms the
 * map to its bounding box (handled by the parent's onSelectCode) and shows
 * an approximate sensor count for that box — see provinceFilter.js for why
 * "approximate" (no real province_code from the backend yet).
 */
export default function ProvinceFilterSelect({ selectedCode, onSelectCode, matched }) {
  const selected = PROVINCES.find((p) => p.code === selectedCode) || null;

  return (
    <Box
      sx={{
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        background: 'var(--nirmala-glass-bg-header)',
        borderBottom: '1px solid var(--nirmala-glass-border)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <Icon icon="material-symbols:location-on-rounded" width={16} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />

      <Select
        value={selectedCode || ''}
        onChange={(e) => onSelectCode(e.target.value || null)}
        displayEmpty
        variant="standard"
        disableUnderline
        size="small"
        sx={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 180, color: 'text.primary' }}
      >
        <MenuItem value="">Semua Provinsi</MenuItem>
        {PROVINCES.map((p) => (
          <MenuItem key={p.code} value={p.code}>{p.name}</MenuItem>
        ))}
      </Select>

      {selected && (
        <Tooltip title="Reset ke tampilan nasional" placement="bottom">
          <IconButton size="small" onClick={() => onSelectCode(null)} sx={{ color: 'text.secondary' }}>
            <Icon icon="material-symbols:close-rounded" width={16} />
          </IconButton>
        </Tooltip>
      )}

      {selected && matched && (
        <Typography variant="caption" sx={{ ml: 'auto', color: 'text.secondary', fontSize: '0.72rem' }}>
          {matched.total === 0 ? (
            'Belum ada data sensor terdeteksi di wilayah ini'
          ) : (
            <>
              <Box component="span" sx={{ ...monoSx, color: 'var(--nirmala-cyan)' }}>{matched.total}</Box>
              {' '}sensor di {selected.name}
              {' · '}
              <Box component="span" sx={monoSx}>{matched.raining}</Box> melapor hujan
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Wire `ProvinceFilterSelect` into `page.jsx`**

Add imports (grouped with the other dashboard component imports):

```js
import ProvinceFilterSelect from '@/components/dashboard/ProvinceFilterSelect';
import { PROVINCES } from '@/constants/provinces';
import { filterStationsInBounds, summarizeStations } from '@/lib/provinceFilter';
```

Add state (grouped with `activeTab` from Task 2):

```js
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(null);
```

Add the handler and the derived summary, placed right after `handleReset` (which `handleProvinceSelect` calls when the user clears the filter):

```js
  const handleProvinceSelect = (code) => {
    setSelectedProvinceCode(code);
    if (!code) {
      handleReset();
      return;
    }
    const province = PROVINCES.find((p) => p.code === code);
    if (!province || !map) return;
    map.fitBounds(new window.google.maps.LatLngBounds(
      { lat: province.bounds.south, lng: province.bounds.west },
      { lat: province.bounds.north, lng: province.bounds.east },
    ));
  };

  const matchedProvinceStations = useMemo(() => {
    if (!selectedProvinceCode) return null;
    const province = PROVINCES.find((p) => p.code === selectedProvinceCode);
    if (!province) return null;
    return summarizeStations(filterStationsInBounds(SENSOR_STATIONS, province.bounds));
  }, [selectedProvinceCode, SENSOR_STATIONS]);
```

Render it as a new flex sibling between `<DashboardHeader ... />` and the map container `Box`. The relevant part of the return statement currently reads:

```jsx
        <DashboardHeader
          stats={stats}
          health={health}
          streamStatus={sensorStreamStatus}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
```

Change it to:

```jsx
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
```

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`

- Confirm a thin bar with "Semua Provinsi" appears under the header.
- Select "DKI Jakarta" — the map should pan/zoom to the Jakarta area, a close (×) button appears, and the summary text shows a sensor count ("N sensor di DKI Jakarta · M melapor hujan") or the "Belum ada data..." message if the bbox catches zero sensors.
- Click the close (×) button — the map resets to the national view (`MAP_CENTER`/`MAP_ZOOM_DEFAULT`) and the dropdown returns to "Semua Provinsi".
- Switch to the "Timeline" tab — the filter bar disappears; switch back to "Current" — it reappears with the same selection still intact (state was never unmounted).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ProvinceFilterSelect.jsx "src/app/(dashboard)/page.jsx"
git commit -m "feat: add Provincial Boundary Filter with auto bounding-box zoom"
```

---

### Task 4: TimelineComingSoon (Tab Timeline placeholder)

**Files:**
- Create: `src/components/dashboard/TimelineComingSoon.jsx`
- Modify: `src/app/(dashboard)/page.jsx`

**Interfaces:**
- Consumes: `activeTab` state from `page.jsx` (Task 2).
- Produces: `TimelineComingSoon()` — presentational, no props.

- [ ] **Step 1: Create `src/components/dashboard/TimelineComingSoon.jsx`**

```jsx
import { Box, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const ROADMAP_ITEMS = [
  { icon: 'material-symbols:play-circle-rounded', text: '24-Hour Interactive Slider dengan Play/Pause dan speed multiplier (1x, 2x, 4x)' },
  { icon: 'material-symbols:satellite-alt-rounded', text: 'Himawari 10-Minute Tick Sync — 144 frame per 24 jam (24 jam × 6 tick/jam)' },
  { icon: 'material-symbols:sync-alt-rounded', text: 'Temporal Layer Alignment — radar darat & sensor mengikuti posisi scrubber waktu' },
];

/**
 * Tab Timeline placeholder (PRD §4.6, Phase 2 roadmap). No playback engine
 * yet — the backend has no national historical snapshot endpoint (only
 * per-sensor /api/timeseries, see TimelinePlayer.jsx's own note). Kept as a
 * styled placeholder so PRD §4.1's Dual-Tab structure is visible now.
 */
export default function TimelineComingSoon() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          p: 4,
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
          background: 'var(--nirmala-glass-bg)',
          border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-lg, 12px)',
        }}
      >
        <Icon icon="material-symbols:schedule-rounded" width={40} style={{ color: 'var(--nirmala-cyan)' }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1.5 }}>
          Fase 2 — Playback 24 Jam
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 2.5 }}>
          Tab Timeline sedang dalam roadmap pengembangan. Berikut yang akan dibangun:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, textAlign: 'left' }}>
          {ROADMAP_ITEMS.map((item) => (
            <Box key={item.text} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Icon icon={item.icon} width={18} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
                {item.text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Wire it into `page.jsx`, keeping the map mounted (hidden, not unmounted)**

Add the import (grouped with the other dashboard component imports):

```js
import TimelineComingSoon from '@/components/dashboard/TimelineComingSoon';
```

The current map container starts like this and runs all the way through the `SensorDetailDrawer` before its closing `</Box>`:

```jsx
        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GoogleMapWrapper onMapLoad={setMap}>
            {/* ... layers ... */}
          </GoogleMapWrapper>

          {/* ... all absolute overlays: attribution gradient, MetricLayerSelector/
              SegmentTogglePanel, ColorRampLegend, MapInfoPill, Himawari notice,
              SensorStatsCard, TimeTravelBar, MapControls ... */}

          {/* Detail drawer */}
          <SensorDetailDrawer
            station={selectedStation}
            open={Boolean(selectedStation)}
            onClose={() => setSelectedStation(null)}
          />
        </Box>
```

Wrap everything currently inside that `Box` in one more `Box` that's hidden (not unmounted) when the Timeline tab is active, and add `TimelineComingSoon` as a sibling that only renders for the Timeline tab:

```jsx
        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: activeTab === 'current' ? 'block' : 'none' }}>
            <GoogleMapWrapper onMapLoad={setMap}>
              {/* ... layers, unchanged ... */}
            </GoogleMapWrapper>

            {/* ... all absolute overlays, unchanged ... */}

            {/* Detail drawer */}
            <SensorDetailDrawer
              station={selectedStation}
              open={Boolean(selectedStation)}
              onClose={() => setSelectedStation(null)}
            />
          </Box>

          {activeTab === 'timeline' && <TimelineComingSoon />}
        </Box>
```

Only the wrapping `Box` and the trailing `{activeTab === 'timeline' && <TimelineComingSoon />}` are new — every layer/overlay/component already inside the map container moves in as-is, unmodified.

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`

- On "Current", the map and all panels behave exactly as before.
- Click "Timeline" — the map and its panels disappear (hidden via `display:none`, not unmounted) and the "Fase 2 — Playback 24 Jam" placeholder fills the space.
- Click back to "Current" — the map reappears instantly with the same pan/zoom/layer state as before switching (confirms it was hidden, not remounted — no flicker of the default center/zoom).
- Open the browser's Network tab while toggling tabs a few times — confirm no new `/api/*` requests fire on tab switches.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/TimelineComingSoon.jsx "src/app/(dashboard)/page.jsx"
git commit -m "feat: add Tab Timeline roadmap placeholder, keep map mounted on tab switch"
```

---

### Task 5: SegmentTogglePanel (Sky/Ground vendor grouping, retire MetricLayerSelector)

**Files:**
- Create: `src/components/dashboard/SegmentTogglePanel.jsx`
- Modify: `src/app/(dashboard)/page.jsx`
- Delete: `src/components/dashboard/MetricLayerSelector.jsx`

**Interfaces:**
- Consumes: `METRICS` from `src/constants/metrics.js`, `LAYER_STATUS` from `src/constants/layerStatus.js` (both pre-existing, unchanged).
- Produces: `SegmentTogglePanel(props)` — same prop contract `MetricLayerSelector` had: `{ activeLayer, onLayerChange, showMarkers, onToggleMarkers, showCoverage, onToggleCoverage, showLightning, onToggleLightning, lightningCount, lightningStatus, showStorms, onToggleStorms, stormCount, stormStatus, showWind, onToggleWind, windStatus, owmLayer, onOwmChange, permissions }`.

- [ ] **Step 1: Create `src/components/dashboard/SegmentTogglePanel.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { Box, Button, Typography, Divider, FormControlLabel, Switch, Tooltip, Chip, Collapse, IconButton } from '@mui/material';
import { Icon } from '@iconify/react';
import { METRICS } from '@/constants/metrics';
import { LAYER_STATUS } from '@/constants/layerStatus';

/**
 * Sky/Ground Segment vendor panel (PRD §4.2). Groups every layer control by
 * the vendor that provides it — vendors with no backend integration yet
 * (NASA, Sentinel, BMKG, Maxar) render as disabled cards with a "Segera"
 * badge rather than being hidden, so the full PRD architecture stays
 * visible. See docs/superpowers/specs/2026-08-26-dual-tab-segment-layout-design.md §2
 * for the vendor→layer mapping this panel encodes.
 *
 * Replaces the old flat MetricLayerSelector — same props, regrouped
 * presentation. To add a new control to an active vendor card, follow the
 * same pattern as the existing LayerSwitch/ModeButton usages below.
 */

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

const STATUS_DOT = {
  [LAYER_STATUS.EMPTY]: { color: '#5b6b82', title: 'Tidak ada data untuk ditampilkan saat ini.' },
  [LAYER_STATUS.ERROR]: { color: '#f59e0b', title: 'Gagal memuat data.' },
};

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#00e5ff' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'rgba(0, 229, 255, 0.7)' },
};

function LayerSwitch({ checked, onChange, label, count, status, sx }) {
  const dot = STATUS_DOT[status];
  return (
    <FormControlLabel
      sx={{ ml: 0, mr: 0, justifyContent: 'space-between', width: '100%', ...sx }}
      labelPlacement="start"
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} size="small" sx={switchSx} />}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.primary' }}>
            {label}{typeof count === 'number' ? <Box component="span" sx={{ color: 'text.secondary', fontFamily: 'var(--font-family-mono)', ml: 0.5 }}>· {count}</Box> : null}
          </Typography>
          {dot && (
            <Tooltip title={dot.title} placement="top">
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dot.color, flexShrink: 0 }} />
            </Tooltip>
          )}
        </Box>
      }
    />
  );
}

function ModeButton({ active, icon, label, onClick }) {
  return (
    <Button
      startIcon={<Icon icon={icon} />}
      onClick={onClick}
      fullWidth
      disableRipple
      sx={{
        justifyContent: 'flex-start',
        height: 36,
        borderRadius: 'var(--radius-md, 8px)',
        px: 1.25,
        color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
        fontWeight: 700,
        fontSize: '0.8rem',
        border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
        background: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
        '&:hover': { background: 'var(--nirmala-cyan-dim)' },
      }}
    >
      {label}
    </Button>
  );
}

function VendorCard({ title, accent, active = true, children }) {
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 'var(--radius-md, 8px)',
        borderLeft: `2px solid ${active ? accent : 'var(--nirmala-glass-border)'}`,
        background: 'rgba(255,255,255,0.02)',
        opacity: active ? 1 : 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
        {!active && (
          <Tooltip title="Menunggu integrasi Backend" placement="top">
            <Chip
              label="Segera"
              size="small"
              sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }}
            />
          </Tooltip>
        )}
      </Box>
      {active && children}
    </Box>
  );
}

function SegmentGroup({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <Typography sx={eyebrowSx}>{title}</Typography>
        <IconButton size="small" disableRipple sx={{ p: 0.25, color: 'text.secondary' }}>
          <Icon icon={open ? 'material-symbols:expand-less-rounded' : 'material-symbols:expand-more-rounded'} width={16} />
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

const OWM_LAYERS = [
  { id: null, label: 'Nonaktif' },
  { id: 'precipitation_new', label: 'Hujan' },
  { id: 'clouds_new', label: 'Awan' },
];

export default function SegmentTogglePanel({
  activeLayer, onLayerChange, showMarkers, onToggleMarkers, showCoverage, onToggleCoverage,
  showLightning, onToggleLightning, lightningCount, lightningStatus,
  showStorms, onToggleStorms, stormCount, stormStatus,
  showWind, onToggleWind, windStatus,
  owmLayer, onOwmChange,
  permissions,
}) {
  // Fail-open: a control is only hidden when the manifest explicitly says
  // `false`. Undefined/null (manifest not loaded yet, or flag absent) keeps
  // it visible — same rule MetricLayerSelector used.
  const canViewSensor = permissions?.can_view_sensor !== false;
  const canViewLightning = permissions?.can_view_lightning !== false;
  const showSensorToggles = activeLayer === 'rain';

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 72,
        left: 16,
        zIndex: 'var(--z-overlay, 100)',
        p: 1.75,
        width: 280,
        maxHeight: 'calc(100% - 280px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <SegmentGroup title="Sky Segment">
        <VendorCard title="JMA Himawari-9" accent="var(--nirmala-cyan)">
          <ModeButton
            active={activeLayer === 'himawari'}
            icon={METRICS.himawari.icon}
            label={METRICS.himawari.label}
            onClick={() => onLayerChange('himawari')}
          />
        </VendorCard>

        <VendorCard title="OpenWeather" accent="var(--nirmala-cyan)">
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
          {onToggleWind && (
            <LayerSwitch checked={showWind} onChange={onToggleWind} label="Angin (partikel)" status={windStatus} />
          )}
          <Typography
            variant="caption"
            component="a"
            href="https://openweathermap.org"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'text.secondary', fontSize: 10, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            Data cuaca oleh OpenWeather
          </Typography>
        </VendorCard>

        <VendorCard title="NASA (FIRMS & GIBS)" accent="var(--nirmala-cyan)" active={false} />
        <VendorCard title="Sentinel (ESA Copernicus)" accent="var(--nirmala-cyan)" active={false} />
      </SegmentGroup>

      <Divider sx={{ borderColor: 'var(--nirmala-glass-border)' }} />

      <SegmentGroup title="Ground Segment">
        <VendorCard title="Rainvision" accent="var(--status-active, #34d399)">
          <ModeButton active={activeLayer === 'rain'} icon={METRICS.rain.icon} label={METRICS.rain.label} onClick={() => onLayerChange('rain')} />
          <ModeButton active={activeLayer === 'mesh'} icon={METRICS.mesh.icon} label={METRICS.mesh.label} onClick={() => onLayerChange('mesh')} />
          <ModeButton active={activeLayer === 'node'} icon={METRICS.node.icon} label={METRICS.node.label} onClick={() => onLayerChange('node')} />

          {onToggleLightning && canViewLightning && (
            <LayerSwitch checked={showLightning} onChange={onToggleLightning} label="Petir" count={lightningCount} status={lightningStatus} />
          )}
          {onToggleStorms && (
            <LayerSwitch checked={showStorms} onChange={onToggleStorms} label="Sel Badai" count={stormCount} status={stormStatus} />
          )}
          {canViewSensor && showSensorToggles && (
            <>
              <LayerSwitch checked={showCoverage} onChange={onToggleCoverage} label="Cakupan Sensor" />
              <LayerSwitch checked={showMarkers} onChange={onToggleMarkers} label="Titik Sensor" />
            </>
          )}
        </VendorCard>

        <VendorCard title="BMKG" accent="var(--status-active, #34d399)" active={false} />
        <VendorCard title="Maxar" accent="var(--status-active, #34d399)" active={false} />
      </SegmentGroup>
    </Box>
  );
}
```

- [ ] **Step 2: Swap the import and JSX tag in `page.jsx`**

Change the import (line 16) from:

```js
import MetricLayerSelector from '@/components/dashboard/MetricLayerSelector';
```

to:

```js
import SegmentTogglePanel from '@/components/dashboard/SegmentTogglePanel';
```

Change the JSX tag (the `<MetricLayerSelector ... />` block, currently starting around line 237) from `MetricLayerSelector` to `SegmentTogglePanel` — every prop passed stays exactly the same:

```jsx
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
```

(Only the component name and the comment above it change; every prop name/value is identical to what `MetricLayerSelector` already received.)

- [ ] **Step 3: Delete the retired component**

```bash
git rm src/components/dashboard/MetricLayerSelector.jsx
```

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`

- Confirm the left panel now shows "Sky Segment" (Himawari, OpenWeather active; NASA, Sentinel disabled with a "Segera" badge) and "Ground Segment" (Rainvision active with Kerapatan Hujan/Mesh Map/Node Sensor buttons + Petir/Sel Badai switches; BMKG, Maxar disabled).
- Click each Rainvision mode button — confirm the map's active layer changes exactly as it did before (rain heatmap ↔ mesh ↔ node), and that when "Kerapatan Hujan" is active, "Cakupan Sensor"/"Titik Sensor" switches appear as before.
- Click the Himawari button — confirm the Himawari layer activates on the map.
- Toggle "Petir"/"Sel Badai"/"Angin (partikel)" and the OpenWeather Hujan/Awan buttons — confirm each still drives its existing layer with no behavior change.
- Hover a disabled card (e.g. "BMKG") — confirm the "Menunggu integrasi Backend" tooltip appears and clicking it does nothing.
- Click the "Sky Segment"/"Ground Segment" chevrons — confirm each group collapses/expands independently.
- Confirm no console errors, and that `src/components/dashboard/MetricLayerSelector.jsx` no longer exists (`ls src/components/dashboard/`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/SegmentTogglePanel.jsx "src/app/(dashboard)/page.jsx"
git commit -m "feat: replace MetricLayerSelector with Sky/Ground SegmentTogglePanel"
```
