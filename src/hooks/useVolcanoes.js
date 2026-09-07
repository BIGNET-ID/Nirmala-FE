'use client';

import { useEffect, useState } from 'react';
import { LAYER_STATUS } from '@/constants/layerStatus';

/**
 * Indonesian volcano locations (natural=volcano nodes, via Overpass —
 * proxied/cached server-side by /api/volcanoes, see that route for why).
 * Static geographic data — fetched once while `active`, no repeating
 * refresh interval (unlike useBmkgWeather's 30-min poll for genuinely
 * live weather data).
 *
 * Falls back to the captured-real-response fixture on failure, same
 * resilience convention as nirmalaApiService's methods.
 *
 * Overpass's `name` tag is missing on some nodes (dropped, "Unnamed
 * volcano" isn't useful). Several other name patterns are dropped for the
 * same reason — not the named volcano/peak this feature is meant to
 * surface:
 *  - "Kawah ..." (Indonesian for "crater") — a minor crater feature.
 *  - "Bledug ..." — Javanese mud volcanoes (Bledug Kuwu etc.), not
 *    magmatic volcanoes.
 *  - "Way Belerang ..." — a sulfur spring/geothermal feature, not a peak.
 *  - the bare name "Malintang" — a duplicate Overpass node for the same
 *    location as "Gunung Malintang" (near-identical coordinates), tagged
 *    without the "Gunung" prefix; the exact-match check keeps "Gunung
 *    Malintang" itself.
 * Filtered here (not server-side in the route) so both the live-API and
 * fixture-fallback paths get the same treatment from one place.
 */
function filterVolcanoes(list) {
  return list.filter((v) => {
    if (!v.name) return false;
    const name = v.name.toLowerCase();
    if (name === 'malintang') return false;
    return !['kawah', 'bledug', 'way belerang'].some((prefix) => name.includes(prefix));
  });
}

export function useVolcanoes(active) {
  const [volcanoes, setVolcanoes] = useState([]);
  const [status, setStatus] = useState(LAYER_STATUS.IDLE);

  useEffect(() => {
    if (!active) { setStatus(LAYER_STATUS.IDLE); return; }
    if (volcanoes.length) return; // already loaded — static data, no need to refetch
    let alive = true;

    (async () => {
      setStatus(LAYER_STATUS.LOADING);
      try {
        const r = await fetch('/api/volcanoes', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        const list = filterVolcanoes(Array.isArray(data?.volcanoes) ? data.volcanoes : []);
        setVolcanoes(list);
        setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
      } catch (err) {
        console.warn('[useVolcanoes] /api/volcanoes unavailable, using fixture:', err.message);
        try {
          const r = await fetch('/fixtures/volcanoes.json', { cache: 'no-store' });
          const data = await r.json();
          if (!alive) return;
          const list = filterVolcanoes(Array.isArray(data?.volcanoes) ? data.volcanoes : []);
          setVolcanoes(list);
          setStatus(list.length ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY);
        } catch (fixtureErr) {
          if (!alive) return;
          console.warn('[useVolcanoes] fixture also unavailable:', fixtureErr.message);
          setStatus(LAYER_STATUS.ERROR);
        }
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { volcanoes, status };
}
