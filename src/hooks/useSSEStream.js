'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Generic SSE channel hook per PRD §5.4: EventSource + RAF-batched flush
 * (max 1x/200ms), connecting directly from the browser to the official
 * Nirmala backend (public, no auth, CORS confirmed open: `*`) rather than
 * through the Next.js proxy — a same-origin streaming proxy would buffer the
 * whole response body and stall the stream (see app/api/[...path]/route.js,
 * which does `await upstream.text()` — fine for REST JSON, wrong for SSE).
 *
 * `mergeStrategy` (confirmed against the live backend, not assumed from PRD
 * text alone — /api/stream/sensors, /api/stream/lightning and
 * /api/stream/thunderstorm each broadcast a FULL REST-shaped snapshot on
 * every event, not a discrete per-item delta):
 *  - 'replace': each event IS the full current snapshot — `normalizeItem`
 *    receives the raw payload and returns the whole normalized array, which
 *    replaces `data` outright. This is what all three Nirmala channels use.
 *  - 'upsert' / 'append': kept for a future backend that sends discrete
 *    per-item deltas — 'upsert' merges an event into an existing entity by
 *    key, 'append' accumulates discrete new occurrences into a rolling
 *    window capped at `maxItems`. Unused by the current integration.
 *
 * There is no shape-compatible fallback channel: the unified `/api/stream`
 * sends a health/version summary (`{type, connected, state, ...}`), not a
 * sensors/lightning/thunderstorm array, so it cannot substitute for any of
 * the three per-channel streams. On repeated errors this hook just reports
 * `status: 'reconnecting'` and lets the browser's native EventSource retry
 * the same URL — it does not switch endpoints.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_NIRMALA_STREAM_BASE_URL || 'https://c4c-nirmala.api.bignet.host';
const FLUSH_INTERVAL_MS = 200;

export function useSSEStream(path, initialData, options = {}) {
  const {
    mergeStrategy = 'replace',
    getKey = (item) => item?.id,
    normalizeItem = (raw) => raw,
    // Only used for 'replace' streams that carry aggregate metadata alongside
    // the item array (e.g. /api/stream/sensors' `categories`/`alert`) — every
    // other channel omits it and `meta` just stays at `initialMeta`.
    normalizeMeta = null,
    initialMeta = null,
    maxItems = 500,
  } = options;

  const [data, setData] = useState(initialData);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'reconnecting'

  const optsRef = useRef({ mergeStrategy, getKey, normalizeItem, normalizeMeta, maxItems });
  optsRef.current = { mergeStrategy, getKey, normalizeItem, normalizeMeta, maxItems };

  // `initialData` typically starts as [] and resolves asynchronously (the REST
  // snapshot fetch in usePlatformData finishes after this hook has already
  // mounted). Once the stream has replaced/merged data at least once, live
  // data always wins — the one-shot REST fetch never re-fires after that.
  const liveDataArrivedRef = useRef(false);
  useEffect(() => {
    if (liveDataArrivedRef.current) return;
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (liveDataArrivedRef.current) return;
    setMeta(initialMeta);
  }, [initialMeta]);

  useEffect(() => {
    let closed = false;
    let bufferRef = { current: optsRef.current.mergeStrategy === 'upsert' ? {} : optsRef.current.mergeStrategy === 'append' ? [] : null };
    let metaBufferRef = { current: null };

    const handleMessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        console.warn(`[useSSEStream] Failed to parse payload from ${path}:`, err.message);
        return;
      }
      const { mergeStrategy: strategy, getKey: keyFn, normalizeItem: normFn, normalizeMeta: metaFn } = optsRef.current;
      if (strategy === 'replace') {
        const items = normFn(payload);
        if (items) bufferRef.current = items;
        if (metaFn) metaBufferRef.current = metaFn(payload);
        return;
      }
      const item = normFn(payload);
      if (!item) return;
      if (strategy === 'upsert') {
        const key = keyFn(item);
        if (key != null) bufferRef.current[key] = item;
      } else {
        bufferRef.current.push(item);
      }
    };

    const source = new EventSource(`${BACKEND_URL}${path}`);
    source.onopen = () => setStatus('live');
    source.onmessage = handleMessage;
    source.onerror = () => {
      if (!closed) setStatus('reconnecting');
      // No explicit reconnect logic: EventSource retries the same URL natively.
    };

    let lastFlush = performance.now();
    let rafId = requestAnimationFrame(flush);

    function flush(now) {
      if (now - lastFlush >= FLUSH_INTERVAL_MS) {
        const { mergeStrategy: strategy, maxItems: cap } = optsRef.current;
        if (strategy === 'replace') {
          if (bufferRef.current) {
            liveDataArrivedRef.current = true;
            setData(bufferRef.current);
            bufferRef.current = null;
          }
          if (metaBufferRef.current) {
            setMeta(metaBufferRef.current);
            metaBufferRef.current = null;
          }
        } else if (strategy === 'upsert') {
          const updates = bufferRef.current;
          const keys = Object.keys(updates);
          if (keys.length > 0) {
            liveDataArrivedRef.current = true;
            setData((prev) => {
              const byKey = new Map(prev.map((it) => [String(optsRef.current.getKey(it)), it]));
              keys.forEach((k) => {
                const existing = byKey.get(k);
                byKey.set(k, existing ? { ...existing, ...updates[k] } : updates[k]);
              });
              return Array.from(byKey.values());
            });
            bufferRef.current = {};
          }
        } else {
          const events = bufferRef.current;
          if (events.length > 0) {
            liveDataArrivedRef.current = true;
            setData((prev) => {
              const next = prev.concat(events);
              return next.length > cap ? next.slice(next.length - cap) : next;
            });
            bufferRef.current = [];
          }
        }
        lastFlush = now;
      }
      rafId = requestAnimationFrame(flush);
    }

    return () => {
      closed = true;
      source.close();
      cancelAnimationFrame(rafId);
    };
  }, [path]);

  return { data, status, meta };
}
