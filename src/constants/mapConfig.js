// National Indonesia view — matches Nirmala manifest default_map (lat -2.5, lng 118, zoom 6.5).
// Fallback values only: the dashboard overrides these with the live manifest once it resolves.
export const MAP_CENTER = { lat: -2.5, lng: 118 };
export const MAP_ZOOM_DEFAULT = 6.5;
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '';