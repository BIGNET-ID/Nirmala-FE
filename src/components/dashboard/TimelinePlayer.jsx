/**
 * Forecast timeline — intentionally disabled.
 *
 * The old version animated a fake `timeStep`. A real national heatmap timeline
 * needs historical NATIONAL snapshots, which the backend does not expose yet
 * (only per-sensor /api/timeseries). Re-enable this once such snapshots exist.
 * Kept as a stub so the wiring is easy to restore. See spec §3.5 / §7 gaps.
 */
export default function TimelinePlayer() {
  return null;
}
