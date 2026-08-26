// A single pure helper, nearestTickIndex. Kept dependency-free so the tick
// math is easy to reason about/test without React or Maps state.
//
// This file used to also hold buildRainTicks/parseSensorHistoryLabel for the
// Current-tab rain-history scrubber, which was removed (see
// docs/superpowers/specs/2026-08-26-static-current-tab-design.md) —
// Rainvision has no bulk-history backend endpoint yet and is not in scope
// for the Timeline playback project either. nearestTickIndex is kept: a
// future Timeline playback feature will use it to round a coarser-grained
// vendor's position to the nearest tick on a finer-grained master timeline.

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
