# BMKG Cuaca — tile ground-mode baru berbasis data resmi per-kabupaten

## Context

`SegmentTogglePanel.jsx`'s Ground Segment sudah punya slot untuk sumber data
ini sejak awal — `<VendorCard title="BMKG" accent="var(--status-active,
#34d399)" active={false} />` duduk sejajar dengan card "Nirmala Data" (yang
isinya Rain Density, Mesh Map, Sensor Points), tapi selalu `active={false}`
("Coming soon"). Fitur ini mengisi slot tersebut dengan data cuaca resmi
BMKG, bukan lagi placeholder.

Backend BIGNET (`c4c-nirmala.api.bignet.host`, domain yang sama dengan
`/api/sensors`, `/api/manifest`, dst.) sekarang punya endpoint baru:

```
GET /api/bmkg/cuaca/indonesia
```

yang mengembalikan kondisi cuaca TERKINI untuk seluruh 511 kabupaten/kota di
Indonesia dalam **satu panggilan**, sudah di-cache di sisi backend
(`cache_ttl_s: 7200`, 2 jam). Setiap entri `kabupaten[]` punya `lat`, `lon`,
dan sebuah objek `now` berisi `precip_mm`, `weather`, `weather_code`,
`temp_c`, `humidity_pct`, `cloud_pct`, `datetime_wib`, `icon`. `precip_mm`
adalah curah hujan real per-titik (bukan hasil interpolasi atau fabrikasi),
beda dengan Rain Density yang sensor-nya cuma punya `is_raining` biner.

Endpoint yang sama (dan endpoint per-titik `/api/bmkg/cuaca?adm4=`/`?lat=&lon=`
untuk detail 3-hari) sudah dieksplorasi lewat spike sebelumnya di sesi ini:
memanggil BMKG per-sensor (4.582 sensor) akan boros dan tidak perlu, karena
endpoint `/indonesia` ini sudah menyediakan satu titik representatif per
kabupaten sekaligus.

**Keputusan desain kunci (disetujui user selama brainstorming):**
1. Ini **mode ground baru yang independen** — bukan menggantikan atau
   digabung dengan Rain Density. User memilih salah satu: Rain Density
   (sensor) *atau* BMKG (resmi), seperti memilih antara Rain Density dan
   Mesh Map sekarang.
2. Breakpoint intensitas curah hujan pakai **konvensi meteorologi standar
   per-jam** (bukan breakpoint akumulasi 24 jam ala kategori resmi BMKG,
   karena nilai `precip_mm` di contoh respons — 0, 0.2, 0.7 — jelas
   snapshot sesaat/per-jam, bukan akumulasi harian):
   - `0 mm` → tidak hujan (transparan)
   - `0–2.5 mm/jam` → Rendah
   - `2.5–7.5 mm/jam` → Sedang
   - `7.5–15 mm/jam` → Tinggi
   - `>15 mm/jam` → Ekstrem
   > Catatan: breakpoint ini adalah pendekatan konvensi WMO umum untuk
   > intensitas hujan per-jam, **bukan angka resmi dari dokumentasi BMKG**
   > (yang belum tersedia ke saya). Ditandai sebagai konstanta bernama jelas
   > di kode supaya mudah dikoreksi begitu ada angka resmi.

## Data flow

**`src/lib/nirmalaApi.js`** — method baru:

```js
async getBmkgCuaca() {
  try {
    return await nirmalaApi.get('/api/bmkg/cuaca/indonesia');
  } catch (error) {
    console.warn('[Nirmala API] BMKG cuaca unavailable, using fixture:', error.message);
    return (await loadFixture('bmkg-cuaca')) || { kabupaten: [] };
  }
}
```

Lewat proxy generik yang sudah ada (`app/api/[...path]/route.js`) — **tidak
perlu route Next.js baru**, karena endpoint ini di domain backend yang sama
persis dengan `/api/sensors` dkk. yang sudah lewat proxy itu. Beda dari
`OpenWeatherLayer.jsx` yang butuh route sendiri (`/api/owm/[...tile]`) untuk
menyembunyikan API key OpenWeather — BMKG API ini tidak exposed key apapun ke
proxy generiknya.

**Fixture baru:** `public/fixtures/bmkg-cuaca.json` — capture respons real
dari endpoint saat implementasi (bukan dikarang), mengikuti pola
`sensors.json`/`manifest.json` yang sudah ada (lihat doc comment
`nirmalaApi.js`: "NOT fabricated data").

**`src/hooks/useBmkgWeather.js`** (baru) — pola sama seperti
`useJmaHimawariTicks`/`useWindField`:

