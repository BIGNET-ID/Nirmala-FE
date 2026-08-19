'use client';

import { useSSEStream } from './useSSEStream';
import { normalizeSensors } from '@/lib/nirmalaApi';

/**
 * Live sensor telemetry via GET /api/stream/sensors (PRD §7.1 Kategori C).
 * Confirmed against the live backend: each event is a full snapshot (same
 * shape as GET /api/sensors), not a per-sensor delta — so it replaces the
 * whole array rather than upserting by id. See useSSEStream's doc comment.
 */
export function useSensorStream(initialStations) {
  const { data, status } = useSSEStream('/api/stream/sensors', initialStations, {
    mergeStrategy: 'replace',
    normalizeItem: normalizeSensors,
  });
  return { stations: data, status };
}
