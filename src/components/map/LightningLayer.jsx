'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Real-time lightning strikes as glowing points on a canvas OverlayView.
 * Cloud-to-ground (cloud=false) = warm yellow; cloud-to-cloud = cyan. Glow
 * radius scales with |signalStrengthKA| (PRD §4.5). Gentle global pulse via rAF
 * (disabled under prefers-reduced-motion). Viewport-culled. Toggle via `show`.
 */

const GROUND = { core: '#fff7cc', glow: '249,168,37' };   // cloud-to-ground → yellow/orange
const CLOUD = { core: '#ccf5ff', glow: '0,229,255' };     // cloud-to-cloud → cyan

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function LightningLayer({ strikes = [], show = true }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const strikesRef = useRef(strikes);
  const showRef = useRef(show);
  const pulseRef = useRef(0);

  useEffect(() => { strikesRef.current = strikes; }, [strikes]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;

    let phase = 0;

    const paint = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      if (!showRef.current) return;
      const projection = overlayRef.current?.getProjection();
      if (!projection) return;

      const W = c.width, H = c.height, pad = 24;
      const pulse = prefersReducedMotion() ? 1 : 0.75 + Math.sin(phase) * 0.25;

      for (const s of strikesRef.current) {
        if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
        const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(s.lat, s.lng));
        const x = p.x - c._offsetX, y = p.y - c._offsetY;
        if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;

        const kind = s.isCloud ? CLOUD : GROUND;
        const strength = Math.min(14, Math.max(4, 4 + Math.abs(s.signalStrength || 0) / 8));
        const r = strength * pulse;

        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        g.addColorStop(0, `rgba(${kind.glow},0.9)`);
        g.addColorStop(1, `rgba(${kind.glow},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.4, r * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = kind.core;
        ctx.fill();
      }
    };

    const startPulse = () => {
      if (pulseRef.current || prefersReducedMotion()) return;
      const loop = () => {
        phase += 0.08;
        paint();
        pulseRef.current = requestAnimationFrame(loop);
      };
      pulseRef.current = requestAnimationFrame(loop);
    };
    const stopPulse = () => {
      if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
      pulseRef.current = 0;
    };

    class LightningOverlay extends window.google.maps.OverlayView {
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
        paint();
      }
      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new LightningOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._paint = paint;
    overlayRef.current._startPulse = startPulse;
    overlayRef.current._stopPulse = stopPulse;

    return () => { stopPulse(); overlay.setMap(null); };
  }, [map]);

  // React to show / data changes.
  useEffect(() => {
    showRef.current = show;
    const c = canvasRef.current;
    if (c) c.style.display = show ? '' : 'none';
    const o = overlayRef.current;
    if (!o) return;
    o._paint?.();
    if (show) o._startPulse?.();
    else o._stopPulse?.();
  }, [show]);

  useEffect(() => { overlayRef.current?._paint?.(); }, [strikes]);

  return null;
}
