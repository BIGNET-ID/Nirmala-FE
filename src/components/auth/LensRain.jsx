'use client';

import { useEffect, useRef } from 'react';
import { flashLevel } from './flashBus';

/**
 * Camera-lens raindrops — 2D canvas overlay (no WebGL), optimised.
 *
 * Perf: the drop is rendered ONCE into an offscreen sprite (crisp refraction
 * rim + glassy body + a bright focused caustic at the bottom edge + top/
 * secondary specular highlights); every frame just drawImage()s that sprite
 * (scaled/elongated) instead of allocating canvas gradients per drop per
 * frame. DPR is capped for this decorative layer.
 *
 * Shape: sliding drops leave a real teardrop tail — a streak that narrows to
 * a fine point and fades out quickly toward the top (surface tension pulling
 * the trail back into the drop), not a flat rectangle.
 *
 * Light: when the storm flashes (read from the shared flashBus that the WebGL
 * scene writes), every drop briefly glints — an additive specular pop — as if
 * the glass beads catch the lightning.
 */
export default function LensRain({ dropCount = 26, opacity = 0.72 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0, W = 0, H = 0;
    const dpr = 1; // decorative overlay → render at 1x for performance

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // --- pre-render one drop sprite (all the expensive gradient work, once) ---
    // High internal resolution → crisp edges when drawn small.
    const S = 128;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = S;
    const s = sprite.getContext('2d');
    {
      const r = S * 0.42, cx = S / 2, cy = S / 2;
      // soft contact shadow / darkened refraction rim around the bead
      let g = s.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
      g.addColorStop(0, 'rgba(6,10,20,0)');
      g.addColorStop(0.78, 'rgba(6,10,20,0.34)');
      g.addColorStop(0.94, 'rgba(6,10,20,0.14)');
      g.addColorStop(1, 'rgba(6,10,20,0)');
      s.fillStyle = g; s.beginPath(); s.arc(cx, cy, r, 0, Math.PI * 2); s.fill();
      // crisp thin bright rim (total-internal-reflection edge)
      s.lineWidth = r * 0.06;
      s.strokeStyle = 'rgba(210,230,255,0.35)';
      s.beginPath(); s.arc(cx, cy, r * 0.9, 0, Math.PI * 2); s.stroke();
      // glassy body — cool, subtly tinted, brighter toward the light
      g = s.createRadialGradient(cx - r * 0.22, cy - r * 0.28, 0, cx, cy, r * 0.94);
      g.addColorStop(0, 'rgba(228,240,255,0.16)');
      g.addColorStop(0.6, 'rgba(200,222,255,0.07)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      s.fillStyle = g; s.beginPath(); s.arc(cx, cy, r * 0.9, 0, Math.PI * 2); s.fill();
      // bright focused caustic at the BOTTOM edge (light bent through the lens)
      g = s.createRadialGradient(cx, cy + r * 0.42, 0, cx, cy + r * 0.42, r * 0.62);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.5, 'rgba(210,232,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      s.fillStyle = g;
      s.beginPath(); s.ellipse(cx, cy + r * 0.4, r * 0.52, r * 0.34, 0, 0, Math.PI * 2); s.fill();
      // primary specular highlight (sharp, upper-left)
      g = s.createRadialGradient(cx - r * 0.32, cy - r * 0.42, 0, cx - r * 0.32, cy - r * 0.42, r * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      s.fillStyle = g;
      s.beginPath(); s.arc(cx - r * 0.32, cy - r * 0.42, r * 0.28, 0, Math.PI * 2); s.fill();
      // tiny secondary highlight
      s.fillStyle = 'rgba(255,255,255,0.5)';
      s.beginPath(); s.arc(cx + r * 0.24, cy - r * 0.06, r * 0.08, 0, Math.PI * 2); s.fill();
    }

    // --- a small additive glint used only when the storm flashes ---
    const G = 64;
    const glint = document.createElement('canvas');
    glint.width = glint.height = G;
    {
      const gg = glint.getContext('2d');
      const gr = gg.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(224,240,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, G, G);
    }

    // --- refraction caustic: thin light rays bent through the bead, drawn
    // additively inside each drop only while the storm flashes ---
    const C = 96;
    const caustic = document.createElement('canvas');
    caustic.width = caustic.height = C;
    {
      const cc = caustic.getContext('2d');
      cc.translate(C / 2, C / 2);
      // bright refracted core
      let cg = cc.createRadialGradient(0, 0, 0, 0, 0, C * 0.5);
      cg.addColorStop(0, 'rgba(255,255,255,0.85)');
      cg.addColorStop(0.4, 'rgba(220,238,255,0.22)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      cc.fillStyle = cg; cc.beginPath(); cc.arc(0, 0, C * 0.5, 0, Math.PI * 2); cc.fill();
      // a few crossing refraction streaks
      cc.lineCap = 'round';
      const rays = 6;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * Math.PI * 2 + 0.35;
        const len = C * 0.46 * (i % 2 ? 1 : 0.62);
        const lg = cc.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
        lg.addColorStop(0, 'rgba(255,255,255,0.85)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        cc.strokeStyle = lg; cc.lineWidth = C * 0.022;
        cc.beginPath(); cc.moveTo(0, 0); cc.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); cc.stroke();
      }
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

      const flash = flashLevel();               // 0..~1 lightning brightness

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        let elong = 1;

        if (d.state === 'cling') {
          if (Math.random() < dt * (0.06 + d.r / 500)) { d.state = 'slide'; d.vy = 10; }
        } else {
          d.vy = Math.min(115, d.vy + 130 * dt);   // slower, gentler fall
          d.y += d.vy * dt;
          d.phase += dt * 2.4;
          d.x += Math.sin(d.phase) * 8 * dt;
          elong = 1 + Math.min(0.55, d.vy / 200);

          // teardrop tail: a streak that NARROWS to a point and fades out fast
          // toward the top (surface tension snapping the trail back).
          const tlen = Math.min(70, d.vy * 0.32);
          if (tlen > 2) {
            const w0 = d.r * 0.72;               // width at the drop
            const tg = ctx.createLinearGradient(0, d.y - tlen, 0, d.y);
            tg.addColorStop(0, 'rgba(200,224,255,0)');
            tg.addColorStop(0.65, `rgba(200,224,255,${0.05 * opacity})`);
            tg.addColorStop(1, `rgba(214,232,255,${0.16 * opacity})`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = tg;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y - tlen);          // fine point at the top
            ctx.lineTo(d.x + w0 / 2, d.y);
            ctx.quadraticCurveTo(d.x, d.y + w0 * 0.3, d.x - w0 / 2, d.y);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = opacity;
          }
        }

        const w = d.r * 2;
        const h = d.r * 2 * elong;
        ctx.drawImage(sprite, d.x - w / 2, d.y - h / 2, w, h);

        // lightning glint — additive specular pop synced to the storm flash
        if (flash > 0.03) {
          ctx.globalCompositeOperation = 'lighter';
          // refraction rays bent through the bead (centred inside the drop)
          const cs = d.r * 2 * (1.05 + flash * 0.5);
          ctx.globalAlpha = Math.min(1, opacity * flash * 0.8);
          ctx.drawImage(caustic, d.x - cs / 2, d.y - cs / 2, cs, cs);
          // specular glint on the upper-left highlight point
          const gs = d.r * (1.4 + flash * 0.8);
          ctx.globalAlpha = Math.min(1, opacity * flash * 1.1);
          ctx.drawImage(glint, d.x - d.r * 0.32 - gs / 2, d.y - d.r * 0.42 - gs / 2, gs, gs);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = opacity;
        }

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
