'use client';

import { useEffect, useState } from 'react';
import { JMA_TICK_COUNT, JMA_TICK_STEP_MINUTES, JMA_PUBLISH_LAG_MINUTES, roundDownToStep, buildJmaHimawariBasetime } from '@/lib/jmaHimawari';

// Real time keeps moving while the user sits in Himawari mode — re-derive
// the tick list periodically so "live" advances, the same way the old
// bignet-backed hook polled its manifest every 5 minutes. This is pure
// client-side math (no network call), so a short interval is cheap.
const REFRESH_MS = 60 * 1000;

// NOTE: when the 10-minute bucket rolls, every tick's absolute time shifts
// 10 minutes further back — visible via the updated displayed timestamp,
// not silent, and the old bignet-backed hook drifted the same way. This is
// a cosmetic drift, not a bug: the Current tab always tracks "most recent,
// with fallback" rather than a frozen historical point, so there is no
// state elsewhere that needs to be kept in sync with the rolling ticks.
function buildTicks() {
  const latest = roundDownToStep(new Date(Date.now() - JMA_PUBLISH_LAG_MINUTES * 60 * 1000));
  const out = [];
  for (let i = JMA_TICK_COUNT - 1; i >= 0; i--) {
    const date = new Date(latest.getTime() - i * JMA_TICK_STEP_MINUTES * 60 * 1000);
    out.push({ date, basetime: buildJmaHimawariBasetime(date) });
  }
  return out;
}

/** Generates a rolling 24h/10-minute tick list for the JMA Himawari layer. */
export function useJmaHimawariTicks(active) {
  const [ticks, setTicks] = useState([]);

  useEffect(() => {
    if (!active) { setTicks([]); return; }
    setTicks(buildTicks());
    const id = setInterval(() => setTicks(buildTicks()), REFRESH_MS);
    return () => clearInterval(id);
  }, [active]);

  return { ticks, loading: false };
}
