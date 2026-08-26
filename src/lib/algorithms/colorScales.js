/**
 * Color scale functions untuk mapping nilai sensor ke warna RGBA.
 */

export function rainToColor(mmPerHour) {
  if (mmPerHour < 5) return [0, 0, 0, 0];
  if (mmPerHour < 25) return [0, 229, 255, 120];
  if (mmPerHour < 50) return [0, 230, 118, 160];
  if (mmPerHour < 75) return [255, 235, 59, 190];
  if (mmPerHour < 100) return [255, 152, 0, 210];
  return [244, 67, 54, 235];
}

export function tempToColor(celsius) {
  const norm = Math.max(0, Math.min(1, (celsius - 20) / 16));
  const hue = (1 - norm) * 240;
  return hslToRgba(hue, 0.85, 0.5, 0.55);
}

// Same 6-stop scale as the app's existing --rain-1..--rain-6 CSS tokens
// (already used by the rain-density legend gradient) — reused here for
// Mesh Map's edge distance instead of a new palette, so "cool = short/low,
// hot = long/high" reads consistently across metrics.
const DISTANCE_STOPS = [
  [96, 165, 250],  // --rain-1 #60a5fa
  [52, 211, 153],  // --rain-2 #34d399
  [234, 179, 8],   // --rain-3 #eab308
  [251, 146, 60],  // --rain-4 #fb923c
  [239, 68, 68],   // --rain-5 #ef4444
  [192, 132, 252], // --rain-6 #c084fc
];

/** Maps a normalized [0,1] value to an RGBA colour along the shared distance/intensity scale. */
export function edgeDistanceToColor(t) {
  const clamped = Math.min(1, Math.max(0, t));
  const segments = DISTANCE_STOPS.length - 1;
  const pos = clamped * segments;
  const i = Math.min(segments - 1, Math.floor(pos));
  const localT = pos - i;
  const [r1, g1, b1] = DISTANCE_STOPS[i];
  const [r2, g2, b2] = DISTANCE_STOPS[i + 1];
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

function hslToRgba(h, s, l, a) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), Math.round(a * 255)];
}