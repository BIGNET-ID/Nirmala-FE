/**
 * Web Worker untuk Kalkulasi IDW Heatmap Tanpa Mengganggu Main Thread UI
 */
self.onmessage = function (e) {
  const { width, height, stations, activeLayer, power = 2, step = 4 } = e.data;

  const totalBytes = width * height * 4;
  const buffer = new ArrayBuffer(totalBytes);
  const pixelData = new Uint8ClampedArray(buffer);

  const numStations = stations.length;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let weightSum = 0;
      let valueSum = 0;
      let exactMatch = false;
      let exactValue = 0;

      for (let i = 0; i < numStations; i++) {
        const st = stations[i];
        const dx = x - st.px;
        const dy = y - st.py;
        const distSq = dx * dx + dy * dy;

        if (distSq < 1.0) {
          exactMatch = true;
          exactValue = st.val;
          break;
        }

        const w = 1 / Math.pow(distSq, power / 2);
        weightSum += w;
        valueSum += w * st.val;
      }

      const val = exactMatch ? exactValue : valueSum / weightSum;

      // Map Nilai ke Warna RGBA
      const [r, g, b, a] = getColorForValue(val, activeLayer);

      // Fill Sub-grid (step x step)
      for (let sy = 0; sy < step && y + sy < height; sy++) {
        for (let sx = 0; sx < step && x + sx < width; sx++) {
          const index = ((y + sy) * width + (x + sx)) * 4;
          pixelData[index] = r;
          pixelData[index + 1] = g;
          pixelData[index + 2] = b;
          pixelData[index + 3] = a;
        }
      }
    }
  }

  // Transferable Objects (Zero Memory Copy)
  self.postMessage({ buffer, width, height }, [buffer]);
};

function getColorForValue(val, layer) {
  if (layer === 'rain') {
    if (val < 5) return [0, 0, 0, 0];
    if (val < 25) return [0, 229, 255, 120];  // Cyan
    if (val < 50) return [0, 230, 118, 160];  // Hijau
    if (val < 75) return [255, 235, 59, 190]; // Kuning
    if (val < 100) return [255, 152, 0, 210]; // Oranye
    return [244, 67, 54, 235];                // Merah
  } else {
    const norm = Math.max(0, Math.min(1, (val - 20) / 16));
    const hue = (1 - norm) * 240;
    return hslToRgba(hue, 0.85, 0.5, 0.55);
  }
}

function hslToRgba(h, s, l, a) {
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    Math.round(a * 255)
  ];
}
