'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Himawari (JMA) satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile
 * pyramid), JMA returns ONE static JPEG per timestamp covering a fixed
 * lat/lng box — so this uses google.maps.GroundOverlay, not ImageMapType.
 *
 * JMA has no manifest telling us which timestamps actually have a published
 * image (unlike the old bignet API), and the newest frame is sometimes not
 * published yet when we ask for it. `candidateUrls` lets the caller supply a
 * fallback chain (newest first) — this preloads each with a plain Image()
 * (not GroundOverlay directly) so a 404 can be caught and the next
 * candidate tried, instead of silently showing a blank overlay.
 */
export default function HimawariLayer({ active, candidateUrls = [], bounds, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google || !active || !candidateUrls.length || !bounds) {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    onStatus?.('loading');

    const tryCandidate = (i) => {
      if (i >= candidateUrls.length) {
        if (cancelled) return;
        overlayRef.current?.setMap(null);
        overlayRef.current = null;
        onStatus?.('unavailable');
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const gmBounds = new window.google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        overlayRef.current?.setMap(null);
        const overlay = new window.google.maps.GroundOverlay(candidateUrls[i], gmBounds, { opacity });
        overlay.setMap(map);
        overlayRef.current = overlay;
        onStatus?.('ok');
      };
      img.onerror = () => { if (!cancelled) tryCandidate(i + 1); };
      img.src = candidateUrls[i];
    };
    tryCandidate(0);

    return () => {
      cancelled = true;
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
    };
  }, [map, active, candidateUrls, bounds, opacity, onStatus]);

  return null;
}
