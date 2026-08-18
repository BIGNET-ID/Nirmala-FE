'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * OpenWeather weather-tile overlay on the Google Maps base.
 * `layer` is an OpenWeather layer id (precipitation_new | clouds_new | wind_new)
 * or null to show none. Tiles are fetched via the same-origin /api/owm proxy so
 * the OpenWeather key stays server-side. Rendered below our OverlayView sensor
 * heatmap/dots (map tile plane), so sensor data still reads on top.
 */
export default function OpenWeatherLayer({ layer, opacity = 0.75 }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google || !layer) return;

    const type = new window.google.maps.ImageMapType({
      name: 'openweather',
      tileSize: new window.google.maps.Size(256, 256),
      opacity,
      minZoom: 0,
      maxZoom: 19,
      getTileUrl: (coord, zoom) => {
        const n = 1 << zoom;
        const x = ((coord.x % n) + n) % n; // wrap horizontally
        if (coord.y < 0 || coord.y >= n) return null;
        return `/api/owm/${layer}/${zoom}/${x}/${coord.y}`;
      },
    });

    map.overlayMapTypes.push(type);

    return () => {
      const arr = map.overlayMapTypes;
      for (let i = arr.getLength() - 1; i >= 0; i--) {
        if (arr.getAt(i) === type) { arr.removeAt(i); break; }
      }
    };
  }, [map, layer, opacity]);

  return null;
}
