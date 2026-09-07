/**
 * BMKG Cuaca precipitation-intensity mapping. `precip_mm` from
 * GET /api/bmkg/cuaca/indonesia is an instantaneous/hourly reading (the
 * sample response's "now" values — 0, 0.2, 0.7 — are far too small to be a
 * 24h accumulation), so breakpoints below use a standard hourly
 * meteorological intensity convention (WMO-style), NOT an
 * official BMKG-published threshold (not available at the time this was
 * written — see docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md).
 * Adjust these three constants if BMKG documents its own official
 * thresholds later.
 */
const LOW_MAX_MM = 2.5;     // 0-2.5 mm/jam = Rendah
const MODERATE_MAX_MM = 7.5; // 2.5-7.5 mm/jam = Sedang
const HIGH_MAX_MM = 15;      // 7.5-15 mm/jam = Tinggi; >15 = Ekstrem

/**
 * Maps a precip_mm reading to a [0,1] position on RAIN_RAMP (the same ramp
 * CanvasOverlay.jsx/BmkgRainLayer.jsx/METRICS.bmkg use), where each of the
 * four bands above occupies an even quarter of the range: 0-0.25 Rendah,
 * 0.25-0.5 Sedang, 0.5-0.75 Tinggi, 0.75-1 Ekstrem (uncapped intensity
 * within the band, but the returned t itself is always capped at 1).
 */
export function precipToT(mm) {
  if (!(mm > 0)) return 0;
  if (mm <= LOW_MAX_MM) return (mm / LOW_MAX_MM) * 0.25;
  if (mm <= MODERATE_MAX_MM) return 0.25 + ((mm - LOW_MAX_MM) / (MODERATE_MAX_MM - LOW_MAX_MM)) * 0.25;
  if (mm <= HIGH_MAX_MM) return 0.5 + ((mm - MODERATE_MAX_MM) / (HIGH_MAX_MM - MODERATE_MAX_MM)) * 0.25;
  return Math.min(1, 0.75 + ((mm - HIGH_MAX_MM) / HIGH_MAX_MM) * 0.25);
}
