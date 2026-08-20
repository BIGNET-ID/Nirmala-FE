/**
 * Recolors JMA's raw "Heavy Rainfall Potential Areas" JPEG into a
 * transparent-background PNG: only the magenta "rainfall potential" blobs
 * are kept (recolored to the app's brand cyan), everything else — plain
 * sky/cloud grayscale, JMA's own green country-border overlay lines — is
 * made fully transparent so the app's own basemap and coastlines stay
 * visible underneath.
 *
 * Thresholds were derived by sampling actual pixel values from a live
 * r2w_hrp_*.jpg (see docs/superpowers/specs/2026-08-20-jma-himawari-migration-design.md):
 * true magenta blobs cluster at R in [201,255], G in [0,53], B in [120,203];
 * plain grayscale sky/cloud has R=G=B; JMA's green border lines have low
 * R/B and mid-range G. `isMagentaPixel` uses a slightly wider margin than
 * the sampled cluster to tolerate JPEG compression noise at blob edges.
 *
 * Requires `image` to have been loaded with `crossOrigin = 'anonymous'` —
 * see this plan's Global Constraints for why that's safe to rely on with
 * JMA's server specifically.
 */

export const DEFAULT_RECOLOR_TARGET = { r: 0, g: 229, b: 255, a: 217 }; // var(--nirmala-cyan), ~0.85 alpha

export function isMagentaPixel(r, g, b) {
  return r >= 180 && g <= 70 && b >= 100;
}

/**
 * Draws `image` (an already-loaded, CORS-clean HTMLImageElement) to an
 * offscreen canvas, recolors magenta pixels to `target`, makes everything
 * else transparent, and returns a `data:image/png` URL. Synchronous once
 * the image is decoded — no network calls. Throws (SecurityError) if
 * `image` wasn't loaded with `crossOrigin = 'anonymous'`.
 */
export function recolorToTransparentPng(image, target = DEFAULT_RECOLOR_TARGET) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (isMagentaPixel(data[i], data[i + 1], data[i + 2])) {
      data[i] = target.r;
      data[i + 1] = target.g;
      data[i + 2] = target.b;
      data[i + 3] = target.a;
    } else {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
