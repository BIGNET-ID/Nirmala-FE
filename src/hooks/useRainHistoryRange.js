'use client';

import { useEffect, useState } from 'react';
import { nirmalaApiService } from '@/lib/nirmalaApi';
import { RAIN_HISTORY_FALLBACK_DAYS, parseSensorHistoryLabel } from '@/lib/timeTravelRange';

const DAY_MS = 24 * 60 * 60 * 1000;

function fallbackRange() {
  const end = new Date();
  return { start: new Date(end.getTime() - RAIN_HISTORY_FALLBACK_DAYS * DAY_MS), end };
}

/**
 * Discovers the actual rain-history window by querying one reference sensor's
 * full timeseries (the backend has no bulk/global range endpoint — see
 * useHistoricalSensorSnapshot's KNOWN LIMITATION note) instead of assuming a
 * fixed number of days, which drifts as the backend's retention changes.
 */
export function useRainHistoryRange(active, refSensorId) {
  const [range, setRange] = useState(null);

  useEffect(() => {
    if (!active || !refSensorId) return;
    let cancelled = false;

    (async () => {
      const resp = await nirmalaApiService.getTimeseries(refSensorId);
      const labels = resp?.rain?.chart_data?.labels || [];
      if (cancelled) return;
      if (labels.length < 2) { setRange(fallbackRange()); return; }
      const end = new Date();
      const start = parseSensorHistoryLabel(labels[0], end);
      const last = parseSensorHistoryLabel(labels[labels.length - 1], end);
      setRange(Number.isNaN(start.getTime()) || Number.isNaN(last.getTime()) ? fallbackRange() : { start, end: last });
    })();

    return () => { cancelled = true; };
  }, [active, refSensorId]);

  return { start: range?.start ?? null, end: range?.end ?? null, loading: active && !range };
}
