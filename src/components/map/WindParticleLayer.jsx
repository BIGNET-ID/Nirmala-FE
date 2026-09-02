'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Ventusky-style animated wind particles (BIGNET DS v19).
 * Fetches a real wind vector field from /api/wind (sampled from OpenWeather,
 * server-side), then advects ~2000 particles through it with fading trails.
 * Disabled under prefers-reduced-motion (draws a static arrow field instead).
 */

const PARTICLE_COUNT = 2000;
const VELOCITY_SCALE = 0.12;   // px per (m/s) per frame — visual exaggeration; lower = calmer drift
const FADE = 0.93;             // trail persistence (higher = longer trails)
const MAX_AGE = 110;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// speed (m/s) → trail colour
function speedColor(spd, a) {
  const t = Math.min(1, spd / 14);
  const r = Math.round(130 + t * 125);
  const g = Math.round(190 + t * 65);
  const b = 255;
  return `rgba(${r},${g},${b},${a})`;
}

function sampleField(field, lat, lng) {
  if (!field) return null;
  const { bounds: B, nx, ny, u, v } = field;
  const gx = ((lng - B.west) / (B.east - B.west)) * (nx - 1);
  const gy = ((lat - B.south) / (B.north - B.south)) * (ny - 1);
  if (gx < 0 || gx > nx - 1 || gy < 0 || gy > ny - 1) return null;
  const i0 = Math.floor(gx), j0 = Math.floor(gy);
  const i1 = Math.min(nx - 1, i0 + 1), j1 = Math.min(ny - 1, j0 + 1);
  const fx = gx - i0, fy = gy - j0;
  const at = (i, j) => j * nx + i;
  const lerp = (a, b, f) => a + (b - a) * f;
  const uTop = lerp(u[at(i0, j0)], u[at(i1, j0)], fx);
  const uBot = lerp(u[at(i0, j1)], u[at(i1, j1)], fx);
  const vTop = lerp(v[at(i0, j0)], v[at(i1, j0)], fx);
  const vBot = lerp(v[at(i0, j1)], v[at(i1, j1)], fx);
  return { u: lerp(uTop, uBot, fy), v: lerp(vTop, vBot, fy) };
}

export default function WindParticleLayer({ show = true, field = null, ambientField = null, speedMultiplier = 1 }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRef = useRef(field);
  const ambientFieldRef = useRef(ambientField);
  const showRef = useRef(show);
  const speedMultiplierRef = useRef(speedMultiplier);
  const rafRef = useRef(0);
  const particlesRef = useRef([]);

  useEffect(() => { showRef.current = show; }, [show]);
  useEffect(() => { fieldRef.current = field; }, [field]);
  useEffect(() => { ambientFieldRef.current = ambientField; }, [ambientField]);
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = showRef.current ? '' : 'none';
    canvasRef.current = canvas;

    const seed = () => {
      const c = canvasRef.current;
      const arr = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        arr.push({ x: Math.random() * c.width, y: Math.random() * c.height, age: Math.random() * MAX_AGE });
      }
      particlesRef.current = arr;
    };

    const latlngAt = (px, py) => {
      const proj = overlayRef.current?.getProjection();
      if (!proj) return null;
      const pt = new window.google.maps.Point(px + canvas._offsetX, py + canvas._offsetY);
      return proj.fromDivPixelToLatLng(pt);
    };

    const step = () => {
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      const field = fieldRef.current;
      const ambient = ambientFieldRef.current;

      // fade existing trails without painting a background (keeps map visible)
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${FADE})`;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';

      if ((field || ambient) && showRef.current) {
        const parts = particlesRef.current;
        for (const p of parts) {
          const ll = latlngAt(p.x, p.y);
          // Prefer the dense viewport-following field; fall back to the
          // sparse near-global ambient field wherever the dense one doesn't
          // reach (e.g. far outside wherever the user has actually panned).
          const w = ll ? (sampleField(field, ll.lat(), ll.lng()) ?? sampleField(ambient, ll.lat(), ll.lng())) : null;
          if (!w) { p.x = Math.random() * c.width; p.y = Math.random() * c.height; p.age = 0; continue; }
          const nx = p.x + w.u * VELOCITY_SCALE * speedMultiplierRef.current;
          const ny = p.y - w.v * VELOCITY_SCALE * speedMultiplierRef.current; // screen y is down; +v is north
          const spd = Math.hypot(w.u, w.v);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = speedColor(spd, 0.85);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          p.x = nx; p.y = ny; p.age += 1;
          if (p.age > MAX_AGE || nx < 0 || nx > c.width || ny < 0 || ny > c.height) {
            p.x = Math.random() * c.width; p.y = Math.random() * c.height; p.age = 0;
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };

    const startAnim = () => {
      if (rafRef.current || prefersReducedMotion()) return;
      rafRef.current = requestAnimationFrame(step);
    };
    const stopAnim = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    };

    class WindOverlay extends window.google.maps.OverlayView {
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
        seed();
      }
      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new WindOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._start = startAnim;
    overlayRef.current._stop = stopAnim;

    if (showRef.current) startAnim();

    return () => { stopAnim(); overlay.setMap(null); };
  }, [map]);

  useEffect(() => {
    const c = canvasRef.current;
    if (c) c.style.display = show ? '' : 'none';
    const o = overlayRef.current;
    if (!o) return;
    if (show) o._start?.();
    else o._stop?.();
  }, [show]);

  return null;
}
