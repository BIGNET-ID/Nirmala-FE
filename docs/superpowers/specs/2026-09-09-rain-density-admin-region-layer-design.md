# Rain Density — layer region kecamatan berbasis poligon BIG asli

## Context

Rain Density saat ini (`CanvasOverlay.jsx`) menampilkan blob KDE radius 9km
per sensor — jujur terhadap keterbatasan data (sensor Nirmala cuma punya
`is_raining` biner), tapi bentuknya "buatan" (radial gradient, bukan
mengikuti wilayah administratif nyata). User ingin eksplorasi tampilan
seperti peta BMKG/rainvision konvensional: region berwarna mengikuti batas
kecamatan asli.

Investigasi sebelumnya di sesi ini (dua spike berurutan) menyimpulkan:

1. **BMKG tidak menyediakan poligon batas wilayah** — API mereka (termasuk
   `/api/bmkg/cuaca/indonesia` yang sudah dipakai fitur "BMKG" di app ini)
   cuma titik lat/lon per kabupaten, bukan geometry.
2. **Badan Informasi Geospasial (BIG)** menyediakan endpoint ArcGIS REST
   publik dan resmi (`geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/
   BATAS_WILAYAH/MapServer/14`) yang bisa di-query per bounding box (tidak
   perlu download dataset nasional yang bisa >2GB), mengembalikan poligon
   kecamatan asli lengkap dengan nama kecamatan/kabupaten/provinsi.
   Diverifikasi langsung (`curl`): query satu area sekelas kota mengembalikan
   66 poligon; dengan parameter `maxAllowableOffset` (simplifikasi geometri
   sisi-server), ukuran respons turun dari ~7MB → ~35KB tanpa merusak bentuk
   poligon secara berarti.
3. Sebuah demo Voronoi/Thiessen-polygon dibuat sebagai spike terpisah untuk
   melihat "bentuk" pendekatan — tapi begitu poligon BIG asli tersedia,
   menghitung Voronoi dari titik sensor lalu meng-clip ke poligon itu jadi
   langkah yang tidak perlu: kita sudah punya batas wilayah asli, jadi
   cukup warnai poligon itu langsung.

**Keputusan desain kunci (disetujui user selama brainstorming):**

1. **Tanpa Voronoi/Delaunay.** Tiap poligon kecamatan diwarnai berdasarkan
   sensor Nirmala terdekat ke centroid-nya (haversine), bukan hasil
   tessellation titik. Ini menghindari dependency baru (`d3-delaunay`) dan
   logika polygon-clipping — dan garis batas yang tampil adalah batas
   kecamatan **asli**, bukan garis Voronoi buatan.
2. **Granularitas kecamatan**, bukan kelurahan/desa — payload dan jumlah
   poligon per viewport jauh lebih kecil, cukup detail untuk mode yang
   sifatnya ringkasan kepadatan (bukan presisi per-titik).
3. **Mode alternatif berdampingan**, bukan pengganti blob KDE yang sudah
   ada. Blob KDE tetap default di zoom luas; layer region ini aktif
   otomatis di atas ambang zoom tertentu — pola yang sama seperti
   `MeshLayer.jsx` yang sudah "gated behind a zoom threshold to avoid a
   solid smear" di zoom nasional.
4. **Radius cutoff jujur**: kecamatan yang sensor terdekatnya lebih jauh
   dari ambang tertentu dirender netral ("tidak ada data terdekat"), bukan
   dipaksa mewarisi status sensor yang sebenarnya jauh — filosofi yang sama
   dengan `RAIN_KM`/clamp di `CanvasOverlay.jsx`: jangan klaim cakupan lebih
   luas dari yang data benar-benar dukung.

## Data flow

**`src/app/api/boundaries/route.js`** (baru) — pola sama persis dengan
`src/app/api/wind/route.js` yang sudah ada (proxy + cache in-memory
keyed-by-bbox), bukan mekanisme baru:

