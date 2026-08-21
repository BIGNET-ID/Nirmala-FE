/**
 * JMA "Heavy Rainfall Potential Areas" imagery (Southeast Asia, native
 * resolution). Public, no auth, no robots.txt/Referer block (confirmed).
 *
 * IMPORTANT — this now DOES depend on CORS: HimawariLayer recolors each
 * frame client-side via <canvas>, which requires the image to be loaded
 * with crossOrigin='anonymous'. JMA's CloudFront-fronted server only sends
 * `Access-Control-Allow-Origin: *` when the request carries an `Origin`
 * header (confirmed live — a plain `curl -I` with no Origin header misses
 * it, which is why an earlier version of this comment wrongly said CORS
 * "didn't matter"). A real browser <img crossorigin> request does send
 * Origin, so this works today — but there is no manifest, no contract, and
 * no monitoring for this dependency: if JMA ever changes their CORS
 * policy, URL convention, or 10-minute step, this feature fails silently
 * (a blank map plus the "unavailable" pill), with nothing to alert anyone.
 * See docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md.
 */

const BASE_URL = 'https://www.data.jma.go.jp/mscweb/data/himawari/img/r2w';

// From JMA's "Users' Guide to Imagery with Heavy Rainfall Potential Areas"
// (Ver. 4, 2015), section 3(1): Southeast Asia coverage is 30N-15S, 90E-165E.
// This is a plain equirectangular rectangle (the 1501x901 image's pixel
// aspect ratio matches the 75x45 degree aspect ratio exactly), so it can be
// used directly as GroundOverlay bounds with no reprojection.
export const JMA_SEA_BOUNDS = { north: 30, south: -15, west: 90, east: 165 };

export const JMA_TICK_STEP_MINUTES = 10;
export const JMA_TICK_COUNT = 144; // 24h of history at a 10-minute step

// JMA overwrites each HHMM slot in place and does NOT 404 an unpublished
// slot — it serves the PREVIOUS day's image at that same HHMM with a clean
// 200 (confirmed by checking Last-Modified on the live endpoint: ~12min
// observed publish latency). Without this offset, "live" mode would
// silently display yesterday's frame as current, and HimawariLayer's
// fallback-retry chain would never trigger for it (a stale 200 is not a
// load failure).
export const JMA_PUBLISH_LAG_MINUTES = 20; // rounded up from the ~12min observed lag

/** Round `date` down to the nearest `stepMinutes` boundary, in UTC. */
export function roundDownToStep(date, stepMinutes = JMA_TICK_STEP_MINUTES) {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

/** Build the JMA image URL for an already-rounded UTC `date`. */
export function buildJmaHimawariUrl(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${BASE_URL}/r2w_hrp_${hh}${mm}.jpg`;
}
