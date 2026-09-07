'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildLUT, metersPerPixel } from '@/lib/heatmapKernel';
import { precipToT } from '@/lib/bmkgWeather';

/**
 * BMKG Cuaca ground layer — kernel-heatmap of official per-kabupaten
 * precipitation (precip_mm), independent from the sensor-based Rain
 * Density layer (CanvasOverlay.jsx). See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 *
 * Unlike CanvasOverlay.jsx's wet/dry kernels (shared `heatmapKernel.js`
 * drawKernels/colourizeInto pipeline: a single greyscale alpha channel
 * doubles as both the LUT color-index AND the output opacity, which fits
 * a density-of-overlapping-sensors signal), each kabupaten here carries
 * its OWN measured precip_mm and must show its OWN true color regardless
 * of how faint that reading is on screen. So color and opacity are
 * computed separately per point: the RGB comes straight from RAIN_LUT at
 * this point's real precipToT() position (never adjusted — the legend's
 * numeric ticks only mean something if the color truly matches the
 * reading), while the ALPHA gets a theme-aware visibility floor (see
 * DARK_ALPHA_FLOOR/LIGHT_ALPHA_FLOOR) so a real but faint reading (most
 * of BMKG's own sample data is 0.2-0.7mm) doesn't round down to
 * invisible. Each kernel is drawn directly in its resolved color via a
 * radial gradient — `drawKernels`/`colourizeInto` aren't reused here
 * since their alpha-is-the-index design would tie color to the floor too.
 */

// Tunable — 511 kabupaten points are far sparser than Rain Density's
// ~4,500 sensors, so this starts larger than CanvasOverlay.jsx's RAIN_KM
// (35) and is expected to need adjustment after visual QA.
const BMKG_KM = 60;
const BMKG_MIN = 25, BMKG_MAX = 140;
const MAX_OPACITY = 220 / 255;

// Real precip_mm readings are mostly small (BMKG's own sample data is
// 0/0.2/0.7 mm) — mapped straight through precipToT(), that's a t of
// ~0.02-0.07, i.e. ~2-7% opacity: functionally invisible against either
// basemap. These floors raise the displayed OPACITY only (color stays
// 100% true to t — see the file doc comment above) — same fix pattern
// already applied to OpenWeatherLayer.jsx/sensor dots/wind particles for
// this exact failure mode. Light needs a higher floor than dark because
// the same alpha reads dimmer against a near-white basemap than a
// near-black one.
const DARK_ALPHA_FLOOR = 0.3;
const LIGHT_ALPHA_FLOOR = 0.45;

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

function renderHeatmap(canvas, kabupaten, projection, map, dark) {
  const W = canvas.width, H = canvas.height;
  if (W <= 0 || H <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!kabupaten.length || !map) return;

  const zoom = map.getZoom();
  const lat = map.getCenter()?.lat() ?? 0;
  const mpp = metersPerPixel(lat, zoom);
  const radius = Math.max(BMKG_MIN, Math.min(BMKG_MAX, (BMKG_KM * 1000) / mpp));
  const floor = dark ? DARK_ALPHA_FLOOR : LIGHT_ALPHA_FLOOR;

  for (const k of kabupaten) {
    const mm = k?.now?.precip_mm;
    const t = precipToT(mm);
    if (t <= 0) continue; // no rain here — no kernel, stays transparent
    const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(k.lat, k.lon));
    const x = p.x - canvas._offsetX, y = p.y - canvas._offsetY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -radius || x > W + radius || y < -radius || y > H + radius) continue;

    const li = Math.round(t * 255) * 3;
    const r = RAIN_LUT[li], g = RAIN_LUT[li + 1], b = RAIN_LUT[li + 2];
    const opacity = Math.min(MAX_OPACITY, floor + (1 - floor) * t);

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

const isDarkTheme = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

export default function BmkgRainLayer({ kabupaten }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
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
          renderHeatmap(canvas, kabupatenRef.current, projection, map, isDarkTheme())
        );
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new BmkgOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    // Theme toggling doesn't change `kabupaten` or pan/zoom the map, so
    // nothing else would trigger a redraw — watch the <html> theme
    // attribute directly (same DOM-observation need as any imperative
    // canvas loop reading isDarkTheme() at paint time; see
    // WindParticleLayer.jsx's identical isDarkTheme() for the read-time
    // pattern, though that one re-reads every animation frame instead of
    // needing an observer since it already loops continuously).
    const themeObserver = new MutationObserver(() => overlayRef.current?.draw());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      themeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
      // Belt-and-suspenders: setMap(null) is documented to trigger
      // onRemove(), which detaches the canvas — but that didn't reliably
      // happen in practice (observed: switching the BMKG toggle off left
      // a stale, still-visible canvas in the map pane). Remove it directly
      // too, so a real unmount never depends on that callback firing.
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?.draw(); }, [kabupaten]);

  return null;
}
