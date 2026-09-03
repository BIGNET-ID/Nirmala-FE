'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { mmToT } from '@/lib/rainRamp';

/**
 * Rain-density heatmap with a coverage base, both gated by `showCoverage`
 * (BIGNET DS v19) — this whole overlay is the "Cakupan Sensor" toggle's
 * layer; "Titik Sensor" (SensorDotLayer) is a fully independent dot layer
 * with no heatmap involvement.
 *
 * Two layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every operationally-active sensor (active or
 *    raining — i.e. not blacklisted/inactive/unavailable) emits a faint
 *    kernel → shows the live sensor network regardless of rain.
 *  - RAIN (dominant, cool→hot): real OpenWeather mm/h precipitation,
 *    grid-sampled (see src/app/api/wind/route.js's `rain` field), painted
 *    as a tiny raster sized to the grid's own resolution and smoothly
 *    upscaled via ctx.drawImage — not sensor-derived, see drawRainField.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Coverage technique = heatmap.js: greyscale alpha kernels → colourize via a
 * 1×256 LUT. Rain technique = direct per-grid-cell colorize, no kernels.
 */

const COVER_KM = 22;
const COVER_MIN = 8, COVER_MAX = 42;
const POINT_ALPHA = 0.5;
const RAIN_MAX_ALPHA = 220;   // rain fill's max opacity (0-255 scale)
const COVER_MAX_ALPHA = 90;   // subtle — network base, never competes with rain

// Full meteorological precipitation spectrum (Windy/BMKG-style), matching
// --rain-1..6 in globals.css and ColorRampLegend's tick labels. Approved
// exception to "no rainbow" in AGENTS.md design guardrails — this follows
// a recognized weather-platform convention and is always shown with a
// numeric mm/h tick legend (0 / 2.5 / 7.6 / 50+ mm/h), not decoration.
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];
// Neutral teal for the "normal / dry sensor network".
const COVER_RAMP = [
  [0.00, [20, 70, 110]], [1.00, [64, 180, 205]],
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
const COVER_LUT = buildLUT(COVER_RAMP);

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function drawKernels(sctx, W, H, pts, radius) {
  sctx.clearRect(0, 0, W, H);
  for (const [x, y] of pts) {
    const g = sctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${POINT_ALPHA})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(x, y, radius, 0, Math.PI * 2);
    sctx.fill();
  }
}

/** Colourize the shadow's alpha channel through a LUT into a layer canvas. */
function colourizeInto(layer, shadow, W, H, lut, maxAlpha) {
  const sctx = shadow.getContext('2d');
  const img = sctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;
    const li = alpha * 3;
    d[i] = lut[li];
    d[i + 1] = lut[li + 1];
    d[i + 2] = lut[li + 2];
    d[i + 3] = alpha > maxAlpha ? maxAlpha : alpha;
  }
  layer.width = W; layer.height = H;
  layer.getContext('2d').putImageData(img, 0, 0);
}

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

function renderHeatmap(canvas, shadow, coolLayer, rainFieldCanvas, stations, projection, map, showCoverage, rainField, rainAmbientField) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!map) return;

  // 1) coverage base (teal, subtle) — sensor-derived, gated by the
  // "Sensor Coverage" toggle. Drawn first, underneath.
  if (showCoverage) {
    const zoom = map.getZoom();
    const lat = map.getCenter()?.lat() ?? 0;
    const mpp = metersPerPixel(lat, zoom);
    const coverR = Math.max(COVER_MIN, Math.min(COVER_MAX, (COVER_KM * 1000) / mpp));

    // Any operationally-live sensor (active or currently raining — i.e. not
    // blacklisted/inactive/unavailable) counts toward coverage now that rain
    // is no longer sensor-derived — a raining sensor is still part of the
    // live network, so it's no longer excluded from this base layer the way
    // the old wet/dry split required.
    const dry = [];
    for (const st of stations) {
      const isLive = !st.blacklisted && st.status !== 'blacklisted' && !st.inactive && !st.unavailable;
      if (!isLive) continue;
      const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
      const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
      if (x < -coverR || x > W + coverR || y < -coverR || y > H + coverR) continue;
      dry.push([x, y]);
    }

    if (dry.length) {
      shadow.width = W; shadow.height = H;
      const sctx = shadow.getContext('2d');
      drawKernels(sctx, W, H, dry, coverR);
      colourizeInto(coolLayer, shadow, W, H, COVER_LUT, COVER_MAX_ALPHA);
      ctx.drawImage(coolLayer, 0, 0);
    }
  }

  // 2) rain intensity (real OpenWeather mm/h) — always drawn, independent
  // of the sensor-based coverage toggle; drawRainField's own null-field
  // guard handles "no data yet" gracefully.
  drawRainField(ctx, rainFieldCanvas, rainField || rainAmbientField, projection, canvas._offsetX, canvas._offsetY);
}

export default function CanvasHeatmapOverlay({ stations, showCoverage = true, rainField = null, rainAmbientField = null }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const coolRef = useRef(null);
  const rainFieldCanvasRef = useRef(null);
  const stationsRef = useRef(stations);
  const coverageRef = useRef(showCoverage);
  const rainFieldRef = useRef(rainField);
  const rainAmbientFieldRef = useRef(rainAmbientField);
  const rafRef = useRef(0);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { coverageRef.current = showCoverage; }, [showCoverage]);
  useEffect(() => { rainFieldRef.current = rainField; }, [rainField]);
  useEffect(() => { rainAmbientFieldRef.current = rainAmbientField; }, [rainAmbientField]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    shadowRef.current = document.createElement('canvas');
    coolRef.current = document.createElement('canvas');
    rainFieldCanvasRef.current = document.createElement('canvas');

    const scheduleDraw = (fn) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; fn(); });
    };

    class HeatmapOverlay extends window.google.maps.OverlayView {
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
        scheduleDraw(() =>
          renderHeatmap(canvas, shadowRef.current, coolRef.current, rainFieldCanvasRef.current,
            stationsRef.current, projection, map, coverageRef.current,
            rainFieldRef.current, rainAmbientFieldRef.current)
        );
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new HeatmapOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?.draw(); }, [stations, showCoverage, rainField, rainAmbientField]);

  return null;
}
