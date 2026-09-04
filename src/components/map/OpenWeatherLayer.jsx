'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * OpenWeather weather-tile overlay on the Google Maps base.
 * `layer` is an OpenWeather layer id (precipitation_new | clouds_new | wind_new)
 * or null to show none. Tiles are fetched via the same-origin /api/owm proxy so
 * the OpenWeather key stays server-side. Rendered below our OverlayView sensor
 * heatmap/dots (map tile plane), so sensor data still reads on top.
 *
 * `precipitation_new` is recolored client-side (see RainTileType below).
 * OpenWeather's raw tile is a single blue hue where alpha encodes intensity
 * (confirmed by pixel inspection: R always equals G; alpha rises with rain
 * amount) — we decode that alpha as an intensity signal and remap it
 * through Nirmala's own rainbow ramp, keeping the tile's real per-pixel
 * shape (unlike a synthetic point-grid raster) while matching the Rain
 * Density color scheme. Other layers (Clouds) render as OpenWeather sends
 * them, unmodified.
 *
 * Two extra per-pixel adjustments on top of the recolor (see processPixels):
 * OpenWeather renders each 256px tile independently server-side with no
 * cross-tile blending, so real (small) alpha discontinuities sit right at
 * tile edges — invisible in their original single-hue blue tile, but our
 * multi-hue ramp amplifies them into a visible seam. We feather each tile's
 * own edges toward transparent to soften that. Separately, the same low
 * alpha that reads fine against the near-black dark basemap all but
 * disappears against the light one, so light mode gets an opacity floor —
 * same fix pattern as sensor dots/wind particles (see
 * src/lib/sensorColor.js, WindParticleLayer.jsx).
 */

// Same rainbow spectrum as Rain Density's own ramp (RAIN_RAMP in
// CanvasOverlay.jsx) — approved "no rainbow" exception in AGENTS.md, a
// recognized meteorological precipitation-scale convention.
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];

function buildLUT(ramp) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = ramp[0], b = ramp[ramp.length - 1];
    for (let k = 0; k < ramp.length - 1; k++) {
      if (t >= ramp[k][0] && t <= ramp[k + 1][0]) { a = ramp[k]; b = ramp[k + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3]     = a[1][0] + (b[1][0] - a[1][0]) * f;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
  }
  return lut;
}

const RAIN_LUT = buildLUT(RAIN_RAMP);

const isDarkTheme = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

const TILE_SIZE = 256;
// How many pixels in from each tile edge the feather runs.
const FEATHER_PX = 16;
// Feather floor — the minimum fraction of a pixel's alpha kept at the exact
// edge. NOT 0: fading every tile's edge fully to transparent means two
// neighboring tiles both hit alpha=0 right at their shared seam, which reads
// as a hard transparent line cutting through the rain (worse than the small
// data mismatch it was meant to hide — a periodic grid of them, in fact,
// since it happens on all 4 edges of every tile). A partial floor softens
// the seam without punching a hole in it.
const FEATHER_FLOOR = 0.7;
// Light mode's minimum output alpha for any nonzero rain pixel (0-255) — a
// faint reading would otherwise round-trip through OWM_OPACITY's ~0.9
// canvas-level opacity and still be nearly invisible against a white basemap.
const LIGHT_ALPHA_FLOOR = 110;

/**
 * Recolors a precipitation tile's RGB via RAIN_LUT (keyed by the pixel's own
 * raw alpha — the intensity signal OpenWeather encodes, verified
 * empirically: R===G on every non-transparent pixel sampled, alpha rising
 * monotonically with rain amount), then adjusts the OUTPUT alpha in two
 * ways — color always reflects the real raw intensity, unaffected by either
 * adjustment below, so hue means the same thing regardless of theme or
 * position in the tile:
 *  - theme floor: dark mode keeps the real alpha; light mode raises a
 *    minimum so faint rain doesn't vanish against the white basemap.
 *  - edge feather: fades toward transparent within FEATHER_PX of any tile
 *    edge, softening the real (small) alpha discontinuity between
 *    independently-rendered OpenWeather tiles into a gradual tile-to-tile
 *    transition instead of a visible seam.
 */
function processPixels(imageData, dark) {
  const d = imageData.data;
  for (let idx = 0; idx < d.length; idx += 4) {
    const rawAlpha = d[idx + 3];
    if (rawAlpha === 0) continue;

    d[idx] = RAIN_LUT[rawAlpha * 3];
    d[idx + 1] = RAIN_LUT[rawAlpha * 3 + 1];
    d[idx + 2] = RAIN_LUT[rawAlpha * 3 + 2];

    let outAlpha = dark
      ? rawAlpha
      : Math.round(LIGHT_ALPHA_FLOOR + (255 - LIGHT_ALPHA_FLOOR) * (rawAlpha / 255));

    const pixelIndex = idx / 4;
    const x = pixelIndex % TILE_SIZE;
    const y = Math.floor(pixelIndex / TILE_SIZE);
    const distFromEdge = Math.min(x, TILE_SIZE - 1 - x, y, TILE_SIZE - 1 - y);
    if (distFromEdge < FEATHER_PX) {
      const factor = FEATHER_FLOOR + (1 - FEATHER_FLOOR) * (distFromEdge / FEATHER_PX);
      outAlpha = Math.round(outAlpha * factor);
    }

    d[idx + 3] = outAlpha;
  }
  return imageData;
}

/**
 * Custom `google.maps.MapType`-shaped tile provider (not an `ImageMapType`,
 * which only points at an image URL with no way to post-process pixels).
 * `getTile` returns a canvas synchronously (per the Maps API contract) and
 * fills it in once the underlying tile image loads.
 */
class RainTileType {
  constructor(opacity) {
    this.tileSize = new window.google.maps.Size(256, 256);
    this.opacity = opacity;
  }

  getTile(coord, zoom, ownerDocument) {
    const canvas = ownerDocument.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.opacity = this.opacity;

    const n = 1 << zoom;
    const x = ((coord.x % n) + n) % n; // wrap horizontally
    if (coord.y < 0 || coord.y >= n) return canvas; // out of range — blank tile

    // willReadFrequently: every tile does one getImageData/putImageData
    // round trip to recolor — this hints the browser to keep pixel data
    // CPU-side instead of GPU-side, avoiding a readback penalty per tile.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, 256, 256);
        ctx.putImageData(processPixels(imageData, isDarkTheme()), 0, 0);
      } catch {
        // getImageData can throw if the canvas is tainted (e.g. a proxy
        // response without the expected same-origin behavior) — leave the
        // original (uncolorized) tile drawn rather than a blank one.
      }
    };
    img.src = `/api/owm/precipitation_new/${zoom}/${x}/${coord.y}`;
    return canvas;
  }

  releaseTile() {}
}

export default function OpenWeatherLayer({ layer, opacity = 0.75 }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google || !layer) return;

    const type = layer === 'precipitation_new'
      ? new RainTileType(opacity)
      : new window.google.maps.ImageMapType({
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
