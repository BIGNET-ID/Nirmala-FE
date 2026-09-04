/**
 * Shared kernel-heatmap helpers — greyscale alpha kernels per point,
 * colourized through a 256×3 LUT. Used by both CanvasOverlay.jsx (Rain
 * Density / sensor coverage) and BmkgRainLayer.jsx (BMKG Cuaca). See
 * docs/superpowers/specs/2026-09-04-bmkg-cuaca-tile-design.md.
 */

/** Builds a 256×3 RGB lookup table by linearly interpolating between ramp stops. `ramp` is `[[t, [r,g,b]], ...]` sorted by ascending `t` (0-1), covering the full range. */
export function buildLUT(ramp) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = ramp[0], b = ramp[ramp.length - 1];
    for (let k = 0; k < ramp.length - 1; k++) {
      if (t >= ramp[k][0] && t <= ramp[k + 1][0]) { a = ramp[k]; b = ramp[k + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3]     = a[1][0] + (b[1][0] - a[1][0]) * f;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
  }
  return lut;
}

/** Meters-per-pixel at a given latitude/zoom on the Web Mercator projection — used to convert a real-world km radius into a screen-pixel kernel radius. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * Draws one radial-gradient kernel per point onto `sctx`, each point's own
 * peak alpha given by `pt.alpha` (0-1) — NOT a single shared constant, so
 * callers can encode either "every point is equally weighted" (Rain
 * Density's density-of-raining-sensors case: pass the same alpha for every
 * point) or "each point carries its own measured intensity" (BMKG's
 * precip_mm case: pass a different alpha per point).
 */
export function drawKernels(sctx, W, H, pts, radius) {
  sctx.clearRect(0, 0, W, H);
  for (const { x, y, alpha } of pts) {
    const g = sctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(x, y, radius, 0, Math.PI * 2);
    sctx.fill();
  }
}

/** Colourize the shadow's alpha channel through a LUT into a layer canvas. Output alpha (opacity on the map) is capped at `maxAlpha`; color choice uses the raw pre-cap alpha byte (0-255) as the LUT index. */
export function colourizeInto(layer, shadow, W, H, lut, maxAlpha) {
  const sctx = shadow.getContext('2d');
  const img = sctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;
    const li = alpha * 3;
    d[i] = lut[li];
    d[i + 1] = lut[li + 1];
    d[i + 2] = lut[li + 2];
    d[i + 3] = alpha > maxAlpha ? maxAlpha : alpha;
  }
  layer.width = W; layer.height = H;
  layer.getContext('2d').putImageData(img, 0, 0);
}
