'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { resolveRegionBucket } from '@/lib/regionNearestSensor';
import { bucketColor } from '@/lib/sensorColor';

/**
 * Rain Density's admin-region view — colors each kecamatan polygon (from
 * useAdminBoundaries, ultimately a preprocessed national dataset from HDX,
 * bundled as a static file — no longer BIG's live API) by its nearest sensor's
 * status. Alternative to the KDE blob (CanvasOverlay.jsx) at higher zoom —
 * see page.jsx for the zoom-gated swap and
 * docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md
 * for why (real kecamatan boundaries instead of an invented radial
 * gradient). Same google.maps.OverlayView + Canvas 2D pattern as
 * CanvasOverlay.jsx/MeshLayer.jsx/BmkgRainLayer.jsx — 4th instance, not a
 * new one.
 */
export default function AdminRegionLayer({ regions, stations }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const regionsRef = useRef(regions);
  const stationsRef = useRef(stations);

  useEffect(() => { regionsRef.current = regions; }, [regions]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;

    const paint = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);

      const projection = overlayRef.current?.getProjection();
      if (!projection) return;

      const isDark = document.documentElement.dataset.theme === 'dark';

      for (const region of regionsRef.current) {
        const bucket = resolveRegionBucket(region, stationsRef.current);
        // No sensor within MAX_DISTANCE_KM (9km, see regionNearestSensor.js)
        // — skip entirely rather than drawing a gray "no-data" fill. This
        // dataset is now nationwide, and most of rural Indonesia will never
        // be near a Nirmala sensor; graying every such kecamatan would
        // flood the screen with meaningless fill. Only draw kecamatan the
        // sensor network actually has something to say about.
        if (!bucket) continue;
        const color = bucketColor(bucket);

        ctx.beginPath();
        region.polygon.forEach(({ lat, lng }, i) => {
          const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(lat, lng));
          const x = p.x - c._offsetX, y = p.y - c._offsetY;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();

        // Region fill is more transparent than a sensor dot — dots stay
        // the primary focus, regions are supporting context.
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Theme-aware border — a white 25%-alpha stroke reads too faintly
        // against the light basemap (same fix pattern as BmkgRainLayer.jsx's
        // DARK_ALPHA_FLOOR/LIGHT_ALPHA_FLOOR: light mode needs a higher
        // visibility floor than dark).
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)'; // real kecamatan border, kept subtle
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; paint(); });
    };

    class AdminRegionOverlay extends window.google.maps.OverlayView {
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
        scheduleDraw();
      }

      onRemove() { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }

    const overlay = new AdminRegionOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._repaint = scheduleDraw;

    // Theme toggling doesn't pan/zoom the map or change regions/stations,
    // so nothing else would trigger a repaint — watch the <html> theme
    // attribute directly (same pattern as BmkgRainLayer.jsx).
    const themeObserver = new MutationObserver(() => overlayRef.current?.draw());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      themeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?._repaint?.(); }, [regions, stations]);

  return null;
}
