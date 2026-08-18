'use client';

import { useEffect, useRef } from 'react';

/**
 * Camera-lens raindrops — a 2D canvas overlay (no WebGL) of glassy droplets that
 * cling to the "lens", occasionally slide down with a trail, then respawn.
 * Smooth via requestAnimationFrame. Purely decorative; pointer-events: none.
 */
export default function LensRain({ dropCount = 46, opacity = 0.5 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0, W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (top) => ({
      x: Math.random() * W,
      y: top ? -20 : Math.random() * H,
      r: 4 + Math.random() * 13,
      vy: 0,
      life: 0,
      maxLife: 5 + Math.random() * 8,
      sliding: Math.random() < 0.28,
    });
    const drops = Array.from({ length: dropCount }, () => spawn(false));

    const drawDrop = (d) => {
      // glassy body: soft radial with an off-centre highlight
      const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, 0, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.45, 'rgba(205,222,255,0.12)');
      g.addColorStop(1, 'rgba(180,200,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      // bright spec highlight
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.32, d.y - d.r * 0.34, d.r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    };

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = opacity;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.life += dt;
        if (d.sliding) {
          d.vy += 40 * dt;
          d.y += d.vy * dt;
          // faint trail
          ctx.strokeStyle = 'rgba(200,220,255,0.10)';
          ctx.lineWidth = d.r * 0.5;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y - d.vy * dt * 6);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
        drawDrop(d);
        if (d.life > d.maxLife || d.y > H + 30) drops[i] = spawn(Math.random() < 0.6);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [dropCount, opacity]);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />;
}
