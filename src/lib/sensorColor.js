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
  blacklisted: '#dc2626', // --status-blacklisted
  inactive: '#4b5563',    // --status-inactive
  raining: '#3b82f6',     // --status-raining
  active: '#3cba54',      // --status-active (dry)
};

// Mutually-exclusive display bucket, precedence blacklisted > inactive >
// raining > active — same precedence statusColor paints with. Shared with
// page.jsx's sensor-status filter so "hide Blacklist" hides exactly the dots
// that render blacklisted-red, not an overlapping definition.
export function statusBucket(st) {
  if (st.blacklisted || st.status === 'blacklisted') return 'blacklisted';
  if (st.inactive || st.unavailable || st.status === 'inactive') return 'inactive';
  if (st.isRaining) return 'raining';
  return 'active';
}

export function statusColor(st) {
  return SENSOR_STATUS_COLOR[statusBucket(st)];
}
