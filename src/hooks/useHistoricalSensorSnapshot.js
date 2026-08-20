'use client';

import { useEffect, useRef, useState } from 'react';
import { nirmalaApiService } from '@/lib/nirmalaApi';
import { RAIN_HISTORY_DAYS, parseSensorHistoryLabel } from '@/lib/timeTravelRange';

const CONCURRENCY = 20;

/**
 * Replays the rain heatmap for a past `selectedTimestamp` (Date | null).
 *
 * KNOWN LIMITATION (accepted for v1, see Phase 3 plan): there is no bulk
 * "sensors as of time T" endpoint — only per-sensor /api/timeseries. Fetching
 * that for all 4,500+ stations on every scrub isn't viable, so historical
 * replay is capped to sensors currently inside the map viewport, with
 * results cached per-sensor in memory so re-scrubbing within the same
 * session doesn't re-fetch. A bulk snapshot endpoint would remove this cap
 * entirely and is the recommended long-term fix.
 */
export function useHistoricalSensorSnapshot(selectedTimestamp, stations, map) {
  const [snapshot, setSnapshot] = useState(null);
  const cacheRef = useRef(new Map()); // sensorId -> { data:[{time,rainMm}] }

  useEffect(() => {
    if (!selectedTimestamp || !map) { setSnapshot(null); return; }

    const bounds = map.getBounds?.();
    const visible = bounds
      ? stations.filter((s) => bounds.contains({ lat: s.lat, lng: s.lng }))
      : stations;

    let cancelled = false;

    const run = async () => {
      const cache = cacheRef.current;
      const toFetch = visible.filter((s) => !cache.has(s.id));

      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = toFetch.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map(async (s) => {
            const resp = await nirmalaApiService.getTimeseries(s.id, { nDays: RAIN_HISTORY_DAYS });
            const labels = resp?.rain?.chart_data?.labels || [];
            const data = resp?.rain?.chart_data?.datasets?.[0]?.data || [];
            cache.set(s.id, { labels, data });
          }),
        );
      }
      if (cancelled) return;

      const derived = visible.map((s) => {
        const entry = cacheRef.current.get(s.id);
        if (!entry || !entry.labels.length) return { ...s, isRaining: false };
        let bestIdx = -1, bestDiff = Infinity;
        entry.labels.forEach((label, idx) => {
          const t = parseSensorHistoryLabel(label, selectedTimestamp);
          const diff = Math.abs(t.getTime() - selectedTimestamp.getTime());
          if (!Number.isNaN(t.getTime()) && diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
        });
        const mm = bestIdx >= 0 ? entry.data[bestIdx] : 0;
        return { ...s, isRaining: (mm || 0) > 0 };
      });
      if (!cancelled) setSnapshot(derived);
    };
    run();

    return () => { cancelled = true; };
  }, [selectedTimestamp, stations, map]);

  return snapshot;
}
