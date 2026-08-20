'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { recolorToTransparentPng } from '@/lib/jmaHimawariRecolor';

const CROSSFADE_MS = 400;

/**
 * Himawari (JMA) satellite overlay. Unlike OpenWeatherLayer (a z/x/y tile
 * pyramid), JMA returns ONE static JPEG per timestamp covering a fixed
 * lat/lng box — so this uses google.maps.GroundOverlay, not ImageMapType.
 *
 * JMA has no manifest telling us which timestamps actually have a published
 * image (unlike the old bignet API), and the newest frame is sometimes not
 * published yet when we ask for it. `candidateUrls` lets the caller supply a
 * fallback chain (newest first) — this preloads each with a plain Image()
 * (not GroundOverlay directly) so a load failure can be caught and the next
 * candidate tried, instead of silently showing a blank overlay.
 *
 * Each successfully-loaded frame is recolored client-side (see
 * jmaHimawariRecolor.js) so only the magenta "rainfall potential" shapes
 * show, transparent everywhere else — the app's own basemap stays visible.
 * Recoloring needs pixel-level canvas access, which requires the image to
 * be loaded with crossOrigin='anonymous' (JMA's server supports this — see
 * this plan's Global Constraints).
 *
 * Frame changes crossfade over CROSSFADE_MS instead of an abrupt swap:
 * GroundOverlay.setOpacity() is animated on both the incoming and outgoing
 * overlay simultaneously via requestAnimationFrame, then the outgoing one
 * is removed. This requires the per-tick effect's cleanup to NOT tear down
 * the currently-visible overlay (only the two guard/exhausted branches
 * below do that) — otherwise the "outgoing" overlay would already be gone
 * by the time the next tick's image finishes loading/recoloring, and the
 * crossfade would just be a fade-in from blank every time. Actual teardown
 * on unmount is handled by the separate mount-only effect at the bottom.
 */
export default function HimawariLayer({ active, candidateUrls = [], bounds, opacity = 0.7, onStatus }) {
  const map = useMap();
  const overlayRef = useRef(null);
  const prevOverlayRef = useRef(null);
  const fadeRafRef = useRef(0);
  // Stabilize on URL content, not array identity — useJmaHimawariTicks
  // rebuilds its tick array every 60s even when the underlying URLs haven't
  // changed (the 10-minute bucket didn't roll), and depending on
  // `candidateUrls` by reference would tear down and rebuild the overlay
  // every minute for no reason.
  const urlKey = candidateUrls.join('|');

  useEffect(() => {
    if (!map || !window.google || !active || !candidateUrls.length || !bounds) {
      cancelAnimationFrame(fadeRafRef.current);
      overlayRef.current?.setMap(null);
      prevOverlayRef.current?.setMap(null);
      overlayRef.current = null;
      prevOverlayRef.current = null;
      onStatus?.('ok'); // nothing to show is not a failure — hide any stale "unavailable" message
      return;
    }

    let cancelled = false;
    let currentImg = null;
    onStatus?.('loading');

    const crossfadeIn = (dataUrl, gmBounds) => {
      const outgoing = overlayRef.current;
      const incoming = new window.google.maps.GroundOverlay(dataUrl, gmBounds, { opacity: 0 });
      incoming.setMap(map);
      prevOverlayRef.current = outgoing;
      overlayRef.current = incoming;

      cancelAnimationFrame(fadeRafRef.current);
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / CROSSFADE_MS);
        incoming.setOpacity(t * opacity);
        outgoing?.setOpacity((1 - t) * opacity);
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          outgoing?.setMap(null);
          if (prevOverlayRef.current === outgoing) prevOverlayRef.current = null;
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    };

    const tryCandidate = (i) => {
      if (i >= candidateUrls.length) {
        if (cancelled) return;
        cancelAnimationFrame(fadeRafRef.current);
        overlayRef.current?.setMap(null);
        prevOverlayRef.current?.setMap(null);
        overlayRef.current = null;
        prevOverlayRef.current = null;
        onStatus?.('unavailable');
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[HimawariLayer] all candidate frames failed to load:', candidateUrls);
        }
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      currentImg = img;
      img.onload = () => {
        if (cancelled) return;
        let dataUrl;
        try {
          dataUrl = recolorToTransparentPng(img);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[HimawariLayer] recolor failed, trying next candidate:', err);
          }
          tryCandidate(i + 1);
          return;
        }
        if (cancelled) return;
        const gmBounds = new window.google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        crossfadeIn(dataUrl, gmBounds);
        onStatus?.('ok');
      };
      img.onerror = () => { if (!cancelled) tryCandidate(i + 1); };
      img.src = candidateUrls[i];
    };
    tryCandidate(0);

    return () => {
      cancelled = true;
      if (currentImg) currentImg.src = ''; // abort any in-flight preload
      // Deliberately does NOT touch overlayRef/prevOverlayRef/fadeRafRef
      // here — this cleanup runs on every re-render where urlKey changes
      // (e.g. the user scrubbing to a new tick), and the currently-visible
      // overlay (and any crossfade already in progress) must keep showing
      // until the NEXT tick's own tryCandidate/crossfadeIn explicitly takes
      // over as `outgoing`. See the two branches above (inactive/no
      // candidates, and exhausted candidates) for the only cases that
      // actually mean "there's nothing to show" — and the mount-only effect
      // below for teardown on real unmount.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, urlKey, bounds, opacity, onStatus]);

  // Real unmount only (empty deps) — the per-tick effect above deliberately
  // leaves the overlay in place across ordinary re-runs, so something has
  // to remove it when this component actually leaves the tree (e.g. the
  // user switches away from Himawari mode entirely).
  useEffect(() => {
    return () => {
      cancelAnimationFrame(fadeRafRef.current);
      overlayRef.current?.setMap(null);
      prevOverlayRef.current?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
