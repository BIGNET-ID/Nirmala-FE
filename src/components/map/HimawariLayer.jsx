'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildJmaHimawariTileUrl } from '@/lib/jmaHimawari';
import { MAP_MIN_ZOOM } from '@/constants/mapConfig';

const CROSSFADE_MS = 400;
const TILE_SIZE = 256;
const MIN_ZOOM = MAP_MIN_ZOOM;
const MAX_ZOOM = 5;

// Fixed probe tile used only to check whether a basetime has been published
// yet. z=0/x=0/y=0 would be convenient (one tile covering the whole globe,
// no viewport-to-tile conversion needed) but JMA does not serve those low
// zooms for this product at all — z=0/1/2 404 unconditionally for every
// basetime, even ones whose real z=5+ viewport tiles return 200 (verified
// empirically against JMA's live server). z=5/x=26/y=12 (a point well within
// the satellite's visible disk, around 41°N — roughly Japan/Korea, not
// Indonesia — confirmed live to return 200 for real basetimes and 404 for
// bogus ones) is used instead. All z/x/y tiles for one basetime are
// still published together (or not at all), so checking this one
// confirmed-valid tile remains a correct stand-in for the whole pyramid.
const PROBE_TILE = { z: 5, x: 26, y: 12 };

/**
 * Himawari (JMA) satellite overlay. Renders JMA's "Cloud-top Enhanced"
 * (IR-Enhanced) product as a z/x/y tile pyramid via google.maps.ImageMapType
 * — the same approach OpenWeatherLayer.jsx uses for OpenWeather tiles,
 * unlike the old GroundOverlay+client-recolor approach this replaces (see
 * docs/superpowers/specs/2026-08-21-jma-himawari-ir-enhanced-migration-design.md).
 * JMA's tiles are already colorized server-side, so no canvas recolor step
 * is needed here at all.
 *
 * JMA has no manifest telling us which basetimes actually have published
 * tiles (same situation as the old HRP product) — `candidateBasetimes` lets
 * the caller supply a fallback chain (newest first); each candidate is
 * probed with a single fixed tile (see PROBE_TILE) before being committed
 * to, so a not-yet-published basetime doesn't show a half-loaded layer.
 *
 * Frame changes crossfade over CROSSFADE_MS instead of an abrupt swap:
 * ImageMapType.setOpacity() is animated on both the incoming and outgoing
 * map types simultaneously via requestAnimationFrame, then the outgoing one
 * is removed from map.overlayMapTypes. This requires the per-tick effect's
 * cleanup to NOT tear down the currently-visible map type (only the two
 * guard/exhausted branches below do that) — otherwise the "outgoing" map
 * type would already be gone by the time the next tick's probe resolves,
 * and the crossfade would just be a fade-in from blank every time. Actual
 * teardown on unmount is handled by the separate mount-only effect at the
 * bottom.
 *
 * map.overlayMapTypes is shared with OpenWeatherLayer.jsx (both can be
 * active at once — Himawari mode plus an OpenWeather layer selection are
 * independent toggles in page.jsx) — map types are always removed by
 * identity (removeOverlayMapType below), never by a stored index, since the
 * array's indices shift whenever the other layer pushes/removes its own
 * entry.
 */

function removeOverlayMapType(map, type) {
  const arr = map.overlayMapTypes;
  for (let i = arr.getLength() - 1; i >= 0; i--) {
    if (arr.getAt(i) === type) { arr.removeAt(i); return; }
  }
}

function makeImageMapType(basetime, opacity) {
  return new window.google.maps.ImageMapType({
    name: `himawari-${basetime}`,
    tileSize: new window.google.maps.Size(TILE_SIZE, TILE_SIZE),
    opacity,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    getTileUrl: (coord, zoom) => {
      const n = 1 << zoom;
      const x = ((coord.x % n) + n) % n; // wrap horizontally
      if (coord.y < 0 || coord.y >= n) return null;
      return buildJmaHimawariTileUrl(basetime, zoom, x, coord.y);
    },
  });
}

function probeBasetime(basetime) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = buildJmaHimawariTileUrl(basetime, PROBE_TILE.z, PROBE_TILE.x, PROBE_TILE.y);
  });
}

