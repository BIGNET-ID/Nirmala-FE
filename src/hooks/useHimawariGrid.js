'use client';

import { useEffect, useRef, useState } from 'react';
import { nirmalaApiService } from '@/lib/nirmalaApi';
import { buildHimawariTicks } from '@/lib/timeTravelRange';

const POLL_MS = 5 * 60 * 1000; // frames update roughly every period_min (~10min upstream)

/** Polls /api/grid while `active`, exposing frame ticks + the fixed bounds box. */
export function useHimawariGrid(active) {
  const [grid, setGrid] = useState(null); // raw manifest
  const intervalRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const poll = async () => {
      const res = await nirmalaApiService.getHimawariGrid();
      if (!cancelled && res) setGrid(res);
    };
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      intervalRef.current = 0;
    };
  }, [active]);

  const ticks = grid ? buildHimawariTicks(grid.frames) : [];
  return {
    ticks, // [{ date, url }], ascending
    bounds: grid?.bounds || null,
    region: grid?.region || null,
    loading: active && !grid,
  };
}
