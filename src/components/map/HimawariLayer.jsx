'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Himawari satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile pyramid),
 * the grid API returns ONE static PNG per timestamp covering a fixed lat/lng
 * box — so this uses google.maps.GroundOverlay, not ImageMapType.
 */
export default function HimawariLayer({ active, frameUrl, bounds, opacity = 0.7 }) {
  const map = useMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google || !active || !frameUrl || !bounds) {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      return;
    }

    const gmBounds = new window.google.maps.LatLngBounds(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east },
    );
    const overlay = new window.google.maps.GroundOverlay(frameUrl, gmBounds, { opacity });
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map, active, frameUrl, bounds, opacity]);

  return null;
}
