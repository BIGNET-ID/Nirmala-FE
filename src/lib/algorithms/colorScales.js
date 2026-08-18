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