import { RAIN_MM_BREAKPOINTS } from '../constants/metrics.js';

// Maps a real mm/h rain rate onto the RAIN_RAMP's [0,1] position, using
// RAIN_MM_BREAKPOINTS as piecewise-linear control points — see
// CanvasOverlay.jsx's drawRainField, which colorizes grid cells through
// this before looking them up in RAIN_LUT.
export function mmToT(mm) {
  if (!Number.isFinite(mm) || mm < 0) return 0;
  const stops = RAIN_MM_BREAKPOINTS;
  const n = stops.length;
  if (mm <= stops[0]) return 0;
  if (mm >= stops[n - 1]) return 1;
  for (let i = 0; i < n - 1; i++) {
    if (mm >= stops[i] && mm <= stops[i + 1]) {
      const f = (mm - stops[i]) / (stops[i + 1] - stops[i]);
      return (i + f) / (n - 1);
    }
  }
  return 1;
}