```js
export function useBmkgWeather(active) {
  // fetch on mount ketika `active` true, poll tiap 30 menit
  // (di bawah cache_ttl_s BMKG sendiri 7200s — polling lebih sering dari itu
  // percuma karena datanya tidak akan berubah)
  // return { kabupaten, lastSyncedAt, status } — status pakai LAYER_STATUS
  // yang sama (loading/ok/error/empty) seperti layer lain
}
```

`active` di sini `activeLayer === 'bmkg'` — sama seperti Himawari hanya
fetch saat `activeLayer === 'himawari'`, supaya tidak memanggil BMKG kalau
user tidak sedang lihat mode ini.

## Rendering — `BmkgRainLayer.jsx` (baru)

Teknik kernel-heatmap yang sama dengan `CanvasHeatmapOverlay`
(`CanvasOverlay.jsx`): radial-gradient kernel per titik → greyscale alpha
shadow canvas → colorize lewat LUT 256×3. Tiga fungsi murni ini (`buildLUT`,
`drawKernels`, `colourizeInto`) diekstrak dari `CanvasOverlay.jsx` ke modul
baru **`src/lib/heatmapKernel.js`**, dipakai ulang oleh kedua layer — bukan
duplikasi, dan `CanvasOverlay.jsx` diimpor dari situ juga (perilakunya tidak
berubah, murni pemindahan kode).

Beda dari `CanvasOverlay.jsx`:
- Sumber titik: `kabupaten[]` dari `useBmkgWeather()` (511 titik `lat`/`lon`),
  bukan `stations` (4.500+ sensor dengan `statusBucket`).
- Sinyal intensitas: `precip_mm` kontinu, dipetakan ke `t` (0–1) lewat
  breakpoint di atas, lalu `t` itu yang di-lookup ke `RAIN_RAMP` (LUT yang
  sama persis dengan Rain Density/`ColorRampLegend`, supaya bahasa warna
  konsisten se-app).
- Radius kernel: konstanta baru `BMKG_KM` — dimulai dengan nilai **lebih
  besar** dari `RAIN_KM` (35km) milik Rain Density, karena 511 titik
  se-Indonesia jauh lebih jarang dari ~4.500 sensor; nilai awal diperkirakan
  perlu di-tuning visual setelah render pertama (sama seperti `RAIN_KM`/
  `COVER_KM` yang sudah melalui iterasi visual sebelumnya di sesi ini) —
  ditandai jelas di kode sebagai "tunable, adjust after visual QA".
- Tidak ada layer "coverage" kedua (BMKG tidak punya konsep sensor
  aktif/tidak-aktif) — satu layer saja, curah hujan.

```js
function precipToT(mm) {
  if (mm <= 0) return 0;
  if (mm <= 2.5) return (mm / 2.5) * 0.25;
  if (mm <= 7.5) return 0.25 + ((mm - 2.5) / 5) * 0.25;
  if (mm <= 15) return 0.5 + ((mm - 7.5) / 7.5) * 0.25;
  return Math.min(1, 0.75 + ((mm - 15) / 15) * 0.25); // >15 caps toward 1.0
}
```

(Fungsi ini pure/testable — lihat bagian Testing.)

## UI integration

**`activeLayer`** (di `page.jsx`) dapat nilai baru `'bmkg'`, sejajar dengan
`'rain'`/`'mesh'`. Saat `activeLayer === 'bmkg'`: render `<BmkgRainLayer>`
menggantikan `CanvasHeatmapOverlay`/`MeshLayer` di area map, mengikuti pola
kondisional yang sudah ada persis.

**`SegmentTogglePanel.jsx`** — card BMKG yang sekarang `active={false}`
diisi satu `ModeButton` ("Cuaca BMKG"), pola identik dengan `ModeButton` Rain
Density/Mesh Map di card "Nirmala Data" sebelahnya:

```jsx
<VendorCard title="BMKG" accent="var(--status-active, #34d399)">
  <ModeButton
    active={activeLayer === 'bmkg'}
    icon="material-symbols:cloud-outline-rounded"
    label="Cuaca BMKG"
    onClick={() => onLayerChange('bmkg')}
  />
</VendorCard>
```

**Sensor Points tetap togglable** saat mode BMKG aktif — `showSensorToggles`
diperluas jadi `activeLayer === 'rain' || activeLayer === 'himawari' ||
activeLayer === 'bmkg'`, supaya user bisa opsional lihat titik sensor asli
sebagai referensi di atas data regional BMKG (tidak dipaksa nyala seperti di
Mesh Map, karena BMKG bukan tentang topologi jaringan sensor).

