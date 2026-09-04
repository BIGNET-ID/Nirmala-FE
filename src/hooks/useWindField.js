'use client';

import { useEffect, useRef, useState } from 'react';
import { LAYER_STATUS } from '@/constants/layerStatus';

const REFRESH_MS = 20 * 60 * 1000;
const AMBIENT_REFRESH_MS = 3 * 60 * 60 * 1000;
const RETRY_MS = 30 * 1000;

/**
 * Fetches the /api/wind vector field(s) and reports a status a UI can react
 * to, instead of silently staying blank forever on a failed/missing key
 * (see src/app/api/wind/route.js).
 *
 * The same fetch also carries a `rain` (mm/h) array per grid point — added
 * for the independent OpenWeather Rain overlay (see
 * OpenWeatherRainLayer.jsx's drawRainField), which reads
 * `field.rain`/`ambientField.rain` from the objects this hook returns. This
 * is NOT related to the sensor-based "Rain Density" ground layer
 * (CanvasOverlay.jsx), which stays qualitative and untouched by this data.
 * No separate fetch or hook exists for the rain data; it rides along with wind.
 *
 * `bounds` (optional, `{north,south,east,west}`) — the map's current
 * viewport. When present, the dense field is refetched whenever it changes
 * (the caller is expected to debounce this, e.g. on the map's `idle`
 * event — see page.jsx), so wind stays accurate wherever the user is
 * looking. A second, independent, near-global "ambient" field is fetched
 * once on mount and refreshed rarely — WindParticleLayer falls back to it
 * outside the dense field's bbox, so particles are still visible (just
 * sparser) anywhere on the map, including areas never actively viewed.
 */
export function useWindField(bounds) {
  const [field, setField] = useState(null);
  const [ambientField, setAmbientField] = useState(null);
  const [status, setStatus] = useState(LAYER_STATUS.LOADING);

  // Dense, viewport-following field.
  useEffect(() => {
    let alive = true;
    let timer = null;

    const schedule = (delay) => {
      if (!alive) return;
      timer = setTimeout(load, delay);
    };

    const load = async () => {
      try {
        const qs = bounds
          ? `?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}`
          : '';
        const r = await fetch(`/api/wind${qs}`, { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) {
          setStatus(LAYER_STATUS.ERROR);
          schedule(RETRY_MS);
          return;
        }
        const data = await r.json();
        if (!alive) return;
        if (data?.skipped) {
          // Viewport already covers a near-world span — ambient field
          // handles it, this isn't an error.
          setField(null);
          setStatus(LAYER_STATUS.OK);
        } else if (!data?.u?.length) {
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
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west]);

  // Sparse, near-global ambient field — independent of the viewport.
  useEffect(() => {
    let alive = true;
    let timer = null;

    const schedule = (delay) => {
      if (!alive) return;
      timer = setTimeout(load, delay);
    };

    const load = async () => {
      try {
        const r = await fetch('/api/wind?mode=ambient', { cache: 'no-store' });
        if (!alive) return;
        if (r.ok) {
          const data = await r.json();
          if (alive && data?.u?.length) setAmbientField(data);
          schedule(AMBIENT_REFRESH_MS);
        } else {
          schedule(RETRY_MS);
        }
      } catch {
        if (alive) schedule(RETRY_MS);
      }
    };

    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  return { field, ambientField, status };
}