export default function HimawariLayer({ active, candidateBasetimes = [], prefetchBasetime = null, opacity = 0.50, onStatus, onZoomRangeChange, onBasetimeResolved }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  const preloadsRef = useRef([]); // Array<{basetime, type}> — hidden (opacity 0) map types warming the browser's tile cache; usually 0-2 entries (one that might still be reused as the current frame, one being warmed for the frame after)
  // Stabilize on basetime content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying basetimes
  // haven't changed (the 10-minute bucket didn't roll), and depending on
  // `candidateBasetimes` by reference would tear down and rebuild the
  // overlay every minute for no reason.
  const basetimeKey = candidateBasetimes.join('|');

  // While playing, warm the browser's HTTP cache for the *next* frame's
  // actual viewport tiles (not just the single probe tile) while the
  // current frame is still showing, by pushing a hidden (opacity 0)
  // ImageMapType for it — Google Maps will issue real tile requests for the
  // current viewport against this type immediately. When the timeline
  // actually advances to this basetime, crossfadeIn (below) reuses this
  // already-warm map type instead of creating a fresh one, so the fade-in
  // doesn't stall on network fetches.
  useEffect(() => {
    if (!map || !window.google || !active) return;
    // Drop any preload that's neither still a live candidate (might yet be
    // reused by crossfadeIn for the current tick) nor the upcoming prefetch
    // target — this runs even when there's nothing new to prefetch (e.g.
    // Play just paused), so a stale preload never lingers in
    // map.overlayMapTypes issuing invisible tile requests forever.
    preloadsRef.current = preloadsRef.current.filter((p) => {
      const keep = candidateBasetimes.includes(p.basetime) || p.basetime === prefetchBasetime;
      if (!keep) removeOverlayMapType(map, p.type);
      return keep;
    });
    if (!prefetchBasetime) return;
    if (preloadsRef.current.some((p) => p.basetime === prefetchBasetime)) return;
    const type = makeImageMapType(prefetchBasetime, 0);
    map.overlayMapTypes.push(type);
    preloadsRef.current.push({ basetime: prefetchBasetime, type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, prefetchBasetime, basetimeKey]);

  // JMA only serves this product at zoom MIN_ZOOM..MAX_ZOOM (see
  // makeImageMapType) — outside that range Google Maps simply renders
  // nothing for this map type, which looks identical to a data failure
  // unless the caller is told to explain it differently. Report the
  // in-range/out-of-range state separately from onStatus (which is about
  // data availability, not zoom) so page.jsx can show a distinct "zoom to
  // 3-5" hint instead of the "citra tidak tersedia" message.
  useEffect(() => {
    if (!map || !window.google || !active) { onZoomRangeChange?.(true); return; }
    const checkZoom = () => {
      const zoom = map.getZoom();
      onZoomRangeChange?.(zoom >= MIN_ZOOM && zoom <= MAX_ZOOM);
    };
    checkZoom();
    const listener = map.addListener('zoom_changed', checkZoom);
    return () => listener.remove();
  }, [map, active, onZoomRangeChange]);

  useEffect(() => {
    if (!map || !window.google || !active || !candidateBasetimes.length) {
      cancelAnimationFrame(fadeRafRef.current);
      if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
      if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      onBasetimeResolved?.(null);
      return;
    }

    let cancelled = false;
    onStatus?.('loading');

    const crossfadeIn = (basetime) => {
      const outgoing = overlayRef.current;
      cancelAnimationFrame(fadeRafRef.current);
      // Finalize whatever the previous crossfade left mid-flight — cancelling
      // its rAF loop above means its own `outgoing` (tracked in
      // prevOverlayRef) never reaches the t>=1 branch that would remove it,
      // so it would otherwise be stranded on the map at a partial opacity
      // forever (reachable if `basetimeKey` advances across cached ticks
      // faster than CROSSFADE_MS).
      if (prevOverlayRef.current && prevOverlayRef.current !== outgoing) {
        removeOverlayMapType(map, prevOverlayRef.current);
      }
      let incoming;
      const preloadIdx = preloadsRef.current.findIndex((p) => p.basetime === basetime);
      if (preloadIdx !== -1) {
        incoming = preloadsRef.current[preloadIdx].type;
        preloadsRef.current.splice(preloadIdx, 1);
      } else {
        incoming = makeImageMapType(basetime, 0);
        map.overlayMapTypes.push(incoming);
      }
      prevOverlayRef.current = outgoing;
      overlayRef.current = incoming;

      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / CROSSFADE_MS);
        incoming.setOpacity(t * opacity);
        outgoing?.setOpacity((1 - t) * opacity);
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          if (outgoing) removeOverlayMapType(map, outgoing);
          if (prevOverlayRef.current === outgoing) prevOverlayRef.current = null;
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    };

    const tryCandidate = async (i) => {
      if (i >= candidateBasetimes.length) {
        if (cancelled) return;
        cancelAnimationFrame(fadeRafRef.current);
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
        overlayRef.current = null;
        prevOverlayRef.current = null;
        onStatus?.('unavailable');
        onBasetimeResolved?.(null);
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate basetimes failed to probe:', candidateBasetimes);
        }
        return;
      }

      const basetime = candidateBasetimes[i];
      const ok = await probeBasetime(basetime);
      if (cancelled) return;
      if (!ok) { tryCandidate(i + 1); return; }
      crossfadeIn(basetime);
      onStatus?.('ok');
      onBasetimeResolved?.(basetime);
    };

    // Debounce: `basetimeKey` can change in quick succession (e.g. switching
    // layers back and forth, or the tick-refresh interval rolling the ticks
    // forward), and each attempt costs a probe request — skip transient
    // intermediate values instead of doing that work for a basetime we're
    // about to move past anyway. This also shrinks (though doesn't by
    // itself eliminate — see the crossfadeIn finalize step above) the
    // window for two crossfades to overlap.
    const debounceId = setTimeout(() => tryCandidate(0), 200);

    return () => {
      cancelled = true;
      clearTimeout(debounceId);
      // Deliberately does NOT touch overlayRef/prevOverlayRef/fadeRafRef
      // here — this cleanup runs on every re-render where basetimeKey
      // changes (e.g. the tick-refresh interval rolling to a new tick), and
      // the currently-visible map type (and any crossfade already in progress)
      // must keep showing until the NEXT tick's own tryCandidate/crossfadeIn
      // explicitly takes over as `outgoing`. See the two branches above
      // (inactive/no candidates, and exhausted candidates) for the only
      // cases that actually mean "there's nothing to show" — and the
      // mount-only effect below for teardown on real unmount.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, basetimeKey, opacity, onStatus]);

  // Real unmount only (empty deps) — the per-tick effect above deliberately
  // leaves the map type in place across ordinary re-runs, so something has
  // to remove it when this component actually leaves the tree (e.g. the
  // user switches away from Himawari mode entirely).
  useEffect(() => {
    return () => {
      cancelAnimationFrame(fadeRafRef.current);
      if (map) {
        if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
        if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
        preloadsRef.current.forEach((p) => removeOverlayMapType(map, p.type));
      }
      overlayRef.current = null;
      prevOverlayRef.current = null;
      preloadsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
