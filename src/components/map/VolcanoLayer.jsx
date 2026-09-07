'use client';

import { Marker } from '@vis.gl/react-google-maps';

/**
 * Indonesian volcano markers — one `<Marker>` per point (from
 * `@vis.gl/react-google-maps`, the same library GoogleMapWrapper.jsx
 * already uses for `<Map>`), rendering fa6-solid's "volcano" glyph as a
 * `google.maps.Symbol` path icon.
 *
 * A raw hand-rolled `google.maps.OverlayView` subclass (matching
 * BmkgRainLayer.jsx's canvas-layer pattern) was tried first and abandoned:
 * verified directly, extensively, that its `onAdd()` lifecycle callback
 * never fires for a freshly-constructed OverlayView in this app — not even
 * for a bare minimal OverlayView with zero React effect/cleanup
 * entanglement, ruling out a StrictMode double-invoke race as the cause. A
 * plain `new google.maps.Marker(...)` (confirmed via the same live
 * debugging) DOES reliably attach and render, so the library's declarative
 * `<Marker>` wrapper around that same proven-working class is used here
 * instead — a few hundred points is well within what individual Marker
 * instances handle fine (this isn't the 4,500+ sensor scale that justifies
 * SensorDotLayer's canvas-dot approach).
 */

// Distinct warm red/orange, not the app's cyan accent — a volcano marker
// is a semantic hazard symbol (matches common cartographic convention),
// the same kind of exception already established for STATUS_DOT's
// amber/red states, not a second competing brand accent.
const MARKER_COLOR = '#dc2626';

// fa6-solid "volcano" glyph, verbatim (fetched from Iconify's API, 0-512
// viewBox) — google.maps.Symbol renders a path in its own native
// coordinate space, so this is used as-is with `scale`/`anchor` doing the
// size/positioning work, rather than hand-editing the path itself.
const VOLCANO_SVG_PATH = 'M160 144c-35.3 0-64-28.7-64-64s28.7-64 64-64c15.7 0 30 5.6 41.2 15C212.4 12.4 232.7 0 256 0s43.6 12.4 54.8 31c11.2-9.4 25.5-15 41.2-15c35.3 0 64 28.7 64 64s-28.7 64-64 64c-14.7 0-28.3-5-39.1-13.3l-32 48C275.3 187 266 192 256 192s-19.3-5-24.9-13.3l-32-48C188.3 139 174.7 144 160 144m-16 208l48.4-24.2c10.2-5.1 21.6-7.8 33-7.8c19.6 0 38.4 7.8 52.2 21.6l32.5 32.5c6.3 6.3 14.9 9.9 23.8 9.9c11.3 0 21.8-5.6 28-15l9.7-14.6l-58.9-66.3c-9.1-10.2-22.2-16.1-35.9-16.1H235c-13.7 0-26.8 5.9-35.9 16.1l-59.9 67.4zm19.4-95.8c18.2-20.5 44.3-32.2 71.8-32.2H277c27.4 0 53.5 11.7 71.8 32.2l150.2 169c8.5 9.5 13.2 21.9 13.2 34.7c0 28.8-23.4 52.2-52.2 52.2L52.2 512C23.4 512 0 488.6 0 459.8c0-12.8 4.7-25.1 13.2-34.7l150.2-169z';

export default function VolcanoLayer({ volcanoes, onSelect }) {
  return (
    <>
      {volcanoes.map((volcano) => (
        <Marker
          key={volcano.id}
          position={{ lat: volcano.lat, lng: volcano.lng }}
          title={volcano.name || 'Unnamed volcano'}
          icon={{
            path: VOLCANO_SVG_PATH,
            fillColor: MARKER_COLOR,
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: '#7f1d1d',
            scale: 0.035, // 512-unit path -> ~18px rendered icon
            anchor: { x: 256, y: 460 }, // path's own coordinate space, base of the icon
          }}
          onClick={(e) => {
            const domEvent = e.domEvent;
            onSelect?.(volcano, domEvent?.clientX ?? 0, domEvent?.clientY ?? 0);
          }}
        />
      ))}
    </>
  );
}
