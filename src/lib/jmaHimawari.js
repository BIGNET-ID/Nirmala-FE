'use client';

/**
 * JMA "Heavy Rainfall Potential Areas" imagery (Southeast Asia, native
 * resolution). Public, no auth. Loaded as a plain <img>/GroundOverlay (not
 * fetched via JS), so the lack of an Access-Control-Allow-Origin header on
 * JMA's response doesn't matter — confirmed no Referer/robots.txt block
 * either. See docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md.
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
