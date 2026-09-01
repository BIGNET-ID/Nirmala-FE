'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Rain-density heatmap with a coverage base, both gated by `showCoverage`
 * (BIGNET DS v19) — this whole overlay is the "Cakupan Sensor" toggle's
 * layer; "Titik Sensor" (SensorDotLayer) is a fully independent dot layer
 * with no heatmap involvement.
 *
 * The live feed is BINARY (is_raining) — no numeric intensity to interpolate.
 * Two honest density layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every ACTIVE, non-raining sensor emits a faint
 *    kernel → shows the live sensor network even when it isn't raining.
 *  - RAIN (dominant, cool→hot): every RAINING sensor emits a stronger kernel;
 *    overlaps accumulate → isolated rain = modest, clustered rain = hot core.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Technique = heatmap.js: greyscale alpha kernels → colourize via a 1×256 LUT.
 */

const RAIN_KM = 35;
const RAIN_MIN = 14, RAIN_MAX = 90;
const COVER_KM = 22;
const COVER_MIN = 8, COVER_MAX = 42;
const POINT_ALPHA = 0.5;
const RAIN_MAX_ALPHA = 220;
const COVER_MAX_ALPHA = 90;   // subtle — network base, never competes with rain

// Full meteorological precipitation spectrum (Windy/BMKG-style), matching
// --rain-1..6 in globals.css and ColorRampLegend's tick labels. Approved
// exception to "no rainbow" in AGENTS.md design guardrails — this follows
// a recognized weather-platform convention and is always shown with a
// qualitative tick legend (Rendah/Sedang/Tinggi/Ekstrem), not decoration.
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

function renderHeatmap(canvas, shadow, coolLayer, warmLayer, stations, projection, map, showCoverage) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!showCoverage || !stations.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const rainR = Math.max(RAIN_MIN, Math.min(RAIN_MAX, (RAIN_KM * 1000) / mpp));
  const coverR = Math.max(COVER_MIN, Math.min(COVER_MAX, (COVER_KM * 1000) / mpp));
  const pad = Math.max(rainR, coverR);

  const wet = [], dry = [];
  for (const st of stations) {
    const isActive = !st.blacklisted && !st.inactive && !st.unavailable && st.status === 'active';
    if (!st.isRaining && !isActive) continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    if (st.isRaining) wet.push([x, y]);
    else if (isActive) dry.push([x, y]);
  }

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');

  // 1) coverage base (teal, subtle) — drawn first, underneath.
  if (dry.length) {
    drawKernels(sctx, W, H, dry, coverR);
    colourizeInto(coolLayer, shadow, W, H, COVER_LUT, COVER_MAX_ALPHA);
    ctx.drawImage(coolLayer, 0, 0);
  }
  // 2) rain density (cool→hot, dominant) — composited on top.
  if (wet.length) {
    drawKernels(sctx, W, H, wet, rainR);
    colourizeInto(warmLayer, shadow, W, H, RAIN_LUT, RAIN_MAX_ALPHA);
    ctx.drawImage(warmLayer, 0, 0);
  }
}

export default function CanvasHeatmapOverlay({ stations, showCoverage = true }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const coolRef = useRef(null);
  const warmRef = useRef(null);
  const stationsRef = useRef(stations);
  const coverageRef = useRef(showCoverage);
  const rafRef = useRef(0);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { coverageRef.current = showCoverage; }, [showCoverage]);

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
    warmRef.current = document.createElement('canvas');

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
          renderHeatmap(canvas, shadowRef.current, coolRef.current, warmRef.current,
            stationsRef.current, projection, map, coverageRef.current)
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

  useEffect(() => { overlayRef.current?.draw(); }, [stations, showCoverage]);

  return null;
}
