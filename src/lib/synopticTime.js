// OpenWeather's Weather Maps 1.0 tile layers (precipitation_new, clouds_new,
// temp_new, pressure_new) expose no per-tile timestamp — confirmed against
// OpenWeather's own documentation, which only states the underlying data
// refreshes "every 3 hours" system-wide, with no exact schedule or metadata
// endpoint exposed to clients. We can't know precisely when the tile
// currently on screen was captured.
//
// The closest honest estimate: WMO synoptic hours (00/03/06/09/12/15/18/21
// UTC) are the globally standardized 3-hourly observation times most
// meteorological data (including OpenWeather's own sources) is built
// around — not an arbitrary guess. Flooring "now" to the most recent one
// gives a defensible estimate of the current refresh cycle, which we label
// as a cycle/estimate in the UI rather than implying an exact confirmed
// fetch time (see the caption wording in SegmentTogglePanel.jsx).
const SYNOPTIC_STEP_HOURS = 3;

/** Most recent WMO synoptic hour (00/03/06/.../21 UTC) at or before now. */
export function lastSynopticTime(now = new Date()) {
  const floored = new Date(now);
  floored.setUTCMinutes(0, 0, 0);
  const hour = floored.getUTCHours();
  floored.setUTCHours(hour - (hour % SYNOPTIC_STEP_HOURS));
  return floored;
}
