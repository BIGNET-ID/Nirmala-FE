// National Indonesia view — wide enough to show Sabang to Merauke in one frame.
// This is the floor: the dashboard may zoom out further to match the manifest,
// but never zooms in tighter than this on initial load (see page.jsx).
export const MAP_CENTER = { lat: -2.5, lng: 118 };
export const MAP_ZOOM_DEFAULT = 5;
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '';

// Regional pan restriction — Indonesia + wider Asia (SE/E/S Asia), not the
// whole globe. Keeps the map from panning to Europe/Africa/the Americas.
export const MAP_BOUNDS_ASIA = { north: 55, south: -15, west: 60, east: 150 };

// Max zoom-OUT, same for every layer (lower number = further out, so this
// is a MIN zoom value in Google Maps terms). Matches Himawari's own floor —
// JMA only publishes tiles at zoom 3-5 (see HimawariLayer.jsx), so this
// can't go tighter than 3 without cutting off part of Himawari's range.
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 17;