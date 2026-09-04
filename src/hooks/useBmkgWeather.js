'use client';

import { useEffect, useState } from 'react';
import { nirmalaApiService } from '@/lib/nirmalaApi';
import { LAYER_STATUS } from '@/constants/layerStatus';

// BMKG's own cache_ttl_s is 7200 (2h) — polling more often than that just
// re-fetches the same cached snapshot, so this stays comfortably under it.
const REFRESH_MS = 30 * 60 * 1000;

function extractLastSynced(kabupaten) {
  const times = kabupaten
    .map((k) => new Date(k?.now?.datetime_wib))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) return null;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

/**
 * Fetches BMKG's official per-kabupaten "now" weather snapshot
 * (nirmalaApiService.getBmkgCuaca()) only while `active` (the BMKG ground
 * mode is selected) — same "only fetch while the mode is on" pattern as
 * useJmaHimawariTicks. See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 */
export function useBmkgWeather(active) {
  const [kabupaten, setKabupaten] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [status, setStatus] = useState(LAYER_STATUS.IDLE);

  useEffect(() => {
    if (!active) { setStatus(LAYER_STATUS.IDLE); return; }
    let alive = true;
    let timer = null;

    const load = async () => {
      setStatus((prev) => (prev === LAYER_STATUS.IDLE ? LAYER_STATUS.LOADING : prev));
      try {
        const response = await nirmalaApiService.getBmkgCuaca();
        if (!alive) return;
        const list = Array.isArray(response?.kabupaten) ? response.kabupaten : [];
        setKabupaten(list);
        setLastSyncedAt(extractLastSynced(list));
        setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
      } catch (err) {
        if (!alive) return;
        console.warn('[useBmkgWeather] failed to load BMKG cuaca:', err);
        setStatus(LAYER_STATUS.ERROR);
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };

    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [active]);

  return { kabupaten, lastSyncedAt, status };
}
