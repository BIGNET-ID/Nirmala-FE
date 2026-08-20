// National Indonesia view — wide enough to show Sabang to Merauke in one frame.
// This is the floor: the dashboard may zoom out further to match the manifest,
// but never zooms in tighter than this on initial load (see page.jsx).
export const MAP_CENTER = { lat: -2.5, lng: 118 };
export const MAP_ZOOM_DEFAULT = 5;
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '';