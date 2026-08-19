'use client';

import { useSSEStream } from './useSSEStream';
import { normalizeThunderstorm } from '@/lib/nirmalaApi';

/**
 * Live thunderstorm cell updates via GET /api/stream/thunderstorm (PRD §7.1
 * Kategori C). Confirmed against the live backend: each event is a full
 * snapshot (same shape as GET /api/thunderstorm, `{content: [...]}`), not a
 * per-cell delta — so it replaces the whole array. See useSSEStream's doc
 * comment.
 */
export function useThunderstormStream(initialStorms) {
  const { data, status } = useSSEStream('/api/stream/thunderstorm', initialStorms, {
    mergeStrategy: 'replace',
    normalizeItem: normalizeThunderstorm,
  });
  return { storms: data, status };
}
