// Shared sensor status → colour mapping (BIGNET DS v19), used by any layer
// that draws individual sensors: dots (SensorDotLayer), mesh edges/nodes
// (MeshLayer), and the Node Sensor mode legend.
//
// Values must stay identical to the --status-* tokens in src/app/globals.css
// (consumed directly by SensorStatsCard) so dot colors on the map always
// match the Statistik Sensor panel. Kept as hardcoded hex, not var(...),
// because canvas 2D context (ctx.fillStyle) cannot resolve CSS custom
// properties — update both places by hand if either changes.

// Deliberately shifted away from the Rain Density/BMKG rainbow ramp's own
// stops (--rain-1..6 in globals.css: #3b82f6/#22d3ee/#22c55e/#eab308/
// #f97316/#dc2626) — the previous palette had two EXACT hex collisions
// (raining was the ramp's own low-end blue, blacklisted was the ramp's own
// extreme-red), which read as one ambiguous color language when sensor
// dots and an active rain/BMKG heatmap share the screen. Each status here
// keeps its conventional meaning (green=healthy, red=blacklisted,
// amber=unavailable, gray=inactive) but at a more muted/shifted tone than
// the ramp's bright, fully-saturated spectrum, so the two systems read as
// visually distinct even when they share a hue family.
export const SENSOR_STATUS_COLOR = {
  blacklisted: '#991b1b',  // deep brick-red — was #dc2626 (identical to ramp's extreme-red stop)
  inactive: '#4b5563',     // unchanged — no collision with the ramp
  unavailable: '#b45309',  // muted amber-brown — was #f59e0b (close to ramp's orange stop)
  raining: '#4338ca',      // indigo — was #3b82f6 (identical to ramp's low-end blue stop)
  active: '#15803d',       // forest green — was #3cba54 (close to ramp's mid green stop)
};

// Dark-mode-only overrides — the light-mode hex above reads fine on the
// light (#e9eef5) map bg, but several of the more muted/dark tones above
// lose contrast against dark mode's near-black (#050811) map bg. Kept as
// hardcoded hex (not var(...)) for the same canvas-fillStyle reason as
// SENSOR_STATUS_COLOR above.
// NOTE: none of these dark-mode brightened values may equal a ramp stop
// (#3b82f6/#22d3ee/#22c55e/#eab308/#f97316/#dc2626) — that would silently
// reintroduce the exact collision this palette exists to remove, just in
// dark mode only.
const SENSOR_STATUS_COLOR_DARK = {
  inactive: '#a0a0a0',     // --dm-300
  blacklisted: '#e11d48',  // brighter rose-red — was going to be #dc2626, but that IS the ramp's red stop
  raining: '#818cf8',      // brighter indigo — the deeper indigo loses punch on near-black
  active: '#10b981',       // brighter emerald — was going to be #22c55e, but that IS the ramp's green stop
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

// Resolves a bucket name directly to its light/dark-mode hex — same lookup
// statusColor() uses internally, but usable without a station object
// (AdminRegionLayer resolves its bucket itself, via resolveRegionBucket,
// not from a single station's fields). AdminRegionLayer.jsx no longer uses
// a synthetic 'inactive' bucket for "no data" regions — those are skipped
// entirely rather than colored.
export function bucketColor(bucket) {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return (isDark && SENSOR_STATUS_COLOR_DARK[bucket]) || SENSOR_STATUS_COLOR[bucket];
}

export function statusColor(st) {
  return bucketColor(statusBucket(st));
}
