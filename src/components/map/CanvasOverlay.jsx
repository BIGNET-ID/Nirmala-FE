'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

// ============================================================
// IDW Color Functions (inline – no import needed in component)
// ============================================================
function rainToRgba(val) {
  if (val < 5)   return [0, 0, 0, 0];
  if (val < 25)  return [0, 229, 255, 90];
  if (val < 50)  return [0, 230, 118, 130];
  if (val < 75)  return [255, 235, 59, 160];
  if (val < 100) return [255, 152, 0, 185];
  return [244, 67, 54, 210];
}

function tempToRgba(val) {
  const norm = Math.max(0, Math.min(1, (val - 20) / 16));
  const hue = (1 - norm) * 240;
  return hslToRgba(hue, 0.85, 0.5, 0.45);
}

function hslToRgba(h, s, l, a) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    Math.round(a * 255),
  ];
}

// ============================================================
// IDW Interpolation on Canvas
// ============================================================
function renderHeatmap(canvas, stations, activeLayer, projection) {
  const ctx = canvas.getContext('2d');
  if (!ctx || stations.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const STEP = 6; // grid resolution (lower = sharper but slower)
  const POWER = 2;

  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  // Project stations to pixel space
  const pts = stations.map((st) => {
    const px = projection.fromLatLngToDivPixel(
      new window.google.maps.LatLng(st.lat, st.lng)
    );
    return { px: px.x, py: px.y, val: activeLayer === 'rain' ? st.rain : st.temp };
  });

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      let weightSum = 0;
      let valueSum = 0;
      let exactVal = null;

      for (const p of pts) {
        const dx = x - p.px;
        const dy = y - p.py;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1) { exactVal = p.val; break; }
        const w = 1 / Math.pow(distSq, POWER / 2);
        weightSum += w;
        valueSum += w * p.val;
      }

      const val = exactVal !== null ? exactVal : valueSum / weightSum;
      const [r, g, b, a] = activeLayer === 'rain' ? rainToRgba(val) : tempToRgba(val);

      // Fill STEP×STEP block
      for (let sy = 0; sy < STEP && y + sy < H; sy++) {
        for (let sx = 0; sx < STEP && x + sx < W; sx++) {
          const idx = ((y + sy) * W + (x + sx)) * 4;
          data[idx]     = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }

  ctx.clearRect(0, 0, W, H);
  ctx.putImageData(imageData, 0, 0);

  // Apply Gaussian blur for smooth heatmap look
  ctx.filter = 'blur(18px)';
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = W; tmpCanvas.height = H;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.filter = 'blur(18px)';
  tmpCtx.drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.filter = 'none';
  ctx.drawImage(tmpCanvas, 0, 0);
}

// ============================================================
// React Component (as Google Maps OverlayView)
// ============================================================
export default function CanvasHeatmapOverlay({ stations, activeLayer }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const stationsRef = useRef(stations);
  const layerRef = useRef(activeLayer);

  // Keep refs fresh without re-creating overlay
  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { layerRef.current = activeLayer; }, [activeLayer]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.mixBlendMode = 'normal';
    canvasRef.current = canvas;

    class HeatmapOverlay extends window.google.maps.OverlayView {
      onAdd() {
        this.getPanes().overlayLayer.appendChild(canvas);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const bounds = map.getBounds();
        if (!bounds) return;

        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());

        const W = Math.ceil(Math.abs(ne.x - sw.x));
        const H = Math.ceil(Math.abs(sw.y - ne.y));

        canvas.width  = W;
        canvas.height = H;
        canvas.style.width  = `${W}px`;
        canvas.style.height = `${H}px`;
        canvas.style.left   = `${Math.min(sw.x, ne.x)}px`;
        canvas.style.top    = `${Math.min(sw.y, ne.y)}px`;

        renderHeatmap(canvas, stationsRef.current, layerRef.current, projection);
      }

      onRemove() {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    const overlay = new HeatmapOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
    };
  }, [map]);

  // Redraw on stations/layer change
  useEffect(() => {
    overlayRef.current?.draw();
  }, [stations, activeLayer]);

  return null;
}
