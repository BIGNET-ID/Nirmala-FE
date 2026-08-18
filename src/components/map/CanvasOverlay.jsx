'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Rain-density heatmap (BIGNET DS v19).
 *
 * The live /api/sensors feed is BINARY (is_raining true/false) — there is no
 * numeric intensity to interpolate. So instead of a fake mm/jam IDW field, this
 * renders an HONEST kernel-density field: every RAINING sensor emits a soft
 * radial kernel; overlapping kernels accumulate (additive). Isolated rain = a
 * cool faint blob; a dense cluster of raining sensors = a hot red core. The
 * accumulated density is mapped through a colour ramp (cool→hot).
 *
 * Technique mirrors heatmap.js: draw greyscale alpha kernels, then colourize the
 * composited alpha channel via a 1×256 gradient lookup table.
 */

const RADIUS_KM = 35;          // geographic influence radius of one sensor
const RADIUS_PX_MIN = 14;
const RADIUS_PX_MAX = 90;
const POINT_ALPHA = 0.5;       // per-kernel opacity; overlaps build density
const MAX_OUT_ALPHA = 220;     // cap so the map stays readable underneath

// Density ramp: cool (sparse) → hot (dense). Spec §7.1 rain ramp.
const RAMP = [
  [0.00, [96, 165, 250]],   // #60a5fa
  [0.18, [52, 211, 153]],   // #34d399
  [0.40, [234, 179, 8]],    // #eab308
  [0.62, [251, 146, 60]],   // #fb923c
  [0.82, [239, 68, 68]],    // #ef4444
  [1.00, [192, 132, 252]],  // #c084fc
];

/** Build a 256-entry RGB lookup table from the ramp (once). */
function buildLUT() {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = RAMP[0], b = RAMP[RAMP.length - 1];
    for (let k = 0; k < RAMP.length - 1; k++) {
      if (t >= RAMP[k][0] && t <= RAMP[k + 1][0]) { a = RAMP[k]; b = RAMP[k + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3]     = a[1][0] + (b[1][0] - a[1][0]) * f;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
  }
  return lut;
}

const LUT = buildLUT();

/** meters-per-pixel at a given latitude & Google zoom. */
function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function renderHeatmap(canvas, shadow, stations, projection, map) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!stations.length || !map) return;

  const zoom = map.getZoom();
  const centerLat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(centerLat, zoom);
  const radius = Math.max(RADIUS_PX_MIN, Math.min(RADIUS_PX_MAX, (RADIUS_KM * 1000) / mpp));
  const pad = radius;

  // Project raining sensors into viewport pixel space (with cull).
  const pts = [];
  for (const st of stations) {
    if (!st.isRaining) continue;
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
    // canvas is offset to the viewport's top-left; convert div px → canvas px
    const x = p.x - canvas._offsetX;
    const y = p.y - canvas._offsetY;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    pts.push([x, y]);
  }
  if (!pts.length) return;

  // 1) Accumulate greyscale alpha kernels on the shadow canvas.
  shadow.width = W;
  shadow.height = H;
  const sctx = shadow.getContext('2d');
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

  // 2) Colourize: map composited alpha → density ramp.
  const img = sctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;
    const li = alpha * 3;
    d[i] = LUT[li];
    d[i + 1] = LUT[li + 1];
    d[i + 2] = LUT[li + 2];
    d[i + 3] = alpha > MAX_OUT_ALPHA ? MAX_OUT_ALPHA : alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export default function CanvasHeatmapOverlay({ stations }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const stationsRef = useRef(stations);
  const rafRef = useRef(0);

  useEffect(() => { stationsRef.current = stations; }, [stations]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    shadowRef.current = document.createElement('canvas');

    const scheduleDraw = (fn) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        fn();
      });
    };

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
        const left = Math.min(sw.x, ne.x);
        const top = Math.min(sw.y, ne.y);
        const W = Math.ceil(Math.abs(ne.x - sw.x));
        const H = Math.ceil(Math.abs(sw.y - ne.y));

        canvas.width = W;
        canvas.height = H;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas._offsetX = left;
        canvas._offsetY = top;

        scheduleDraw(() =>
          renderHeatmap(canvas, shadowRef.current, stationsRef.current, projection, map)
        );
      }

      onRemove() {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    const overlay = new HeatmapOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      overlay.setMap(null);
    };
  }, [map]);

  // Redraw when the sensor set changes (e.g. new poll).
  useEffect(() => {
    overlayRef.current?.draw();
  }, [stations]);

  return null;
}
