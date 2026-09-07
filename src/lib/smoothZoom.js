/**
 * Google Maps' setZoom() has no built-in tween — it's always an instant
 * jump. This steps one integer zoom level at a time, waiting for each
 * level's tiles to settle ('idle') before advancing, so a large zoom
 * change reads as a smooth zoom-out/in instead of a jarring snap. Used by
 * the Himawari activation flow (see page.jsx) to bring the map back into
 * Himawari's usable 3-5 zoom range without disorienting the user.
 */
export function smoothZoomTo(map, targetZoom, onDone) {
  const current = map.getZoom();
  if (current === targetZoom) { onDone?.(); return; }
  const step = current > targetZoom ? -1 : 1;
  const listener = map.addListener('idle', () => {
    listener.remove();
    if (map.getZoom() === targetZoom) { onDone?.(); return; }
    smoothZoomTo(map, targetZoom, onDone);
  });
  map.setZoom(current + step);
}