```js
const BIG_ENDPOINT = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer/14/query';
// Batas administratif nyaris tidak pernah berubah — cache jauh lebih lama
// dari data cuaca (bandingkan VIEWPORT_TTL_MS 20 menit di /api/wind).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const boundsCache = new Map(); // key: rounded bbox -> { t, data }

export async function GET(request) {
  const { north, south, east, west, zoom } = /* dari searchParams, sama pola dengan /api/wind */;
  const key = roundBbox({ north, south, east, west }); // bulatkan ke ~0.1° supaya pan kecil tetap cache-hit
  const cached = boundsCache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) return Response.json(cached.data);

  const geometry = JSON.stringify({
    xmin: west, ymin: south, xmax: east, ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const offset = maxAllowableOffsetForZoom(zoom); // lihat "Tuning payload" di bawah
  const url = `${BIG_ENDPOINT}?geometry=${encodeURIComponent(geometry)}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=namobj,wadmkc,wadmkk,wadmpr&maxAllowableOffset=${offset}&f=geojson`;

  const r = await fetch(url, { cache: 'no-store' });
  const geojson = await r.json();
  const data = normalizeRegions(geojson); // buang field yang tidak dipakai, bentuk ringkas
  boundsCache.set(key, { t: Date.now(), data });
  return Response.json(data);
}
```

`normalizeRegions()` memetakan tiap feature GeoJSON ke bentuk ringkas —
termasuk `centroid` (rata-rata vertex polygon, dihitung sekali di server
saat normalisasi, bukan diulang di client tiap render):

```js
{
  id, name: namobj, kecamatan: wadmkc, kabupaten: wadmkk, provinsi: wadmpr,
  polygon: [[lat,lng], ...], centroid: [lat, lng],
}
```

Hanya field yang benar-benar dipakai (`namobj`/`wadmkc`/`wadmkk`/`wadmpr` +
geometry) — field lain dari BIG (kode BPS/PUM, metadata, luas wilayah, dll)
dibuang di server, tidak diteruskan ke client. Rata-rata vertex cukup akurat
untuk kebutuhan ini (kecamatan yang bentuknya tidak terlalu cekung) — tidak
perlu true polygon centroid/centroid-of-mass.

**`src/hooks/useAdminBoundaries.js`** (baru) — pola sama seperti
`useWindField`/`useVolcanoes`:

```js
export function useAdminBoundaries(bounds, active) {
  // fetch /api/boundaries?...bbox...&zoom=... hanya saat `active` true
  // (activeLayer === 'rain' DAN zoom di atas ambang — lihat UI integration)
  // reuse `mapBounds`/debounce yang SUDAH ADA di page.jsx untuk useWindField
  // — tidak perlu debounce baru, satu sumber viewport untuk kedua layer.
  // return { regions, status } — status pakai LAYER_STATUS yang sama.
}
```

## Resolusi "sensor terdekat" per region

**`src/lib/regionNearestSensor.js`** (baru, tapi reuse `haversineKm` yang
sudah ada — diekspor dari `src/lib/meshTopology.js`, bukan diduplikasi):

```js
import { haversineKm } from '@/lib/meshTopology';
import { statusBucket } from '@/lib/sensorColor';

// Sama filosofi dengan RAIN_KM/clamp di CanvasOverlay.jsx: di luar radius
// ini, sensor "terdekat" tetap terlalu jauh untuk jujur mewakili kecamatan
// tsb — render netral, bukan warna yang menyesatkan.
const MAX_DISTANCE_KM = 25;

export function resolveRegionBucket(region, stations) {
  let best = null, bestKm = Infinity;
  for (const st of stations) {
    const km = haversineKm(region.centroid, [st.lat, st.lng]);
    if (km < bestKm) { bestKm = km; best = st; }
  }
  return bestKm <= MAX_DISTANCE_KM ? statusBucket(best) : null; // null = no-data
}
```

`region.centroid` sudah tersedia dari `normalizeRegions()` (lihat Data
flow) — tidak dihitung ulang di sini.

