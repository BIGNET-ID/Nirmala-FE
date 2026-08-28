'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildSensorMeshGraph } from '@/lib/meshTopology';
import { edgeDistanceToColor } from '@/lib/algorithms/colorScales';

/**
 * "Mesh Map" mode: a dense k-nearest-neighbour mesh connecting every
 * sensor — every sensor has an edge to each of its nearest neighbours
 * (forming a grid with cells/loops), and no sensor is ever left
 * unconnected, even a lone outlier (see meshTopology.js for the bridge
 * pass that guarantees this). Edge colour+thickness scale with distance
 * (short = thin/cool, long = thick/hot) so gaps are visible at a glance,
 * at any zoom level — this is meant to be read nationally first, then
 * zoomed in for local detail.
 * Draws edges ONLY — the dots themselves are SensorDotLayer's job (it owns
 * click/select), mounted on top of this layer in page.jsx.
 */

export default function MeshLayer({ stations = [], onDistanceRangeChange }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // Topology depends only on station positions/ids, not on isRaining, which
  // changes every live tick — so it's memoized on the id set, not `stations`.
  const stationIdKey = stations.map((s) => s.id).join(',');
  const { edges, minDistanceKm, maxDistanceKm } = useMemo(
    () => buildSensorMeshGraph(stations, { k: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stationIdKey],
  );
  const edgesRef = useRef(edges);
  const rangeRef = useRef({ minDistanceKm, maxDistanceKm });

  useEffect(() => {
    edgesRef.current = edges;
    rangeRef.current = { minDistanceKm, maxDistanceKm };
  }, [edges, minDistanceKm, maxDistanceKm]);

  // The legend (ColorRampLegend, in page.jsx) needs the same min/max this
  // layer just computed, to label the gradient with real km numbers —
  // report it up rather than recomputing the MST a second time there.
  useEffect(() => {
    onDistanceRangeChange?.({ minDistanceKm, maxDistanceKm });
  }, [minDistanceKm, maxDistanceKm, onDistanceRangeChange]);

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

      const { minDistanceKm: minKm, maxDistanceKm: maxKm } = rangeRef.current;
      const span = Math.max(maxKm - minKm, 1e-6);

      for (const { a, b, distanceKm } of edgesRef.current) {
        const pa = toPx(a), pb = toPx(b);
        if (!inBounds(pa) && !inBounds(pb)) continue;
        const t = Math.min(1, Math.max(0, (distanceKm - minKm) / span));
        ctx.strokeStyle = edgeDistanceToColor(t);
        ctx.lineWidth = 1 + t * 3; // 1px shortest edge -> 4px longest edge
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
