'use client';

import { useSSEStream } from './useSSEStream';
import { normalizeLightning } from '@/lib/nirmalaApi';

/**
 * Live lightning strikes via GET /api/stream/lightning (PRD §7.1 Kategori C).
 * Confirmed against the live backend: each event is a full snapshot (same
 * shape as GET /api/lightning, `{content: [...]}`), not a discrete new-strike
 * delta — so it replaces the whole array rather than appending. See
 * useSSEStream's doc comment.
 */
export function useLightningStream(initialStrikes) {
  const { data, status } = useSSEStream('/api/stream/lightning', initialStrikes, {
    mergeStrategy: 'replace',
    normalizeItem: normalizeLightning,
  });
  return { strikes: data, status };
}
