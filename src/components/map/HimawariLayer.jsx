'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { buildJmaHimawariTileUrl } from '@/lib/jmaHimawari';

const CROSSFADE_MS = 400;
const TILE_SIZE = 256;

// Fixed probe tile used only to check whether a basetime has been published
// yet. z=0/x=0/y=0 covers the entire globe in a single tile, so it always
// falls inside JMA's full-disk ('fd') footprint regardless of which part of
// the world the map viewport is currently showing — no need to convert the
// current viewport into tile coordinates just to ask "does this basetime
// exist yet?". All z/x/y tiles for one basetime are published together (or
// not at all), so checking this one tile is a valid stand-in for the whole
// pyramid.
const PROBE_TILE = { z: 0, x: 0, y: 0 };

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

export default function HimawariLayer({ active, candidateBasetimes = [], opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  // Stabilize on basetime content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying basetimes
  // haven't changed (the 10-minute bucket didn't roll), and depending on
  // `candidateBasetimes` by reference would tear down and rebuild the
  // overlay every minute for no reason.
  const basetimeKey = candidateBasetimes.join('|');

  useEffect(() => {
    if (!map || !window.google || !active || !candidateBasetimes.length) {
      cancelAnimationFrame(fadeRafRef.current);
      if (overlayRef.current) removeOverlayMapType(map, overlayRef.current);
      if (prevOverlayRef.current) removeOverlayMapType(map, prevOverlayRef.current);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
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
      // forever (reachable by scrubbing across cached ticks faster than
      // CROSSFADE_MS).
      if (prevOverlayRef.current && prevOverlayRef.current !== outgoing) {
        removeOverlayMapType(map, prevOverlayRef.current);
      }
      const incoming = makeImageMapType(basetime, 0);
      map.overlayMapTypes.push(incoming);
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
    };

    // Debounce: scrubbing the time-travel slider can change `basetimeKey`
    // many times per second (every intermediate drag position), and each
    // attempt costs a probe request — skip intermediate positions instead
    // of doing that work for frames the user never settles on. This also
    // shrinks (though doesn't by itself eliminate — see the crossfadeIn
    // finalize step above) the window for two crossfades to overlap.
    const debounceId = setTimeout(() => tryCandidate(0), 200);

    return () => {
      cancelled = true;
      clearTimeout(debounceId);
      // Deliberately does NOT touch overlayRef/prevOverlayRef/fadeRafRef
      // here — this cleanup runs on every re-render where basetimeKey
      // changes (e.g. the user scrubbing to a new tick), and the
      // currently-visible map type (and any crossfade already in progress)
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
      }
      overlayRef.current = null;
      prevOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
