'use client';

import { useEffect, useState } from 'react';
import { LAYER_STATUS } from '@/constants/layerStatus';

/**
 * Fetches kecamatan boundary polygons for the current viewport from
 * /api/boundaries — only while `active` (Rain Density mode AND zoomed in
 * past REGION_LAYER_MIN_ZOOM, see page.jsx), refetching whenever `bounds`
 * or `zoom` changes. Same "only fetch while active" convention as
 * useVolcanoes.js/useBmkgWeather.js.
 */
export function useAdminBoundaries(bounds, zoom, active) {
  const [regions, setRegions] = useState([]);
  const [status, setStatus] = useState(LAYER_STATUS.IDLE);

  useEffect(() => {
    if (!active || !bounds) {
      setStatus(LAYER_STATUS.IDLE);
      setRegions([]);
      return;
    }
    let alive = true;

    (async () => {
      setStatus(LAYER_STATUS.LOADING);
      try {
        const qs = `?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}&zoom=${zoom}`;
        const r = await fetch(`/api/boundaries${qs}`, { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        setRegions(list);
        setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
      } catch (err) {
        if (!alive) return;
        console.warn('[useAdminBoundaries] /api/boundaries unavailable:', err.message);
        setRegions([]);
        setStatus(LAYER_STATUS.ERROR);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, zoom, active]);

  return { regions, status };
}
