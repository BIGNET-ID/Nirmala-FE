'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { statusColor, SENSOR_STATUS_COLOR } from '@/lib/sensorColor';
import { clusterPoints } from '@/lib/clusterPoints';

/**
 * Minimal sensor dots rendered on a canvas OverlayView (BIGNET DS v19).
 *
 * Replaces the old heavy AdvancedMarker rings (which needed a mapId and blocked
 * the dark map style). A canvas layer scales to thousands of points cheaply and
 * needs no mapId. Dots are coloured by status; the selected sensor gets a cyan
 * highlight ring that gently pulses (disabled under prefers-reduced-motion).
 * Clicks are hit-tested against the last rendered points and open the drawer.
 *
 * `focus` (Node Sensor mode): dots render larger and ignore `showMarkers` —
 * in that mode the dots ARE the view, not an optional overlay.
 */

const DOT_R = 2.6;
const DOT_R_RAIN = 3.2;
const FOCUS_SCALE = 1.8;
const HIT_PX = 11;

// Clustering (Node Sensor mode only) — grid-bucket by on-screen pixel
// proximity, not a fixed zoom threshold, so dense areas (Java) cluster while
// sparse areas split naturally at the same zoom level.
const CLUSTER_CELL_PX = 48;
const CLUSTER_MIN_R = 18;
const CLUSTER_MAX_EXTRA_R = 14;
const clusterRadius = (count) => CLUSTER_MIN_R + Math.min(CLUSTER_MAX_EXTRA_R, Math.sqrt(count));
const clusterColor = (c) => {
  if (c.hasBlacklisted) return SENSOR_STATUS_COLOR.blacklisted;
  if (c.hasInactive) return SENSOR_STATUS_COLOR.inactive;
  if (c.isRaining) return SENSOR_STATUS_COLOR.raining;
  return SENSOR_STATUS_COLOR.active;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function SensorDotLayer({ stations, showMarkers = true, selectedId = null, onSelect, focus = false }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const pulseRef = useRef(0);
  const renderedRef = useRef([]);   // [{ st, x, y }] in canvas coords (unclustered/single dots)
  const clusteredRef = useRef([]);  // [{ x, y, r, count, items }] in canvas coords (Node Sensor mode)
  const stationsRef = useRef(stations);
  const showRef = useRef(showMarkers);
  const focusRef = useRef(focus);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { showRef.current = showMarkers; }, [showMarkers]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!map || !window.google) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = showRef.current ? '' : 'none';
    canvasRef.current = canvas;

    let pulseT = 0;

    const paint = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      renderedRef.current = [];
      clusteredRef.current = [];
      if (!showRef.current) return;

      const projection = overlayRef.current?.getProjection();
      if (!projection) return;
      const W = c.width, H = c.height, pad = 24;

      const drawDot = (st, x, y) => {
        const color = statusColor(st);
        const scale = focusRef.current ? FOCUS_SCALE : 1;
        const r = (st.isRaining ? DOT_R_RAIN : DOT_R) * scale;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      if (!focusRef.current) {
        // Live/Kerapatan Hujan/Mesh modes: unclustered, as before.
        for (const st of stationsRef.current) {
          const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
          const x = p.x - c._offsetX;
          const y = p.y - c._offsetY;
          if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
          renderedRef.current.push({ st, x, y });
          drawDot(st, x, y);
        }
      } else {
        // Node Sensor mode: cluster nearby dots by on-screen proximity.
        const projected = [];
        for (const st of stationsRef.current) {
          const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(st.lat, st.lng));
          const x = p.x - c._offsetX;
          const y = p.y - c._offsetY;
          if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
          projected.push({ st, x, y });
        }
        const { clusters, singles } = clusterPoints(projected, CLUSTER_CELL_PX);

        for (const { st, x, y } of singles) {
          renderedRef.current.push({ st, x, y });
          drawDot(st, x, y);
        }

        for (const cl of clusters) {
          const r = clusterRadius(cl.count);
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, r, 0, Math.PI * 2);
          ctx.fillStyle = clusterColor(cl);
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = "700 12px 'Google Sans Flex', Arial, sans-serif";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(cl.count), cl.x, cl.y);

          clusteredRef.current.push({ x: cl.x, y: cl.y, r, count: cl.count, items: cl.items });
        }
      }

      // Selected highlight (cyan ring, optional pulse).
      const sel = renderedRef.current.find((p) => p.st.id === selectedRef.current);
      if (sel) {
        const base = 7;
        const grow = prefersReducedMotion() ? 0 : (Math.sin(pulseT) * 0.5 + 0.5) * 5;
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, base + grow, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9 - (grow / 5) * 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // solid centre dot on selected
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fill();
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint();
      });
    };

    const startPulse = () => {
      if (pulseRef.current || prefersReducedMotion()) return;
      const loop = () => {
        pulseT += 0.12;
        paint();
        pulseRef.current = requestAnimationFrame(loop);
      };
      pulseRef.current = requestAnimationFrame(loop);
    };
    const stopPulse = () => {
      if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
      pulseRef.current = 0;
    };

    class DotOverlay extends window.google.maps.OverlayView {
      onAdd() {
        this.getPanes().overlayLayer.appendChild(canvas);
        this._click = map.addListener('click', (e) => {
          if (!showRef.current || !onSelectRef.current) return;
          const projection = this.getProjection();
          if (!projection || !e.latLng) return;
          const cp = projection.fromLatLngToDivPixel(e.latLng);
          const cx = cp.x - canvas._offsetX;
          const cy = cp.y - canvas._offsetY;

          // Clusters sit visually on top and are larger — test them first.
          for (const cl of clusteredRef.current) {
            const dx = cl.x - cx, dy = cl.y - cy;
            if (dx * dx + dy * dy <= cl.r * cl.r) {
              let south = 90, west = 180, north = -90, east = -180;
              for (const { st } of cl.items) {
                south = Math.min(south, st.lat); north = Math.max(north, st.lat);
                west = Math.min(west, st.lng); east = Math.max(east, st.lng);
              }
              if (south === north && west === east) {
                map.setCenter({ lat: south, lng: west });
                map.setZoom(Math.min((map.getZoom() ?? 5) + 3, 18));
              } else {
                map.fitBounds(
                  new window.google.maps.LatLngBounds({ lat: south, lng: west }, { lat: north, lng: east }),
                  48,
                );
              }
              return;
            }
          }

          let best = null, bestD = HIT_PX * HIT_PX;
          for (const pt of renderedRef.current) {
            const dx = pt.x - cx, dy = pt.y - cy, d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = pt.st; }
          }
          if (best) onSelectRef.current(best);
        });
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const bounds = map.getBounds();
        if (!bounds) return;
        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
        const left = Math.min(sw.x, ne.x);
        const top = Math.min(sw.y, ne.y);
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

      onRemove() {
        if (this._click) this._click.remove();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    const overlay = new DotOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    overlayRef.current._startPulse = startPulse;
    overlayRef.current._stopPulse = stopPulse;
    overlayRef.current._repaint = scheduleDraw;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      stopPulse();
      overlay.setMap(null);
    };
  }, [map]);

  // React to selection / data / toggle changes.
  useEffect(() => {
    selectedRef.current = selectedId;
    const o = overlayRef.current;
    if (!o) return;
    o._repaint?.();
    if (selectedId) o._startPulse?.();
    else o._stopPulse?.();
  }, [selectedId]);

  // Bulletproof show/hide: toggle the canvas element itself, independent of the
  // paint pipeline, then repaint so re-enabling reflects the latest data.
  useEffect(() => {
    const c = canvasRef.current;
    if (c) c.style.display = showMarkers ? '' : 'none';
    overlayRef.current?._repaint?.();
  }, [showMarkers]);

  useEffect(() => { overlayRef.current?._repaint?.(); }, [stations]);
  useEffect(() => { overlayRef.current?._repaint?.(); }, [focus]);

  return null;
}
