/**
 * JMA Himawari "Cloud-top Enhanced" (IR-Enhanced) tile imagery — the same
 * product shown on BMKG's himawari-ir-enhanced reference page. Unlike the
 * old "Heavy Rainfall Potential Areas" (HRP) product this replaces (see
 * docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md), this
 * is served as a standard z/x/y tile pyramid, already colorized server-side
 * — no client-side recolor step is needed.
 *
 * See docs/superpowers/specs/2026-08-21-jma-himawari-ir-enhanced-migration-design.md
 * for how this URL pattern and the 10-minute step were confirmed (network
 * trace against jma.go.jp/bosai/map.html's "雲頂強調画像" layer).
 */

const TILE_BASE_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg';

export const JMA_TICK_STEP_MINUTES = 10;
export const JMA_TICK_COUNT = 144; // 24h of history at a 10-minute step

// JMA overwrites each basetime slot in place and does NOT 404 an unpublished
// slot — it serves the PREVIOUS day's tiles at that same HHMM with a clean
// 200 (confirmed on the previous HRP product; assumed to hold here too since
// it's the same publishing pipeline). Without this offset, "live" mode would
// silently display a stale frame as current.
export const JMA_PUBLISH_LAG_MINUTES = 20; // rounded up from the ~12min observed lag on HRP

/** Round `date` down to the nearest `stepMinutes` boundary, in UTC. */
export function roundDownToStep(date, stepMinutes = JMA_TICK_STEP_MINUTES) {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

/** Build the `YYYYMMDDHHMMSS` basetime string JMA expects, from an already-rounded UTC `date`. */
export function buildJmaHimawariBasetime(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}00`;
}

/**
 * Build one tile URL for the Cloud-top Enhanced (`SND/ETC`) product.
 * `basetime` and `validtime` are always identical for this observation
 * product (see this plan's Global Constraints).
 */
export function buildJmaHimawariTileUrl(basetime, z, x, y) {
  return `${TILE_BASE_URL}/${basetime}/fd/${basetime}/SND/ETC/${z}/${x}/${y}.jpg`;
}
