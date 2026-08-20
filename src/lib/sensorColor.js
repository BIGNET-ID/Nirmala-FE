// Shared sensor status → colour mapping (BIGNET DS v19), used by any layer
// that draws individual sensors: dots (SensorDotLayer), mesh edges/nodes
// (MeshLayer), and the Node Sensor mode legend.
export const SENSOR_STATUS_COLOR = {
  blacklisted: '#ef4444', // --status-blacklisted
  inactive: '#4b5563',    // --status-inactive
  raining: '#60a5fa',     // --status-raining
  active: '#34d399',      // --status-active (dry)
};

export function statusColor(st) {
  if (st.blacklisted || st.status === 'blacklisted') return SENSOR_STATUS_COLOR.blacklisted;
  if (st.inactive || st.unavailable || st.status === 'inactive') return SENSOR_STATUS_COLOR.inactive;
  if (st.isRaining) return SENSOR_STATUS_COLOR.raining;
  return SENSOR_STATUS_COLOR.active;
}
