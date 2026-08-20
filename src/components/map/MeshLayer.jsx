'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildNearestNeighborEdges } from '@/lib/meshTopology';
import { statusColor } from '@/lib/sensorColor';

/**
 * "Mesh Map" mode: edges connecting sensors to their nearest neighbours, each
 * edge a 2-stop gradient between the two endpoints' status colours (a "rain
 * front" reads as a gradient boundary between wet/dry sensors). Draws edges
 * ONLY — the dots themselves are SensorDotLayer's job (it owns click/select),
 * mounted on top of this layer in page.jsx.
 *
 * Edges are only drawn once the map is zoomed in past MESH_ZOOM_THRESHOLD —
 * at national zoom there are ~9-14k edges nationwide, which would just be a
 * solid smear. Below the threshold no edges render (dots only, via
 * SensorDotLayer).
 */

const MESH_ZOOM_THRESHOLD = 7;

export default function MeshLayer({ stations = [] }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // Topology depends only on station positions/ids, not on isRaining, which
  // changes every live tick — so it's memoized on the id set, not `stations`.
  const stationIdKey = stations.map((s) => s.id).join(',');
  const edges = useMemo(
    () => buildNearestNeighborEdges(stations, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stationIdKey],
  );
  const edgesRef = useRef(edges);

  useEffect(() => { edgesRef.current = edges; }, [edges]);

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
      const W = c.width, H = c.height, pad = 24;
      const toPx = (st) => {
        const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
        return { x: p.x - c._offsetX, y: p.y - c._offsetY };
      };
      const inBounds = (p) => p.x >= -pad && p.x <= W + pad && p.y >= -pad && p.y <= H + pad;

      if (map.getZoom() >= MESH_ZOOM_THRESHOLD) {
        for (const { a, b } of edgesRef.current) {
          const pa = toPx(a), pb = toPx(b);
          if (!inBounds(pa) && !inBounds(pb)) continue;
          const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
          g.addColorStop(0, statusColor(a));
          g.addColorStop(1, statusColor(b));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint();
      });
    };

    class MeshOverlay extends window.google.maps.OverlayView {
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

    const overlay = new MeshOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._repaint = scheduleDraw;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?._repaint?.(); }, [edges]);

  return null;
}
