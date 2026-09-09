# Rain Density admin-region layer — ganti sumber data ke cakupan nasional

## Context

`docs/superpowers/specs/2026-09-09-rain-density-admin-region-layer-design.md`
(spec sebelumnya) membangun layer region-kecamatan untuk Rain Density,
sumber datanya proxy live ke API publik BIG (`geoservices.big.go.id`,
layer 14). Sudah diimplementasikan, direview, dan diverifikasi langsung di
browser untuk Kendari (Sulawesi Tenggara).

Setelah dipakai nyata, ditemukan (verifikasi `curl` langsung ke endpoint
BIG, termasuk `returnCountOnly=true` tanpa filter wilayah sama sekali dan
query bbox seluruh Indonesia): **layer publik BIG ini total cuma berisi 66
kecamatan, semuanya di Sulawesi Tenggara** — bukan keterbatasan kode kita,
datanya sendiri memang belum tersedia secara nasional di endpoint ini
(kemungkinan rilis pilot/contoh dari BIG). User bertanya apakah fitur ini
bisa diperluas ke seluruh peta.

Riset sumber alternatif menemukan repo GitHub yang mengklaim cakupan
kecamatan (`ardian28/GeoJson-Indonesia-38-Provinsi`) — dicek langsung isi
filenya (bukan cuma baca README), ternyata **hanya berisi provinsi &
kabupaten**, tidak ada kecamatan sama sekali, jadi tidak dipakai.

Sumber yang lolos verifikasi: **HDX (Humanitarian Data Exchange), dataset
"Indonesia - Subnational Administrative Boundaries" (`cod-ab-idn`)**,
dicek langsung lewat API resmi HDX (`data.humdata.org/api/3/action/
package_show?id=cod-ab-idn`):

- Bersumber dari BPS (Badan Pusat Statistik) — sama otoritatifnya dengan
  Kemendagri untuk data wilayah administratif.
- Cakupan ADM0-ADM3 (negara → provinsi → kabupaten/kota → **kecamatan**),
  seluruh Indonesia.
- Lisensi CC BY-IGO (boleh dipakai, wajib atribusi ke BPS/OCHA).
- Terakhir diperbarui 23 Juni 2026 — masih aktif dipelihara.
- Tersedia dalam GeoJSON (~456MB, gabungan semua level admin, belum
  disederhanakan/difilter).

**Keputusan desain kunci (disetujui user selama brainstorming lanjutan):**

1. **Olah data sekali di awal (offline), bukan proxy live** — beda dari
   BIG yang mendukung query per-bbox + simplifikasi sisi-server, HDX cuma
   file statis besar. Download-sederhanakan-remap sekali, hasilnya
   di-bundle sebagai file statis di repo. Tidak butuh infrastruktur
   Cloudflare baru (R2/D1) — proyek ini belum punya binding storage apa
   pun selain `ASSETS` bawaan Next.js, dan estimasi ukuran akhir (skala
   dari Kendari: 65 kecamatan ≈ 40KB tersederhana → ~7.000 kecamatan
   nasional ≈ beberapa MB) cukup kecil untuk sekadar di-bundle.
2. **Filter "kecamatan tanpa sensor dekat" pindah dari server ke client,
   dan jadi exclude bukan gray** — sebelumnya (Kendari) semua kecamatan di
   viewport tetap tampil (yang jauh dari sensor = abu-abu). Sekarang,
   karena datanya nasional dan sebagian besar wilayah rural Indonesia
   tidak akan pernah dekat sensor Nirmala, kecamatan tanpa sensor dalam
   radius cutoff **tidak digambar sama sekali** (bukan abu-abu) — peta
   jadi mengikuti sebaran sensor Nirmala yang sebenarnya, tidak menyiratkan
   cakupan yang tidak kita punya. Difilter di client
   (`AdminRegionLayer.jsx`), bukan server, karena `/api/sensors` (endpoint
   posisi sensor asli) makan ~8.7 detik untuk 4.500+ sensor — terlalu
   lambat dipanggil per-request di server. Layer ini sudah di-gate di
   `REGION_LAYER_MIN_ZOOM`, jadi jumlah kandidat kecamatan per viewport
   tetap terbatas (order-of-magnitude sama seperti Kendari) walau
   sumber datanya nasional — jadi tidak perlu filter sisi-server untuk
   soal ukuran payload.
