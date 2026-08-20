'use client';

import { useEffect, useRef, useState } from 'react';
import { LAYER_STATUS } from '@/constants/layerStatus';

const REFRESH_MS = 20 * 60 * 1000;
const RETRY_MS = 30 * 1000;

/**
 * Fetches the /api/wind vector field and reports a status a UI can react to,
 * instead of silently staying blank forever on a failed/missing key (see
 * src/app/api/wind/route.js). Retries quickly on error rather than waiting
 * out the full refresh interval.
 */
export function useWindField() {
  const [field, setField] = useState(null);
  const [status, setStatus] = useState(LAYER_STATUS.LOADING);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const schedule = (delay) => {
      if (!alive) return;
      timer = setTimeout(load, delay);
    };

    const load = async () => {
      try {
        const r = await fetch('/api/wind', { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) {
          setStatus(LAYER_STATUS.ERROR);
          schedule(RETRY_MS);
          return;
        }
        const data = await r.json();
        if (!alive) return;
        if (!data?.u?.length) {
          setField(null);
          setStatus(LAYER_STATUS.EMPTY);
        } else {
          setField(data);
          setStatus(LAYER_STATUS.OK);
        }
        schedule(REFRESH_MS);
      } catch {
        if (!alive) return;
        setStatus(LAYER_STATUS.ERROR);
        schedule(RETRY_MS);
      }
    };

    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  return { field, status };
}
