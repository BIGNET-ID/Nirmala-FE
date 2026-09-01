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
 *
 * Hover (desktop only — see below): moving the mouse near an edge
 * highlights it and draws a small canvas tooltip with its exact distance
 * and the two station ids, so "which line is the biggest gap" has a real
 * number instead of relying on eyeballing color/thickness. This is
 * deliberately mouse-hover-only, not tap — in Mesh Map mode a tap is
 * reserved for opening a sensor's detail drawer (SensorDotLayer), and a
 * tap near a node is almost always also near several of its edges, so
 * tap-for-tooltip would constantly fight tap-for-select.
 */

const HOVER_PX = 8;

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export default function MeshLayer({ stations = [], onDistanceRangeChange }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const hoverRef = useRef(null); // { edge, x, y } in canvas-local pixels, or null

  // Topology depends only on station positions/ids, not on isRaining, which
  // changes every live tick — so it's memoized on the id set, not `stations`.
  const stationIdKey = stations.map((s) => s.id).join(',');
  const { edges, minDistanceKm, maxDistanceKm } = useMemo(
    () => buildSensorMeshGraph(stations, { k: 16 }),
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
  // report it up rather than recomputing the mesh a second time there.
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

    // Shared by paint() and the hover hit-test — both need to convert a
    // station's lat/lng to the same canvas-local pixel space.
    const toPx = (st) => {
      const c = canvasRef.current;
      const projection = overlayRef.current?.getProjection();
      if (!c || !projection) return { x: 0, y: 0 };
      const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
      return { x: p.x - c._offsetX, y: p.y - c._offsetY };
    };

    const paint = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);

      const projection = overlayRef.current?.getProjection();
      if (!projection) return;
      const W = c.width, H = c.height, pad = 24;
      const inBounds = (p) => p.x >= -pad && p.x <= W + pad && p.y >= -pad && p.y <= H + pad;

      const { minDistanceKm: minKm, maxDistanceKm: maxKm } = rangeRef.current;
      const span = Math.max(maxKm - minKm, 1e-6);

      for (const edge of edgesRef.current) {
        const pa = toPx(edge.a), pb = toPx(edge.b);
        if (!inBounds(pa) && !inBounds(pb)) continue;
        const t = Math.min(1, Math.max(0, (edge.distanceKm - minKm) / span));
        ctx.strokeStyle = edgeDistanceToColor(t);
        ctx.lineWidth = 1 + t * 3; // 1px shortest edge -> 4px longest edge
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const hover = hoverRef.current;
      if (hover) {
        const pa = toPx(hover.edge.a), pb = toPx(hover.edge.b);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        const label1 = `${hover.edge.distanceKm.toFixed(2)} km`;
        const label2 = `${hover.edge.a.id} ↔ ${hover.edge.b.id}`;
        ctx.font = '600 11px sans-serif';
        const boxW = Math.max(ctx.measureText(label1).width, ctx.measureText(label2).width) + 16;
        const boxH = 36;
        const boxX = Math.min(hover.x + 12, W - boxW - 4);
        const boxY = Math.max(hover.y - boxH - 12, 4);
        ctx.fillStyle = 'rgba(10, 22, 40, 0.92)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px sans-serif';
        ctx.fillText(label1, boxX + 8, boxY + 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '400 10px sans-serif';
        ctx.fillText(label2, boxX + 8, boxY + 30);
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint();
      });
    };

    const handleMouseMove = (e) => {
      const c = canvasRef.current;
      const projection = overlayRef.current?.getProjection();
      if (!c || !projection || !e.latLng) return;
      const p = projection.fromLatLngToDivPixel(e.latLng);
      const x = p.x - c._offsetX, y = p.y - c._offsetY;

      let best = null, bestDist = HOVER_PX;
      for (const edge of edgesRef.current) {
        const pa = toPx(edge.a), pb = toPx(edge.b);
        const d = pointToSegmentDistance(x, y, pa.x, pa.y, pb.x, pb.y);
        if (d < bestDist) { bestDist = d; best = edge; }
      }
      hoverRef.current = best ? { edge: best, x, y } : null;
      scheduleDraw();
    };
    const handleMouseOut = () => {
      if (!hoverRef.current) return;
      hoverRef.current = null;
      scheduleDraw();
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

    const moveListener = map.addListener('mousemove', handleMouseMove);
    const outListener = map.addListener('mouseout', handleMouseOut);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      moveListener.remove();
      outListener.remove();
      overlay.setMap(null);
    };
  }, [map]);

  useEffect(() => { overlayRef.current?._repaint?.(); }, [edges]);

  return null;
}
