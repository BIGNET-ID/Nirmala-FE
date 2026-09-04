'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildLUT, metersPerPixel, drawKernels, colourizeInto } from '@/lib/heatmapKernel';
import { precipToT } from '@/lib/bmkgWeather';

/**
 * BMKG Cuaca ground layer — kernel-heatmap of official per-kabupaten
 * precipitation (precip_mm), independent from the sensor-based Rain
 * Density layer (CanvasOverlay.jsx). See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 *
 * Unlike CanvasOverlay.jsx's wet/dry kernels (all points share one flat
 * peak alpha — POINT_ALPHA — so overlapping RAINING sensors accumulate
 * into a hotter blob, a density-of-sensors signal), each kabupaten here
 * carries its OWN measured precip_mm, mapped to its own kernel peak alpha
 * via precipToT() (0-1, full range) so the LUT color at that spot reflects
 * that kabupaten's real reading. The ~511 points are far enough apart that
 * kernels rarely overlap; where two adjacent high-rain kabupaten's kernels
 * do overlap, alpha compositing can push the blended color slightly past
 * either individual reading — an accepted approximation of the same
 * technique already used for Rain Density, not a new correctness gap this
 * layer introduces.
 */

// Tunable — 511 kabupaten points are far sparser than Rain Density's
// ~4,500 sensors, so this starts larger than CanvasOverlay.jsx's RAIN_KM
// (35) and is expected to need adjustment after visual QA.
const BMKG_KM = 60;
const BMKG_MIN = 25, BMKG_MAX = 140;
const MAX_ALPHA = 220;

// Same rainbow spectrum as Rain Density's RAIN_RAMP (CanvasOverlay.jsx) and
// METRICS.bmkg.colorRamp — approved "no rainbow" exception in AGENTS.md.
// Duplicated locally rather than imported from a shared constant:
// OpenWeatherLayer.jsx already keeps its own copy of this same ramp too,
// this follows that existing precedent rather than introducing a new
// shared constant out of scope for this feature.
const RAIN_RAMP = [
  [0.00, [59, 130, 246]], [0.20, [34, 211, 238]], [0.40, [34, 197, 94]],
  [0.60, [234, 179, 8]], [0.80, [249, 115, 22]], [1.00, [220, 38, 38]],
];
const RAIN_LUT = buildLUT(RAIN_RAMP);

function renderHeatmap(canvas, shadow, layer, kabupaten, projection, map) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!kabupaten.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const radius = Math.max(BMKG_MIN, Math.min(BMKG_MAX, (BMKG_KM * 1000) / mpp));

  const pts = [];
  for (const k of kabupaten) {
    const mm = k?.now?.precip_mm;
    const t = precipToT(mm);
    if (t <= 0) continue; // no rain here — no kernel, stays transparent
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(k.lat, k.lon));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (x < -radius || x > W + radius || y < -radius || y > H + radius) continue;
    pts.push({ x, y, alpha: t });
  }
  if (!pts.length) return;

  shadow.width = W; shadow.height = H;
  const sctx = shadow.getContext('2d');
  drawKernels(sctx, W, H, pts, radius);
  colourizeInto(layer, shadow, W, H, RAIN_LUT, MAX_ALPHA);
  ctx.drawImage(layer, 0, 0);
}

export default function BmkgRainLayer({ kabupaten }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const shadowRef = useRef(null);
  const layerRef = useRef(null);
  const kabupatenRef = useRef(kabupaten);
  const rafRef = useRef(0);

  useEffect(() => { kabupatenRef.current = kabupaten; }, [kabupaten]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    shadowRef.current = document.createElement('canvas');
    layerRef.current = document.createElement('canvas');

    const scheduleDraw = (fn) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; fn(); });
    };

    class BmkgOverlay extends window.google.maps.OverlayView {
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
          renderHeatmap(canvas, shadowRef.current, layerRef.current, kabupatenRef.current, projection, map)
        );
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new BmkgOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?.draw(); }, [kabupaten]);

  return null;
}
