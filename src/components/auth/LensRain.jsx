'use client';

import { useEffect, useRef } from 'react';

/**
 * Camera-lens raindrops — 2D canvas overlay (no WebGL), optimised.
 *
 * Perf: the drop is rendered ONCE into an offscreen sprite (dark rim + glassy
 * body + bottom refraction + top/secondary highlights); every frame just
 * drawImage()s that sprite (scaled/elongated) instead of allocating ~3 canvas
 * gradients per drop per frame. DPR is capped for this decorative layer. This
 * keeps the fall smooth even alongside the WebGL scene.
 *
 * Motion: frame-rate-independent (clamped dt); drops cling, then release and
 * accelerate (capped) with a gentle meander; sliding drops elongate + leave a
 * short wet trail.
 */
export default function LensRain({ dropCount = 44, opacity = 0.72 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0, W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25); // decorative → cap DPR

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // --- pre-render one drop sprite (all the expensive gradient work, once) ---
    const S = 80;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = S;
    const s = sprite.getContext('2d');
    {
      const r = S * 0.42, cx = S / 2, cy = S / 2;
      let g = s.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
      g.addColorStop(0, 'rgba(8,12,24,0)');
      g.addColorStop(0.82, 'rgba(8,12,24,0.28)');
      g.addColorStop(1, 'rgba(8,12,24,0)');
      s.fillStyle = g; s.beginPath(); s.arc(cx, cy, r, 0, Math.PI * 2); s.fill();
      g = s.createRadialGradient(cx, cy - r * 0.15, 0, cx, cy + r * 0.15, r * 0.95);
      g.addColorStop(0, 'rgba(222,236,255,0.11)');
      g.addColorStop(0.7, 'rgba(226,239,255,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      s.fillStyle = g; s.beginPath(); s.arc(cx, cy, r * 0.92, 0, Math.PI * 2); s.fill();
      s.fillStyle = 'rgba(255,255,255,0.30)';
      s.beginPath(); s.ellipse(cx, cy + r * 0.34, r * 0.5, r * 0.3, 0, 0, Math.PI * 2); s.fill();
      s.fillStyle = 'rgba(255,255,255,0.9)';
      s.beginPath(); s.arc(cx - r * 0.3, cy - r * 0.4, r * 0.16, 0, Math.PI * 2); s.fill();
      s.fillStyle = 'rgba(255,255,255,0.4)';
      s.beginPath(); s.arc(cx + r * 0.22, cy - r * 0.08, r * 0.08, 0, Math.PI * 2); s.fill();
    }

    const spawn = (top) => {
      const r = 3 + Math.random() * 7;
      return { x: Math.random() * W, y: top ? -r * 2 : Math.random() * H, r,
        state: 'cling', vy: 0, phase: Math.random() * Math.PI * 2 };
    };
    const drops = Array.from({ length: dropCount }, () => spawn(false));

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = opacity;

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        let elong = 1;

        if (d.state === 'cling') {
          if (Math.random() < dt * (0.06 + d.r / 500)) { d.state = 'slide'; d.vy = 10; }
        } else {
          d.vy = Math.min(260, d.vy + 360 * dt);
          d.y += d.vy * dt;
          d.phase += dt * 3;
          d.x += Math.sin(d.phase) * 10 * dt;
          elong = 1 + Math.min(0.7, d.vy / 260);
          // short wet trail (cheap rect, no gradient)
          const tlen = Math.min(60, d.vy * 0.25);
          ctx.globalAlpha = opacity * 0.1;
          ctx.fillStyle = '#c8dcff';
          ctx.fillRect(d.x - d.r * 0.35, d.y - tlen, d.r * 0.7, tlen);
          ctx.globalAlpha = opacity;
        }

        const w = d.r * 2;
        const h = d.r * 2 * elong;
        ctx.drawImage(sprite, d.x - w / 2, d.y - h / 2, w, h);

        if (d.y > H + d.r * 3) drops[i] = spawn(true);
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [dropCount, opacity]);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />;
}
