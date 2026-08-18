'use client';

import { useEffect, useRef } from 'react';

/**
 * Camera-lens raindrops — 2D canvas overlay (no WebGL).
 *
 * Realism:
 *  - material/lighting: each drop is rendered like real glass water — a dark rim
 *    (roundness), a subtle glassy body, a bright bottom refraction crescent, a
 *    sharp top-left specular highlight and a soft secondary highlight.
 *  - object: sliding drops elongate into teardrops and leave a wet trail.
 *  - motion: frame-rate-independent smoothing — clinging drops occasionally
 *    release and accelerate (capped) with a gentle horizontal meander, so the
 *    fall reads smooth rather than stepped.
 * Purely decorative; pointer-events: none.
 */
export default function LensRain({ dropCount = 48, opacity = 0.72 }) {
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

    const spawn = (top) => {
      const r = 3 + Math.random() * 7;
      return {
        x: Math.random() * W,
        y: top ? -r * 2 : Math.random() * H,
        r,
        state: 'cling',
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        startY: 0,
      };
    };
    const drops = Array.from({ length: dropCount }, () => spawn(false));

    const drawDrop = (x, y, r, elong) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, elong);
      // dark rim → roundness
      const rim = ctx.createRadialGradient(0, 0, r * 0.72, 0, 0, r);
      rim.addColorStop(0, 'rgba(8,12,24,0)');
      rim.addColorStop(0.82, 'rgba(8,12,24,0.28)');
      rim.addColorStop(1, 'rgba(8,12,24,0)');
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // glassy body
      const body = ctx.createRadialGradient(0, -r * 0.15, 0, 0, r * 0.15, r * 0.95);
      body.addColorStop(0, 'rgba(222,236,255,0.11)');
      body.addColorStop(0.7, 'rgba(226,239,255,0.05)');
      body.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.fill();
      // bottom refraction crescent
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.34, r * 0.5, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      // top-left sharp specular
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.4, r * 0.16, 0, Math.PI * 2); ctx.fill();
      // secondary highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.08, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.033); // clamp → no jumps on refocus
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = opacity;

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        let elong = 1;

        if (d.state === 'cling') {
          // bigger drops are likelier to release and start sliding
          if (Math.random() < dt * (0.06 + d.r / 500)) { d.state = 'slide'; d.startY = d.y; d.vy = 10; }
        } else {
          d.vy = Math.min(260, d.vy + 360 * dt);         // smooth, capped acceleration
          d.y += d.vy * dt;
          d.phase += dt * 3;
          d.x += Math.sin(d.phase) * 10 * dt;            // gentle meander
          elong = 1 + Math.min(0.7, d.vy / 260);         // subtle teardrop stretch

          // wet trail behind the drop
          const g = ctx.createLinearGradient(0, d.startY, 0, d.y);
          g.addColorStop(0, 'rgba(200,220,255,0)');
          g.addColorStop(1, 'rgba(200,220,255,0.12)');
          ctx.strokeStyle = g;
          ctx.lineWidth = d.r * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(d.x, d.startY); ctx.lineTo(d.x, d.y); ctx.stroke();
        }

        drawDrop(d.x, d.y, d.r, elong);

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
