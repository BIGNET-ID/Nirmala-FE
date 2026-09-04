'use client';

import { useSSEStream } from './useSSEStream';
import { normalizeSensors, extractSensorMeta } from '@/lib/nirmalaApi';

/**
 * Live sensor telemetry via GET /api/stream/sensors (PRD §7.1 Kategori C).
 * Confirmed against the live backend: each event is a full snapshot (same
 * shape as GET /api/sensors), not a per-sensor delta — so it replaces the
 * whole array rather than upserting by id. See useSSEStream's doc comment.
 *
 * Each snapshot also carries aggregate `categories`/`alert` fields computed
 * by the backend — exposed here as `meta` so the dashboard's sensor stats
 * can trust them instead of re-tallying the sensor list itself.
 */
export function useSensorStream(initialStations, initialMeta) {
  const { data, status, meta } = useSSEStream('/api/stream/sensors', initialStations, {
    mergeStrategy: 'replace',
    normalizeItem: normalizeSensors,
    normalizeMeta: extractSensorMeta,
    initialMeta,
  });
  return { stations: data, status, meta };
}
