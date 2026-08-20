// Pure helpers for the global time-travel timeline. Kept dependency-free so
// the tick math is easy to reason about/test without React or Maps state.

const DAY_MS = 24 * 60 * 60 * 1000;
// Fallback only — used when useRainHistoryRange can't reach the backend to
// discover the real retained-history window (confirmed ~8 days as of writing,
// but not contractual, so we still prefer asking the API over hardcoding it).
export const RAIN_HISTORY_FALLBACK_DAYS = 4;
export const RAIN_TICK_MINUTES = 15;

/** Tick list for the sensor-rain-history mode: `start` to `end`, step-min apart. */
export function buildRainTicks(start, end, stepMinutes = RAIN_TICK_MINUTES) {
  const stepMs = stepMinutes * 60 * 1000;
  const ticks = [];
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) ticks.push(new Date(t));
  if (ticks[ticks.length - 1]?.getTime() !== end.getTime()) ticks.push(end);
  return ticks;
}

/**
 * Nirmala timeseries labels have no year ("08-18 10:50") — resolve against a
 * reference date's year. Good enough for a 4-5 day lookback window; a
 * December 31 -> January 1 wrap could resolve to the wrong year, which is an
 * accepted edge case for this v1 (see Phase 3 plan notes on this endpoint).
 */
export function parseSensorHistoryLabel(label, referenceDate) {
  const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(label || '');
  if (!m) return new Date(NaN);
  const [, mo, d, h, mi] = m;
  return new Date(referenceDate.getFullYear(), +mo - 1, +d, +h, +mi);
}

/** Index of the tick whose date is nearest `target` (ticks assumed sorted ascending). */
export function nearestTickIndex(ticks, target) {
  if (!ticks.length) return -1;
  const t = target.getTime();
  let lo = 0, hi = ticks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].getTime() < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(ticks[lo - 1].getTime() - t) <= Math.abs(ticks[lo].getTime() - t)) return lo - 1;
  return lo;
}
