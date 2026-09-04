// Shared sensor status → colour mapping (BIGNET DS v19), used by any layer
// that draws individual sensors: dots (SensorDotLayer), mesh edges/nodes
// (MeshLayer), and the Node Sensor mode legend.
//
// Values must stay identical to the --status-* tokens in src/app/globals.css
// (consumed directly by SensorStatsCard) so dot colors on the map always
// match the Statistik Sensor panel. Kept as hardcoded hex, not var(...),
// because canvas 2D context (ctx.fillStyle) cannot resolve CSS custom
// properties — update both places by hand if either changes.

export const SENSOR_STATUS_COLOR = {
  blacklisted: '#dc2626',  // --status-blacklisted
  inactive: '#4b5563',     // --status-inactive
  unavailable: '#f59e0b',  // --status-unavailable
  raining: '#3b82f6',      // --status-raining
  active: '#3cba54',       // --status-active (dry)
};

// Dark-mode-only overrides — the rest of SENSOR_STATUS_COLOR is saturated
// enough to read on both the light (#e9eef5) and dark (#050811) map
// backgrounds, but the muted slate used for "inactive" was tuned for the
// light bg only and all but disappears against dark's near-black one.
// Reuses --dm-300, the app's existing dark-mode muted-gray token, rather
// than inventing a new color. Kept as hardcoded hex (not var(...)) for the
// same canvas-fillStyle reason as SENSOR_STATUS_COLOR above.
const SENSOR_STATUS_COLOR_DARK = {
  inactive: '#a0a0a0',     // --dm-300
};

// Mutually-exclusive display bucket, precedence manualBlacklisted > category
// (inactive > unavailable > raining > active) — same precedence statusColor
// paints with. Shared with page.jsx's sensor-status filter so "hide
// Blacklist" hides exactly the dots that render blacklisted-red, not an
// overlapping definition.
//
// `category` is the backend's own authoritative classification (see
// /api/stream/sensors' `categories` tally, which this mirrors 1:1) — trust
// it over the raw `blacklisted`/`status` fields. Confirmed against the live
// API: sensors the backend auto-retires get category:'inactive' but ALSO
// blacklisted:true + status:'blacklisted' (that's how the backend implements
// auto-retirement), so checking `blacklisted`/`status` before `category`
// swallowed every inactive sensor into the Blacklist bucket, hiding them
// under "hide Blacklist" and miscoloring them red instead of gray. Only
// manualBlacklisted (a deliberate admin action, not backend-auto) outranks
// category. Falls back to the old boolean flags when `category` is absent
// (e.g. older fixture data captured before the backend added it).
export function statusBucket(st) {
  if (st.manualBlacklisted) return 'blacklisted';
  if (st.category) return st.category;
  if (st.blacklisted || st.status === 'blacklisted') return 'blacklisted';
  if (st.inactive) return 'inactive';
  if (st.unavailable) return 'unavailable';
  if (st.isRaining) return 'raining';
  return 'active';
}

export function statusColor(st) {
  const bucket = statusBucket(st);
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return (isDark && SENSOR_STATUS_COLOR_DARK[bucket]) || SENSOR_STATUS_COLOR[bucket];
}