**`src/constants/metrics.js`** — entry baru:

```js
bmkg: {
  key: 'bmkg',
  label: 'BMKG Cuaca',
  icon: 'material-symbols:cloud-outline-rounded',
  colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)', // sama dengan RAIN_RAMP
  tickLabels: ['0', '2.5', '7.5', '15+ mm/jam'], // angka real, bukan kualitatif — data BMKG per-titik nyata
  legendNote: 'Curah hujan resmi BMKG per kabupaten (data real per-titik, bukan interpolasi sensor).',
},
```

Beda dari `METRICS.rain` yang label-nya kualitatif (Low/Moderate/High/
Extreme) karena sensor cuma binary — di sini boleh angka mm asli karena
datanya real per-titik (konsisten dengan pengecualian di `AGENTS.md`: larangan
fabrikasi angka mm/h hanya berlaku kalau *tidak ada* pengukuran per-titik
yang real).

**Timestamp "as of":** `activeLayerLastSynced` di `page.jsx` diperluas —
`activeLayer === 'bmkg' ? bmkgLastSynced : activeLayer === 'himawari' ? ... : ...`
— `bmkgLastSynced` diambil dari `now.datetime_wib` pada data yang di-fetch
(semua entri dalam satu respons berbagi timestamp batch yang sama).

**Rapi-rapi kecil (`ColorRampLegend.jsx`):** tooltip info-icon saat ini
di-hardcode `activeLayer === 'rain' && metric.legendNote` — diperluas jadi
`metric.legendNote` saja (berlaku untuk metric manapun yang punya catatan),
supaya BMKG dapat tooltip info yang sama tanpa kondisi khusus baru.

## Error handling

Mengikuti pola yang sudah ada di layer lain, bukan mekanisme baru:
- Fetch gagal → fallback fixture (pola `nirmalaApiService`, sama seperti
  `getSensors()`).
- Kalau fixture juga tidak ada / kosong → `BmkgRainLayer` tidak menggambar
  apa-apa (sama seperti `CanvasHeatmapOverlay` saat `stations.length === 0`)
  — tidak ada notice banner baru, sesuai YAGNI. Layer lain (Himawari) yang
  punya notice banner karena kegagalannya sering terjadi & butuh penjelasan
  ke user (zoom level, jam publikasi) — BMKG tidak punya kondisi serupa yang
  diketahui, jadi tidak ditambahkan di iterasi ini.
- Tidak ada permission flag baru — data ini tidak sensor-spesifik, jadi
  tidak digerbangi `can_view_sensor` atau flag lain.

## Testing

- `precipToT()` (breakpoint mapping) — unit test murni: `0` → `0`, tepat di
  tiap breakpoint (`2.5`, `7.5`, `15`), di atas `15` ter-cap ke `1`, nilai di
  antara breakpoint terinterpolasi linear.
- `buildLUT`/`drawKernels`/`colourizeInto` (setelah diekstrak ke
  `heatmapKernel.js`) — kalau ada test yang sudah menyentuh fungsi ini lewat
  `CanvasOverlay.jsx` sebelumnya, pastikan tetap hijau setelah pemindahan
  (perilaku tidak berubah, murni relokasi).
- Tidak menambah test untuk komponen canvas/OverlayView itu sendiri
  (`BmkgRainLayer.jsx`), konsisten dengan `CanvasOverlay.jsx`/
  `WindParticleLayer.jsx` yang juga tidak punya test komponen — koneksi ke
  Google Maps API tidak mudah di-unit-test tanpa DOM/canvas mocking berat,
  dan pola yang sudah ada di repo ini memang fokus unit-test ke fungsi murni
  saja.
- Verifikasi manual di browser (visual): toggle BMKG di light & dark mode,
  cek warna sesuai breakpoint, cek legend menampilkan angka mm, cek radius
  kernel tidak terlalu jarang/rapat secara visual.

## Scope note

Di luar scope iterasi ini (bisa jadi iterasi terpisah nanti kalau
dibutuhkan):
- Endpoint detail 3-hari per titik (`/api/bmkg/cuaca?adm4=`/`?lat=&lon=`) —
  tidak dipakai di sini, hanya endpoint ringkasan nasional.
- Layer terpisah untuk `temp_c`/`humidity_pct`/`cloud_pct` — bukan bagian
  dari "tile rainbow" yang diminta, cuma `precip_mm` yang dipakai.
- Ikon cuaca per-kabupaten (`icon` URL dari BMKG) — tidak ditampilkan di
  tile, hanya dipakai kalau nanti ada detail popup per kabupaten (tidak ada
  di scope ini).