3. **Radius cutoff diperketat dari 25km ke 9km** — menyamakan dengan
   radius `RAIN_KM` blob KDE (`CanvasOverlay.jsx`) yang sudah melalui
   tuning visual di sesi sebelumnya, supaya kedua mode Rain Density
   (blob & region) punya bahasa "seberapa jauh sensor bisa jujur mewakili
   suatu area" yang konsisten.
4. **`maxAllowableOffsetForZoom()` dihapus** — fungsi ini ada khusus untuk
   parameter `maxAllowableOffset` milik API BIG (simplifikasi geometri
   per-request tergantung zoom). Sumber data baru sudah disederhanakan
   SEKALI di tahap olah-data, tidak perlu simplifikasi ulang tiap request
   — mempertahankan fungsi ini setelah tidak dipakai lagi adalah kode
   mati.
5. **Cache TTL 24 jam + eviction di `route.js` dihapus** — mekanisme itu
   ada untuk menghindari fetch lambat ke BIG yang eksternal. Data baru
   sudah lokal (file statis ter-bundle, baca sekali di scope modul);
   filter bbox in-memory terhadap beberapa MB data sudah instan tanpa
   cache sama sekali.

## Yang TIDAK berubah

- Kontrak publik `/api/boundaries?north=&south=&east=&west=&zoom=` →
  `Array<region>` — sama persis, `useAdminBoundaries.js` tidak perlu
  diubah.
- `normalizeRegions()` di `src/lib/boundaryRegions.js` — tidak diubah.
  Skrip olah-data me-remap nama field HDX ke bentuk field BIG
  (`namobj`/`wadmkc`/`wadmkk`/`wadmpr`) SEBELUM menulis file statis,
  supaya fungsi ini (sudah diuji, termasuk penanganan `MultiPolygon` dari
  perbaikan bug sebelumnya) tetap bisa dipakai apa adanya. `zoom` masih
  diterima sebagai parameter (untuk kompatibilitas signature dengan
  pemanggil yang ada) tapi tidak lagi memengaruhi apa pun di dalam route.
- Pola `google.maps.OverlayView` + Canvas 2D di `AdminRegionLayer.jsx` —
  tidak berubah, cuma logika "gambar abu-abu vs lewati" yang berubah.
- Warna (`bucketColor`/`SENSOR_STATUS_COLOR`), legend kategorikal (fix
  terpisah yang sudah selesai) — tidak berubah.
- Gating zoom (`REGION_LAYER_MIN_ZOOM`) — tidak berubah.

## Skrip olah-data (baru, sekali jalan, TIDAK ikut proses build/deploy)

**`src/lib/simplifyPolygon.js`** (baru) — fungsi murni, diuji TDD:

```js
/**
 * Douglas-Peucker line simplification — dipilih daripada menambah
 * dependency (mapshaper/turf) untuk kebutuhan satu-kali-pakai ini;
 * algoritmanya cukup sederhana untuk ditulis sendiri dan diuji langsung.
 * `tolerance` dalam satuan derajat (sama unit dengan lat/lng mentah),
 * bukan meter — dipilih lewat percobaan terhadap payload nyata (lihat
 * langkah verifikasi), bukan dihitung dari formula jarak.
 */
export function simplifyRing(points, tolerance) {
  // points: Array<{lat, lng}>, minimal 4 titik (ring tertutup: titik
  // pertama == titik terakhir). Mengembalikan subset points yang sama
  // (titik pertama/terakhir selalu dipertahankan), titik-titik "lurus"
  // dalam toleransi dibuang.
}
```

**`scripts/build-kecamatan-dataset.mjs`** (baru) — CLI, dijalankan manual
oleh developer, bukan bagian dari `npm run build`/`deploy`:

