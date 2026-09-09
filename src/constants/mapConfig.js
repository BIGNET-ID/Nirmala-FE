// National Indonesia view — wide enough to show Sabang to Merauke in one frame.
// This is the floor: the dashboard may zoom out further to match the manifest,
// but never zooms in tighter than this on initial load (see page.jsx).
export const MAP_CENTER = { lat: -2.5, lng: 118 };
export const MAP_ZOOM_DEFAULT = 5;
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || '';

// Regional pan restriction — tightened to Indonesia + a deliberately
// generous buffer, replacing the old wide Asia box (north:55) that let
// users pan as far as China. north:15/south:-20 alone already excludes
// China (whose southernmost point, Hainan, sits ~18°N) — that's the axis
// that actually answers the "don't show China" complaint.
//
// The buffer on ALL sides (not just north) is required for an unrelated
// reason, confirmed empirically: `strictBounds:true` on <Map> forces
// Google to silently raise the effective zoom above MAP_ZOOM_DEFAULT
// whenever this box is narrower than what the current viewport would show
// at that zoom — which breaks Himawari's default view (JMA only serves
// tiles at zoom 3-5). A first attempt at Indonesia's literal extent
// ({north:8, south:-12, west:94, east:142}) forced zoom 6 even at a plain
// 1280px-wide window; widening only east/west ({west:75, east:165}) fixed
// 1280px but still forced zoom 6 at 1920px (this app's own "WallTV"
// breakpoint) — the latitude span was the actual binding constraint, not
// longitude. This wider box (north:15/south:-20/west:70/east:170) was
// verified to hold zoom 5 at both 1280px and 1920px browser widths.
export const MAP_BOUNDS_INDONESIA = { north: 15, south: -20, west: 70, east: 170 };

// Max zoom-OUT, same for every layer (lower number = further out, so this
// is a MIN zoom value in Google Maps terms). Matches Himawari's own floor —
// JMA only publishes tiles at zoom 3-5 (see HimawariLayer.jsx), so this
// can't go tighter than 3 without cutting off part of Himawari's range.
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 17;

// Rain Density's admin-region layer (AdminRegionLayer.jsx) only makes sense
// once the viewport is small enough that individual kecamatan polygons are
// legible and not too numerous to fetch/render cheaply — below this zoom,
// Rain Density keeps showing the existing KDE blob (CanvasOverlay.jsx)
// instead. Estimate, not yet visually verified — mirrors RAIN_KM/RAIN_MIN/
// RAIN_MAX in CanvasOverlay.jsx, which went through the same "guess, then
// verify in-browser" tuning pass earlier in this project.
export const REGION_LAYER_MIN_ZOOM = 10;