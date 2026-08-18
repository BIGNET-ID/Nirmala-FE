'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Thunderstorm cells as native Google Maps polygons (BIGNET DS v19).
 * Data = GeoJSON: polygon.coordinates[0] = [[lng,lat], ...]. severe = red,
 * standard = radar purple (PRD §4.5). No mapId needed. Toggle via `show`.
 */
const SEVERE = { stroke: '#ef4444', fill: 'rgba(239,68,68,0.12)' };
const STANDARD = { stroke: '#a855f7', fill: 'rgba(168,85,247,0.12)' };

export default function ThunderstormLayer({ storms = [], show = true }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google || !show || !storms.length) return;

    const shapes = [];
    for (const s of storms) {
      const ring = s.polygon?.coordinates?.[0];
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const path = ring.map(([lng, lat]) => ({ lat, lng }));
      const c = s.severe ? SEVERE : STANDARD;

      const poly = new window.google.maps.Polygon({
        paths: path,
        strokeColor: c.stroke,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: c.stroke,
        fillOpacity: 0.12,
        clickable: false,
        map,
      });
      shapes.push(poly);

      const centroid = s.centroid?.coordinates;
      if (Array.isArray(centroid)) {
        const dot = new window.google.maps.Marker({
          position: { lat: centroid[1], lng: centroid[0] },
          map,
          clickable: false,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 3.5,
            fillColor: c.stroke,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1,
          },
          zIndex: 5,
        });
        shapes.push(dot);
      }
    }

    return () => { shapes.forEach((s) => s.setMap(null)); };
  }, [map, storms, show]);

  return null;
}
