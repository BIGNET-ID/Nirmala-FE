'use client';

import React, { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 2500;
const MAX_AGE = 80;

export default function WindFlowLayer({ map, windGrid }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (!map || !windGrid || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.mixBlendMode = 'screen';

    class WindOverlay extends window.google.maps.OverlayView {
      onAdd() {
        this.getPanes().overlayPane.appendChild(canvas);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        const bounds = map.getBounds();
        if (!bounds) return;

        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());

        const width = Math.ceil(Math.abs(ne.x - sw.x));
        const height = Math.ceil(Math.abs(sw.y - ne.y));

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.left = `${sw.x}px`;
        canvas.style.top = `${ne.y}px`;

        initParticleSystem(canvas, width, height);
      }

      onRemove() {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    const overlay = new WindOverlay();
    overlay.setMap(map);

    function initParticleSystem(cvs, width, height) {
      const ctx = cvs.getContext('2d');
      if (!ctx) return;

      // Inisialisasi Pool Partikel
      const particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          age: Math.floor(Math.random() * MAX_AGE),
        });
      }

      function renderFrame() {
        // Efek trailing garis angin
        ctx.fillStyle = 'rgba(5, 8, 17, 0.92)';
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          // Ambil komponen vektor u, v dari windGrid (interpolasi sederhana)
          const u = 2.5; // Contoh kecepatan arah timur (px/frame)
          const v = Math.sin(p.x * 0.01) * 1.5; // Variasi gelombang vertikal

          const oldX = p.x;
          const oldY = p.y;

          p.x += u;
          p.y += v;
          p.age++;

          // Draw line segment
          ctx.moveTo(oldX, oldY);
          ctx.lineTo(p.x, p.y);

          // Respawn partikel jika keluar layar atau melebihi MAX_AGE
          if (p.x > width || p.y > height || p.x < 0 || p.y < 0 || p.age > MAX_AGE) {
            p.x = Math.random() * width;
            p.y = Math.random() * height;
            p.age = 0;
          }
        }
        ctx.stroke();

        animFrameRef.current = requestAnimationFrame(renderFrame);
      }

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderFrame();
    }

    return () => {
      overlay.setMap(null);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [map, windGrid]);

  return null;
}