`MAX_DISTANCE_KM = 25` adalah **estimasi awal, perlu diverifikasi visual**
saat implementasi (sama seperti `RAIN_KM`/`COVER_KM` yang sudah melalui
iterasi visual sebelumnya di sesi ini) — terlalu kecil berarti banyak
kecamatan kosong/abu-abu meski ada sensor "cukup dekat" secara intuisi,
terlalu besar mengulang masalah yang MAX_DISTANCE_KM ini dimaksudkan untuk
dicegah.

## Rendering — `AdminRegionLayer.jsx` (baru)

Pola `OverlayView` canvas yang identik dengan `CanvasOverlay.jsx`/
`MeshLayer.jsx`/`BmkgRainLayer.jsx` (pola ke-4, bukan pola baru):

```js
class AdminRegionOverlay extends window.google.maps.OverlayView {
  onAdd() { this.getPanes().overlayLayer.appendChild(canvas); }
  draw() {
    // resize canvas ke viewport (sama seperti 3 layer lain)
    scheduleDraw(() => renderRegions(canvas, regionsRef.current, stationsRef.current, projection));
  }
}

function renderRegions(canvas, regions, stations, projection) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const region of regions) {
    const bucket = resolveRegionBucket(region, stations);
    const screenPoly = region.polygon.map(([lat, lng]) => {
      const p = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
      return [p.x - canvas._offsetX, p.y - canvas._offsetY];
    });
    ctx.beginPath();
    screenPoly.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = bucket ? SENSOR_STATUS_COLOR[bucket] : NO_DATA_COLOR;
    ctx.globalAlpha = bucket ? 0.32 : 0.10; // region fill lebih transparan dari dot (dot tetap fokus utama)
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; // garis kecamatan asli, tipis
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
```

Warna fill pakai `SENSOR_STATUS_COLOR`/`statusColor` dari `sensorColor.js`
yang **sama persis** dengan warna dot & Sensor Statistics — bukan skema
warna baru, konsisten dengan bahasa visual status yang sudah ada di app
(beda dari `RAIN_RAMP` yang dipakai blob KDE/BMKG, karena region-coloring
ini masih menampilkan *status kategorikal* sensor, bukan intensitas
kontinu — jadi memang seharusnya pakai palet status, bukan ramp rainbow).

`SensorDotLayer` tetap render di atasnya seperti biasa, tidak berubah.

`NO_DATA_COLOR`: abu-abu netral (`var(--status-inactive)` reuse, bukan
warna baru) — kecamatan tanpa sensor cukup dekat.

## Ambang zoom (gating)

Konstanta baru `REGION_LAYER_MIN_ZOOM` — **estimasi awal, perlu verifikasi
visual**. Di bawah ambang ini, tetap tampil blob KDE (`CanvasHeatmapOverlay`)
seperti sekarang; di atas ambang, `AdminRegionLayer` menggantikannya (mirip
bagaimana `MeshLayer` sendiri sudah punya ambang zoom internal untuk alasan
serupa — smear/kepadatan visual di zoom rendah).

```jsx
// page.jsx, activeLayer === 'rain'
{activeLayer === 'rain' && (
  currentZoom >= REGION_LAYER_MIN_ZOOM
    ? <AdminRegionLayer regions={adminRegions} stations={SENSOR_STATIONS} />
    : <CanvasHeatmapOverlay stations={SENSOR_STATIONS} />
)}
```

`currentZoom` sudah ada di `page.jsx` (dipakai untuk readout zoom di
`MapControls`) — reuse langsung, tidak perlu state baru.

## Tuning payload (`maxAllowableOffsetForZoom`)

Diverifikasi empiris: `maxAllowableOffset=0.001` (~111m di ekuator)
menurunkan payload dari 7MB → 35KB untuk viewport sekelas kota. Fungsi ini
menyesuaikan offset berdasar zoom — makin zoom-in (viewport makin kecil,
poligon makin sedikit tapi butuh detail lebih halus), offset mengecil;
makin zoom-out mendekati `REGION_LAYER_MIN_ZOOM`, offset membesar (viewport
lebih luas, lebih banyak poligon, butuh disederhanakan lebih agresif). Nilai
pasti perlu diukur langsung terhadap payload viewport-viewport nyata saat
implementasi — bagian ini ditandai jelas di kode sebagai "tunable, adjust
after visual QA", konsisten dengan penanda serupa di
`2026-09-04-bmkg-cuaca-tile-design.md` untuk `BMKG_KM`.

