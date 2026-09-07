'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { statusBucket } from '@/lib/sensorColor';
import { buildLUT, metersPerPixel, drawKernels, colourizeInto } from '@/lib/heatmapKernel';

/**
 * Rain-density heatmap with a coverage base (BIGNET DS v19). "Titik Sensor"
 * (SensorDotLayer) is a fully independent dot layer with no heatmap
 * involvement. The whole heatmap (both layers below) is currently hidden —
 * see HEATMAP_ENABLED below.
 *
 * The live feed is BINARY (is_raining) — no numeric intensity to interpolate.
 * Two honest density layers, each one hue = one meaning:
 *  - COVERAGE (subtle teal): every ACTIVE, non-raining sensor emits a faint
 *    kernel → shows the live sensor network even when it isn't raining.
 *  - RAIN (dominant, cool→hot): every RAINING sensor emits a stronger kernel;
 *    overlaps accumulate → isolated rain = modest, clustered rain = hot core.
 * Coverage is drawn first, rain composited on top so rain always reads clearly.
 * Technique = heatmap.js: greyscale alpha kernels → colourize via a 1×256 LUT.
 * `buildLUT`/`metersPerPixel`/`drawKernels`/`colourizeInto` live in
 * src/lib/heatmapKernel.js, shared with BmkgRainLayer.jsx.
 */

// Whole heatmap (coverage teal base AND rain-density blobs) hidden for
// now — the underlying density-kernel theory hasn't been validated yet
// ("secara teori masih belum benar"). This is a blanket hide of everything
// CanvasHeatmapOverlay draws, not just the coverage sub-layer: the two
// layers read as one visual to users (they share the same blob shapes,
// coverage is just the low end of the same gradient), so a partial hide
// still looked like leftover coverage. Flip back on once validated.
const HEATMAP_ENABLED = false;
const SHOW_COVERAGE_LAYER = false;

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

const RAIN_LUT = buildLUT(RAIN_RAMP);
const COVER_LUT = buildLUT(COVER_RAMP);

function renderHeatmap(canvas, shadow, coolLayer, warmLayer, stations, projection, map, showCoverage) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!HEATMAP_ENABLED || !stations.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const rainR = Math.max(RAIN_MIN, Math.min(RAIN_MAX, (RAIN_KM * 1000) / mpp));
  const coverR = Math.max(COVER_MIN, Math.min(COVER_MAX, (COVER_KM * 1000) / mpp));
  const pad = Math.max(rainR, coverR);

  const wet = [], dry = [];
  for (const st of stations) {
    const bucket = statusBucket(st);
    if (bucket !== 'raining' && bucket !== 'active') continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    if (bucket === 'raining') wet.push({ x, y, alpha: POINT_ALPHA });
    else dry.push({ x, y, alpha: POINT_ALPHA });
  }

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');

  // 1) coverage base (teal, subtle) — drawn first, underneath.
  if (SHOW_COVERAGE_LAYER && dry.length) {
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