```js
#!/usr/bin/env node
// Usage: node scripts/build-kecamatan-dataset.mjs <path-ke-file-ADM3-HDX-yang-sudah-diunduh-manual>
//
// 1. Baca file GeoJSON ADM3 HDX yang sudah diunduh manual (file besar,
//    ~456MB gabungan semua level — filter ke feature ADM3/kecamatan saja
//    berdasar field level yang ada di file, field pastinya dicek langsung
//    terhadap file asli saat implementasi, BUKAN diasumsikan di sini).
// 2. Remap properti tiap feature ke bentuk field BIG:
//    { namobj: <nama kecamatan HDX>, wadmkc: <nama kecamatan HDX>,
//      wadmkk: <nama kabupaten/kota HDX>, wadmpr: <nama provinsi HDX> }
//    (nama field asli HDX perlu dikonfirmasi terhadap file unduhan nyata
//    — kemungkinan pola ADM3_EN/ADM2_EN/ADM1_EN berdasarkan riset, tapi
//    ini HARUS diverifikasi, bukan diasumsikan, sebelum implementasi.)
// 3. Sederhanakan tiap ring exterior polygon via simplifyRing() di atas.
// 4. Tulis FeatureCollection GeoJSON standar (properti sudah di-remap,
//    geometry sudah disederhanakan) ke src/data/kecamatan-indonesia.json
//    — bentuknya persis seperti yang normalizeRegions() sudah harapkan
//    (Polygon/MultiPolygon [lng,lat], properti namobj/wadmkc/wadmkk/wadmpr),
//    supaya normalizeRegions() dipakai TANPA PERUBAHAN.
```

Tidak ada test file untuk skrip ini sendiri (I/O ke filesystem, dijalankan
manual, diverifikasi lewat hasil keluarannya) — matches konvensi proyek
untuk skrip bukan-`src/lib`. `simplifyRing()` sendiri, sebagai fungsi
murni di `src/lib/`, DIUJI (lihat Testing).

## `src/app/api/boundaries/route.js` — disederhanakan

```js
import { normalizeRegions } from '@/lib/boundaryRegions';
import kecamatanGeoJSON from '@/data/kecamatan-indonesia.json';

// Data lokal (file statis ter-bundle) — dinormalisasi & disimpan di
// module scope sekali per instance Worker, bukan per-request. Tidak ada
// cache TTL/eviction (perlu untuk fetch eksternal yang lambat, tidak
// perlu untuk filter in-memory terhadap data yang sudah di memori).
const ALL_REGIONS = normalizeRegions(kecamatanGeoJSON);

function intersectsBbox(region, bbox) {
  // true jika ada titik polygon region di dalam bbox — reuse logika
  // sederhana, tidak perlu library spatial-index untuk ~7.000 region.
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north'));
  const south = parseFloat(searchParams.get('south'));
  const east = parseFloat(searchParams.get('east'));
  const west = parseFloat(searchParams.get('west'));
  // `zoom` masih diterima (kompatibilitas signature dgn useAdminBoundaries)
  // tapi tidak lagi dipakai — data sudah disederhanakan sekali di awal.

  if (![north, south, east, west].every(Number.isFinite)) {
    return Response.json({ error: 'missing_bbox' }, { status: 400 });
  }

  const bbox = { north, south, east, west };
  const data = ALL_REGIONS.filter((r) => intersectsBbox(r, bbox));
  return Response.json(data);
}
```

Satu-satunya error path yang tersisa: bbox parameter tidak valid (400).
Jalur "upstream_unavailable" (502) yang ada di versi BIG dihapus — tidak
ada lagi fetch eksternal yang bisa gagal saat runtime; kegagalan memuat
data (file rusak/tidak ada) akan ketahuan saat `npm run build`/`deploy`,
bukan saat user memakai fitur.

## `src/lib/regionNearestSensor.js` — ambang cutoff

```js
export const MAX_DISTANCE_KM = 9; // sebelumnya 25 — disamakan dengan
// RAIN_KM blob KDE (CanvasOverlay.jsx) yang sudah melalui tuning visual;
// konsisten "seberapa jauh sensor bisa jujur mewakili suatu area" di
// kedua mode Rain Density.
```

`resolveRegionBucket()` sendiri tidak berubah — tetap `null` kalau tidak
ada sensor dalam `MAX_DISTANCE_KM`.

## `src/components/map/AdminRegionLayer.jsx` — lewati, bukan gambar abu-abu

Di dalam loop `paint()`, ganti:

```js
const bucket = resolveRegionBucket(region, stationsRef.current);
const color = bucketColor(bucket || 'inactive');
// ... selalu gambar
```

menjadi:

