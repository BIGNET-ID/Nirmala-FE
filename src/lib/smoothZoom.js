/**
 * Google Maps' setZoom() has no built-in tween — it's always an instant
 * jump. This steps one integer zoom level at a time, waiting for each
 * level's tiles to settle ('idle') before advancing, so a large zoom
 * change reads as a smooth zoom-out/in instead of a jarring snap. Used by
 * the Himawari activation flow (see page.jsx) to bring the map back into
 * Himawari's usable 3-5 zoom range without disorienting the user.
 *
 * Cancellable: if the user manually zooms/pans (or anything else moves the
 * map) while a tween is still stepping, the 'idle' event that fires is not
 * necessarily the one our own setZoom triggered — it might be the user's.
 * Each step therefore checks the OBSERVED zoom against the exact level we
 * asked for; a mismatch means something else drove that 'idle' event, so
 * we bail instead of recursing (which would otherwise fight the user by
 * forcing the zoom back toward the original target). Returns a cancel()
 * function callers can use to explicitly abort a pending tween too, e.g.
 * before starting a new one.
 */
export function smoothZoomTo(map, targetZoom, onDone) {
  let cancelled = false;

  function step(current) {
    if (cancelled) return;
    if (current === targetZoom) { onDone?.(); return; }
    const dir = current > targetZoom ? -1 : 1;
    const next = current + dir;
    const listener = map.addListener('idle', () => {
      listener.remove();
      if (cancelled) return;
      const observed = map.getZoom();
      // Not the level we asked for — someone else (the user) drove this
      // 'idle' event. Stop here rather than continuing toward targetZoom.
      if (observed !== next) return;
      step(observed);
    });
    map.setZoom(next);
  }

  step(map.getZoom());

  return () => { cancelled = true; };
}
