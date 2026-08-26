/**
 * Indonesian provinces (BPS/Kemendagri 2-digit codes) with an approximate
 * bounding box for client-side pan/zoom (PRD §4.3 Auto Bounding-Box Zoom).
 *
 * These boxes are NOT precise administrative polygons — they're generous
 * rectangles good enough for map fitBounds() and rough sensor-count
 * filtering (see src/lib/provinceFilter.js). Swap to real polygons / the
 * backend's own `province_code` once it's available on /api/sensors.
 */
export const PROVINCES = [
  { code: '11', name: 'Aceh', bounds: { north: 6.05, south: 1.85, west: 94.85, east: 98.30 } },
  { code: '12', name: 'Sumatera Utara', bounds: { north: 4.25, south: -0.60, west: 96.50, east: 100.00 } },
  { code: '13', name: 'Sumatera Barat', bounds: { north: 0.55, south: -3.35, west: 98.50, east: 101.90 } },
  { code: '14', name: 'Riau', bounds: { north: 2.60, south: -1.30, west: 100.00, east: 104.40 } },
  { code: '15', name: 'Jambi', bounds: { north: -0.45, south: -2.85, west: 101.00, east: 104.90 } },
  { code: '16', name: 'Sumatera Selatan', bounds: { north: -1.10, south: -5.00, west: 102.00, east: 106.40 } },
  { code: '17', name: 'Bengkulu', bounds: { north: -2.00, south: -5.35, west: 101.00, east: 103.90 } },
  { code: '18', name: 'Lampung', bounds: { north: -3.40, south: -6.00, west: 103.40, east: 106.10 } },
  { code: '19', name: 'Kepulauan Bangka Belitung', bounds: { north: -1.15, south: -3.60, west: 105.00, east: 108.90 } },
  { code: '21', name: 'Kepulauan Riau', bounds: { north: 4.90, south: -1.20, west: 103.00, east: 109.60 } },
  { code: '31', name: 'DKI Jakarta', bounds: { north: -5.10, south: -6.35, west: 106.65, east: 106.97 } },
  { code: '32', name: 'Jawa Barat', bounds: { north: -5.85, south: -7.85, west: 106.35, east: 108.90 } },
  { code: '33', name: 'Jawa Tengah', bounds: { north: -5.75, south: -8.30, west: 108.50, east: 111.50 } },
  { code: '34', name: 'DI Yogyakarta', bounds: { north: -7.60, south: -8.25, west: 110.00, east: 110.85 } },
  { code: '35', name: 'Jawa Timur', bounds: { north: -6.45, south: -8.80, west: 111.00, east: 116.50 } },
  { code: '36', name: 'Banten', bounds: { north: -5.70, south: -7.05, west: 105.10, east: 106.65 } },
  { code: '51', name: 'Bali', bounds: { north: -8.05, south: -8.90, west: 114.40, east: 115.75 } },
  { code: '52', name: 'Nusa Tenggara Barat', bounds: { north: -8.10, south: -9.10, west: 115.80, east: 119.40 } },
  { code: '53', name: 'Nusa Tenggara Timur', bounds: { north: -8.10, south: -11.10, west: 118.80, east: 125.50 } },
  { code: '61', name: 'Kalimantan Barat', bounds: { north: 2.10, south: -3.10, west: 108.00, east: 114.20 } },
  { code: '62', name: 'Kalimantan Tengah', bounds: { north: 0.90, south: -3.60, west: 110.60, east: 115.90 } },
  { code: '63', name: 'Kalimantan Selatan', bounds: { north: -1.00, south: -4.20, west: 114.20, east: 116.60 } },
  { code: '64', name: 'Kalimantan Timur', bounds: { north: 3.30, south: -2.70, west: 113.90, east: 119.10 } },
  { code: '65', name: 'Kalimantan Utara', bounds: { north: 4.30, south: 1.90, west: 114.50, east: 118.20 } },
  { code: '71', name: 'Sulawesi Utara', bounds: { north: 5.50, south: -0.90, west: 121.00, east: 127.00 } },
  { code: '72', name: 'Sulawesi Tengah', bounds: { north: 2.00, south: -3.50, west: 119.20, east: 124.20 } },
  { code: '73', name: 'Sulawesi Selatan', bounds: { north: -0.90, south: -8.40, west: 118.70, east: 121.60 } },
  { code: '74', name: 'Sulawesi Tenggara', bounds: { north: -2.80, south: -6.20, west: 120.50, east: 124.60 } },
  { code: '75', name: 'Gorontalo', bounds: { north: 1.10, south: -0.40, west: 121.30, east: 123.60 } },
  { code: '76', name: 'Sulawesi Barat', bounds: { north: 0.40, south: -3.50, west: 118.50, east: 119.90 } },
  { code: '81', name: 'Maluku', bounds: { north: -2.00, south: -8.60, west: 125.90, east: 135.00 } },
  { code: '82', name: 'Maluku Utara', bounds: { north: 3.40, south: -1.00, west: 124.00, east: 129.80 } },
  { code: '91', name: 'Papua', bounds: { north: -3.00, south: -9.50, west: 137.00, east: 141.05 } },
  { code: '92', name: 'Papua Barat', bounds: { north: -1.00, south: -4.00, west: 130.80, east: 135.50 } },
  { code: '93', name: 'Papua Selatan', bounds: { north: -5.00, south: -9.50, west: 137.00, east: 141.05 } },
  { code: '94', name: 'Papua Tengah', bounds: { north: -3.00, south: -5.00, west: 133.50, east: 138.50 } },
  { code: '95', name: 'Papua Pegunungan', bounds: { north: -3.00, south: -5.50, west: 137.00, east: 141.00 } },
  { code: '96', name: 'Papua Barat Daya', bounds: { north: -0.20, south: -4.00, west: 130.00, east: 133.70 } },
];