```js
const bucket = resolveRegionBucket(region, stationsRef.current);
if (!bucket) continue; // tidak ada sensor dalam 9km — jangan gambar
// nasional: sebagian besar kandidat kecamatan tidak akan punya sensor
// dekat; menggambar semuanya abu-abu akan membanjiri layar dengan warna
// yang tidak berarti. Lewati sepenuhnya, bukan render netral.
const color = bucketColor(bucket);
```

Alpha `bucket ? 0.32 : 0.10` dan cabang no-data lainnya di bawahnya jadi
tidak perlu (selalu masuk cabang `bucket` truthy sekarang).

## Testing

- **`simplifyRing()`** (baru, TDD) — unit test murni: ring segitiga/persegi
  sederhana tidak berubah pada toleransi kecil; titik-titik nyaris segaris
  dibuang pada toleransi lebih besar; titik pertama & terakhir (ring
  tertutup) selalu dipertahankan; ring dengan <4 titik dikembalikan apa
  adanya (tidak ada yang perlu disederhanakan).
- **`regionNearestSensor.test.js`** (sudah ada, dari Kendari) — nilai
  jarak fixture ditulis ulang supaya mengelilingi ambang baru 9km (bukan
  25km), perilaku yang diuji (nearest-wins, di luar jangkauan → null,
  tanpa sensor → null, exact-match) tetap sama.
- **`boundaryRegions.test.js`** (sudah ada) — 2 dari 5 test yang menguji
  `maxAllowableOffsetForZoom()` dihapus (fungsinya dihapus); 3 test
  `normalizeRegions()` (termasuk test `MultiPolygon` dari perbaikan bug
  sebelumnya) tetap seperti semula, tidak berubah.
- Tidak ada test baru untuk `route.js` (konvensi proyek: route handler
  tidak diuji otomatis) — diverifikasi manual (lihat di bawah).
- **Verifikasi manual, di beberapa kota berbeda** (bukan cuma Kendari) —
  minimal satu kota dengan sensor Nirmala padat (kandidat: Jakarta, perlu
  dicek langsung sebaran sensor sesungguhnya saat implementasi) dan satu
  area yang sepi sensor: cek kota padat menampilkan poligon berwarna
  benar, area sepi sensor **tidak menampilkan poligon apa pun** dalam
  radius 9km (bukan abu-abu), light & dark theme tetap legible, mode
  Himawari/Mesh Map/BMKG/Sensor Spot tidak terpengaruh.
- **Verifikasi ukuran bundel Cloudflare Worker** — setelah
  `src/data/kecamatan-indonesia.json` ditambahkan, jalankan `npm run
  preview` (proses build `opennextjs-cloudflare` yang sama dipakai saat
  deploy) dan pastikan tidak ada peringatan soal batas ukuran bundel di
  log build.
- **Verifikasi nama field HDX** — sebelum menulis `normalizeRegions()`-
  compatible remapping di skrip olah-data, field asli HDX (nama kolom
  ADM3/kecamatan, kabupaten, provinsi) harus dicek langsung terhadap file
  unduhan nyata, bukan diasumsikan dari deskripsi dataset.

## Scope note

Di luar scope iterasi ini:
- Meng-otomatisasi re-sync data HDX (mis. cron/CI yang download ulang
  berkala) — batas administratif nyaris tidak pernah berubah, olah-data
  manual sekali per rilis (kalau HDX merilis update) sudah cukup; dibangun
  hanya kalau benar-benar terbukti perlu.
- Mempertahankan atau menghapus proxy BIG (`route.js` versi lama) sebagai
  fallback — HDX dianggap pengganti penuh, bukan tambahan; kalau HDX
  ternyata bermasalah di lapangan, itu insiden terpisah untuk ditangani
  saat terjadi, bukan diantisipasi sekarang dengan menjaga dua sumber data
  sekaligus (YAGNI).
- Menaikkan granularitas ke kelurahan/desa — tetap di luar scope seperti
  spec sebelumnya, alasan sama (payload & jumlah poligon jauh lebih
  besar).
- Atribusi CC BY-IGO ke BPS/OCHA di UI (mis. footer/credit map) — perlu
  ditambahkan demi kepatuhan lisensi, tapi keputusan bentuk/lokasi teks
  atribusinya adalah keputusan produk/copy terpisah, bukan bagian dari
  desain teknis ini. **Dicatat sebagai follow-up wajib, bukan opsional.**
