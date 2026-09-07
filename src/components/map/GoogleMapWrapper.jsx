'use client';

import React from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import {
  MAP_CENTER, MAP_ZOOM_DEFAULT, MAP_BOUNDS_ASIA, MAP_MIN_ZOOM, MAP_MAX_ZOOM,
} from '@/constants/mapConfig';
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

// SnazzyMaps custom style (user-provided), used verbatim for dark mode.
const MAP_STYLE_DARK = [
    {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "saturation": 36
            },
            {
                "color": "#000000"
            },
            {
                "lightness": 40
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "visibility": "on"
            },
            {
                "color": "#000000"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 17
            },
            {
                "weight": 1.2
            }
        ]
    },
    {
        "featureType": "administrative.country",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "gamma": "2.4"
            },
            {
                "color": "#6e6e6e"
            },
            {
                "invert_lightness": true
            }
        ]
    },
    {
        "featureType": "administrative.province",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#fbfbfb"
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "landscape.natural.landcover",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4f4f4f"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 21
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#252525"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 29
            },
            {
                "weight": 0.2
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 18
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "transit",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 19
            }
        ]
    },
    {
        "featureType": "transit.line",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#aba3a3"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#02011a"
            }
        ]
    }
];

// "Outline" map type — line/boundary-only, no fills/labels/POI clutter.
// Stays on mapTypeId 'roadmap' (see below) and re-styles it; still follows
// whichever light/dark theme is active, it's a map TYPE choice, not a
// second place to change theme (that stays owned by ThemeToggleControl).
const MAP_STYLE_OUTLINE_LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#94a3b8' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#64748b' }, { weight: 1.4 }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  // Coastlines otherwise disappear entirely (land/water fills are near-
  // identical tones) — stroke both sides of that boundary so every island,
  // however small, still reads as a shape rather than empty space.
  { featureType: 'landscape', elementType: 'geometry.stroke', stylers: [{ color: '#94a3b8' }, { weight: 1 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#dbeafe' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#94a3b8' }, { weight: 1 }] },
];

const MAP_STYLE_OUTLINE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#050811' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3b4a63' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#5b6b82' }, { weight: 1.4 }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#050811' }] },
  // Coastlines otherwise disappear entirely (land/water fills are near-
  // identical tones) — stroke both sides of that boundary so every island,
  // however small, still reads as a shape rather than empty space.
  { featureType: 'landscape', elementType: 'geometry.stroke', stylers: [{ color: '#5b6b82' }, { weight: 1 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0b1220' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#5b6b82' }, { weight: 1 }] },
];

export default function GoogleMapWrapper({ children, onMapLoad, mapType = 'roadmap' }) {
  const { mode } = useThemeMode();
  // Satellite ignores `styles` entirely — Google's own platform behavior,
  // imagery can't be recolored — so this only matters for roadmap/outline.
  const styles = mapType === 'outline'
    ? (mode === 'dark' ? MAP_STYLE_OUTLINE_DARK : MAP_STYLE_OUTLINE_LIGHT)
    : (mode === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);
  const mapTypeId = mapType === 'satellite' ? 'satellite' : 'roadmap';

  return (
    // Wrap in our own div rather than passing className to <Map> — that prop
    // replaces (not merges with) the library's own sizing class internally,
    // which silently zeroes the map's height.
    <APIProvider apiKey={API_KEY}>
      <div className="nirmala-gmap" style={{ width: '100%', height: '100%' }}>
        <Map
          defaultCenter={MAP_CENTER}
          defaultZoom={MAP_ZOOM_DEFAULT}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          mapTypeId={mapTypeId}
          styles={styles}
          disableDefaultUI={true}
          gestureHandling="greedy"
          onIdle={(e) => onMapLoad?.(e.map)}
          // Regional restriction (Indonesia + wider Asia) — also keeps the
          // world from wrapping into repeated copies at low zoom.
          restriction={{
            latLngBounds: MAP_BOUNDS_ASIA,
            strictBounds: true,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
        </Map>
      </div>
    </APIProvider>
  );
}