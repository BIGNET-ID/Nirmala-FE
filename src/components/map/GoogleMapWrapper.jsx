'use client';

import React from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';
import { useThemeMode } from '@/context/ThemeModeContext';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Near-black navy command-center style (BIGNET DS v19: --nirmala-map-bg #050811).
 * NOTE: inline `styles` only apply to raster maps — a `mapId` would force Google
 * cloud styling and ignore this array, so we intentionally omit `mapId`.
 * (AdvancedMarker requires a mapId; sensor points move to a canvas dot layer in
 * a later phase, so no mapId is needed here.)
 */
// Clean, muted light basemap for light mode.
const MAP_STYLE_LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5f6368' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#c7d2e0' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cdd9e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8ea3c2' }] },
];

const MAP_STYLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0a1120' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a5a72' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050811' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#16213a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#7f93b0' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8ea3c2' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#1a2740' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#141d30' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1b2d47' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050811' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#26364f' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#050811' }] },
];

export default function GoogleMapWrapper({ children, onMapLoad }) {
  const { mode } = useThemeMode();
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={MAP_CENTER}
        defaultZoom={MAP_ZOOM_DEFAULT}
        styles={mode === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        disableDefaultUI={true}
        gestureHandling="greedy"
        onIdle={(e) => onMapLoad?.(e.map)}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </Map>
    </APIProvider>
  );
}