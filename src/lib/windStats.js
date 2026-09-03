// Average of a wind field's per-cell speed (m/s) — the field's own `speed`
// array (see src/app/api/wind/route.js) is fetched but was previously
// discarded client-side; this is the first consumer of it.
export function averageSpeed(field) {
  if (!field?.speed?.length) return null;
  const sum = field.speed.reduce((a, b) => a + b, 0);
  return sum / field.speed.length;
}
