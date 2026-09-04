'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { mmToT } from '@/lib/rainRamp';

/**
 * OpenWeather "Rain" toggle overlay — a self-drawn rainbow raster from real
 * per-point OpenWeather mm/h data (see src/app/api/wind/route.js's `rain`
 * field), replacing OpenWeather's own flat-blue precipitation_new tile.
 * Independent of ground-layer selection (Rain Density/Mesh/Himawari) — its
 * only visibility control is the `show` prop (owmLayer === 'rain' in
 * page.jsx). Structurally a sibling of OpenWeatherLayer.jsx (the raw-tile
 * component, used for Clouds), not a modification of it.
 *
 * Not related to "Rain Density" (CanvasOverlay.jsx), which stays
 * sensor-based (binary is_raining) and is unaffected by this component.
 */

const RAIN_MAX_ALPHA = 220; // rain fill's max opacity (0-255 scale)

// Full meteorological precipitation spectrum (Windy/BMKG-style) — approved
// exception to "no rainbow" in AGENTS.md design guardrails, paired with a
// numeric mm/h tick legend (METRICS.openweatherRain in constants/metrics.js).
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

/**
 * Paints `field.rain` (mm/h, one value per grid cell) into `fieldCanvas` at
 * the field's own native resolution — no manual interpolation needed, since
 * ctx.drawImage's own bilinear upscaling smooths between cells when this
 * tiny canvas gets stretched onto the main overlay canvas below. Field row
 * j=0 is the SOUTH edge (see route.js's sampleGrid), so it's written to the
 * BOTTOM canvas row (ny-1-j) to keep north-at-top orientation.
 */
function paintRainFieldCanvas(fieldCanvas, field) {
  const { nx, ny, rain } = field;
  fieldCanvas.width = nx;
  fieldCanvas.height = ny;
  const fctx = fieldCanvas.getContext('2d');
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t = mmToT(rain[j * nx + i]);
      const idx = Math.round(t * 255);
      const r = RAIN_LUT[idx * 3], g = RAIN_LUT[idx * 3 + 1], b = RAIN_LUT[idx * 3 + 2];
      const alpha = t * (RAIN_MAX_ALPHA / 255);
      fctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      fctx.fillRect(i, ny - 1 - j, 1, 1);
    }
  }
}

/** Draws whichever rain field is available (dense preferred, ambient
 * fallback) onto the main canvas, scaled to its own geographic bounds. */
function drawRainField(ctx, fieldCanvas, field, projection, offsetX, offsetY) {
  if (!field || !field.nx || !field.ny || !field.rain?.length) return;
  paintRainFieldCanvas(fieldCanvas, field);

  const { bounds: B, nx, ny } = field;
  // google.maps.LatLng normalizes lng into [-180, 180) — an east edge of
  // exactly 180 silently wraps to -180 (equal to the west edge), collapsing
  // destW to 0 and making the whole draw disappear via the guard below.
  // Clamp just under 180 so a world-spanning field (e.g. the ambient grid,
  // AMBIENT_BOUNDS in route.js) still projects to a real width.
  const eastLng = B.east >= 180 ? 179.999 : B.east;
  const nw = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.north, B.west));
  const se = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(B.south, eastLng));
  const destX = nw.x - offsetX, destY = nw.y - offsetY;
  const destW = se.x - nw.x, destH = se.y - nw.y;
  if (destW <= 0 || destH <= 0) return;
  ctx.drawImage(fieldCanvas, 0, 0, nx, ny, destX, destY, destW, destH);
}

export default function OpenWeatherRainLayer({ show = false, field = null, ambientField = null }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldCanvasRef = useRef(null);
  const showRef = useRef(show);
  const fieldRef = useRef(field);
  const ambientFieldRef = useRef(ambientField);

  useEffect(() => { showRef.current = show; }, [show]);
  useEffect(() => { fieldRef.current = field; }, [field]);
  useEffect(() => { ambientFieldRef.current = ambientField; }, [ambientField]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    fieldCanvasRef.current = document.createElement('canvas');

    const render = () => {
      const projection = overlayRef.current?.getProjection();
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!projection || !showRef.current) return;
      const activeField = fieldRef.current || ambientFieldRef.current;
      drawRainField(ctx, fieldCanvasRef.current, activeField, projection, canvas._offsetX, canvas._offsetY);
    };

    class RainOverlay extends window.google.maps.OverlayView {
      onAdd() { this.getPanes().overlayLayer.appendChild(canvas); }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const bounds = map.getBounds();
        if (!bounds) return;
        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
        const left = Math.min(sw.x, ne.x), top = Math.min(sw.y, ne.y);
        canvas.width = Math.ceil(Math.abs(ne.x - sw.x));
        canvas.height = Math.ceil(Math.abs(sw.y - ne.y));
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas._offsetX = left;
        canvas._offsetY = top;
        render();
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new RainOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._render = render;

    return () => { overlay.setMap(null); };
  }, [map]);

  useEffect(() => { overlayRef.current?._render?.(); }, [show, field, ambientField]);

  return null;
}