## Error handling

Mengikuti pola yang sudah ada, bukan mekanisme baru:
- Fetch `/api/boundaries` gagal → `AdminRegionLayer` tidak menggambar apa
  pun untuk viewport tsb (sama seperti `CanvasHeatmapOverlay` saat
  `stations.length === 0`) — blob KDE di bawah `REGION_LAYER_MIN_ZOOM` tidak
  terpengaruh sama sekali karena keduanya independen.
- Tidak ada fixture/fallback offline untuk endpoint ini (beda dari
  `nirmalaApiService` yang punya fallback fixture) — data BIG bukan bagian
  dari data kritikal produk (kalau gagal, user tetap dapat blob KDE di zoom
  rendah dan bisa zoom out); menambah fixture GeoJSON kecamatan hanya untuk
  fallback dianggap YAGNI untuk iterasi pertama ini.
- Tidak ada notice banner baru — sama alasan seperti BMKG (lihat spec BMKG):
  kegagalan bukan kondisi yang diketahui sering terjadi & butuh penjelasan
  eksplisit ke user.

## Testing

- `resolveRegionBucket()` — unit test murni: sensor dalam radius terpilih
  benar (nearest-wins), sensor di luar `MAX_DISTANCE_KM` menghasilkan
  `null`, region tanpa sensor sama sekali menghasilkan `null`.
- `normalizeRegions()` (di `route.js`) — unit test murni: memetakan bentuk
  GeoJSON BIG (termasuk field yang tidak relevan) ke bentuk ringkas yang
  benar, tidak meneruskan field yang seharusnya dibuang.
- `maxAllowableOffsetForZoom()` — unit test murni: monoton (offset makin
  kecil seiring zoom makin besar), nilai di titik `REGION_LAYER_MIN_ZOOM`.
- Tidak menambah test untuk `AdminRegionLayer.jsx` itu sendiri (komponen
  canvas/OverlayView) — konsisten dengan `CanvasOverlay.jsx`/
  `MeshLayer.jsx`/`BmkgRainLayer.jsx` yang juga tidak punya test komponen di
  repo ini.
- Verifikasi manual di browser: toggle Rain Density lalu zoom melewati
  `REGION_LAYER_MIN_ZOOM` di beberapa lokasi kepadatan sensor berbeda (padat
  vs jarang), cek payload `/api/boundaries` di Network tab wajar ukurannya,
  cek kecamatan tanpa sensor dekat benar-benar tampil abu-abu (bukan
  mewarisi warna sensor jauh), cek light & dark theme.

## Scope note

Di luar scope iterasi ini (bisa jadi iterasi terpisah nanti kalau
dibutuhkan):
- Granularitas kelurahan/desa — didiskusikan dan ditolak untuk iterasi ini
  (payload & jumlah poligon jauh lebih besar); bisa dipertimbangkan lagi
  kalau kecamatan dirasa kurang detail setelah dipakai nyata.
- Layer "Sensor Coverage" (teal, sensor aktif-tidak-hujan) — tidak
  disentuh, tetap nonaktif seperti sebelumnya (`SHOW_COVERAGE_LAYER` di
  `CanvasOverlay.jsx`), tidak terkait scope ini.
- Menerapkan pendekatan region-coloring yang sama ke mode BMKG (yang punya
  data kontinu `precip_mm`, bukan cuma status kategorikal) — berpotensi
  malah lebih bermakna di sana (bisa pakai `RAIN_RAMP` per region alih-alih
  status biner), tapi itu perubahan terpisah di luar scope brainstorming
  ini yang fokus ke Rain Density/Nirmala Data.
- Klik pada region untuk detail (mis. daftar sensor di dalamnya) — tidak
  diminta, YAGNI untuk iterasi pertama; region layer ini murni visual,
  interaksi tetap lewat `SensorDotLayer` yang sudah ada.
