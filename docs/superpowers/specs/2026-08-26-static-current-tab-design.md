# Design: Static Current Tab & Live Timestamp Badge (Sub-project A)

**Status:** Approved for implementation planning
**Tanggal:** 2026-08-26
**Sumber:** PRD v2.0 §4.1 (Dual-Tab Navigation Engine, "Tab Current ... Tanpa
Button Play / Time Slider" + "Live Timestamp Badge"), diskusi lanjutan atas
[2026-08-26-dual-tab-segment-layout-design.md](2026-08-26-dual-tab-segment-layout-design.md)

## 1. Latar Belakang & Cakupan

Ini adalah **Sub-proyek A** dari dua sub-proyek yang disepakati untuk
memisahkan Tab Current dan Tab Timeline secara jelas:

- **Sub-proyek A (dokumen ini):** Tab Current dijadikan 100% statis (tidak
  ada Play/scrubber untuk mode apa pun), ditambah **Live Timestamp Badge**
  per mode sebagai pengganti informasi yang hilang. Murni state/UI, tidak
  ada integrasi API baru.
- **Sub-proyek B (terpisah, brainstorm selanjutnya):** Tab Timeline dengan
  Play/Pause + speed multiplier + scrubber + tombol Live yang benar-benar
  berfungsi, untuk Himawari (grid master 10 menit) dan OpenWeather
  (histori via endpoint Weather Maps 2.0 yang baru, di-*round* ke tick
  Himawari terdekat). Wind particle tidak masuk Timeline sama sekali
  (live-only, tidak ada API historis). Rainvision ditandai "Segera" di
  Timeline (BE belum punya endpoint histori massal).

Dokumen ini **hanya** mencakup Sub-proyek A.

## 2. Temuan Teknis Terkait (untuk konteks)

- Basemap Google Maps (`GoogleMapWrapper.jsx`) **tidak pernah berubah**
  berdasarkan `activeLayer` — style peta (jalan/air/label) hanya
  bergantung pada dark/light mode. Himawari dan OpenWeather cuma
  menambah tile overlay semi-transparan lewat `map.overlayMapTypes`, tidak
  mengganti basemap. Sudah sesuai keinginan, tidak perlu diubah.
- OpenWeather tile yang dipakai saat ini (`tile.openweathermap.org/map/...`)
  benar-benar live-only. OpenWeather punya endpoint terpisah (Weather Maps
  2.0, `maps.openweathermap.org/maps/2.0/weather/...?date=...`) yang
  mendukung histori/forecast — ini domain Sub-proyek B, tidak disentuh di
  sini.
- Wind particle (`/api/wind`) memakai OpenWeather Current Weather Data
  (titik, live-only) — tidak ada jalur historis yang realistis dengan
  integrasi yang ada. Tidak disentuh di sini (statusnya tetap live-only,
  toggle tetap ada di Current seperti sekarang).

## 3. Perubahan Utama

### 3.1 Hapus playback dari Tab Current

`src/app/(dashboard)/page.jsx`: hapus render `<TimeTravelBar>` dari path
Current, dan hapus seluruh state/handler pendukungnya:
`timelineIndex`, `isPlaying`, `ticks` (memo gabungan rain+himawari),
`handleTimelinePlayPause`, `handleTimelineScrub`, `handleTimelineGoLive`,
`selectedTimestamp`, `historicalStations`, `rainHistoryRefSensorId`,
`rainHistory`, `himawariPrefetchBasetime`, serta `useEffect` yang mereset
`timelineIndex` saat `activeLayer` berubah dan `useEffect` interval
`setInterval(...)` yang mengiterasi tick saat `isPlaying`.

`rainStations` (dipakai `CanvasHeatmapOverlay`) kembali menjadi alias
langsung ke `SENSOR_STATIONS` (tanpa cabang historis).

`himawariBasetimeCandidates` disederhanakan — tidak lagi bercabang
berdasarkan `timelineIndex` (yang sudah tidak ada), selalu memakai fallback
4 kandidat basetime terbaru:

```js
const himawariBasetimeCandidates = useMemo(() => {
  if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
  return himawari.ticks.slice(-4).reverse().map((t) => t.basetime);
}, [activeLayer, himawari.ticks]);
```

`useJmaHimawariTicks` **tetap dipakai** — grid 144-tick-nya masih perlu
untuk menentukan kandidat basetime mana yang mungkin sudah terbit; hanya
kemampuan *scrub ke tick tertentu* yang hilang dari Current.

### 3.2 Hapus kode rain-history yang jadi mati total

Karena satu-satunya pemakai `useRainHistoryRange`,
`useHistoricalSensorSnapshot`, `buildRainTicks`, dan
`parseSensorHistoryLabel` adalah playback yang dihapus di §3.1, dan
Rainvision tidak masuk cakupan Sub-proyek B (ditandai "Segera" di
Timeline) — kode ini jadi benar-benar tidak terpakai.

- **Hapus file:** `src/hooks/useRainHistoryRange.js`,
  `src/hooks/useHistoricalSensorSnapshot.js`.
- **Trim `src/lib/timeTravelRange.js`:** hapus export `buildRainTicks`,
  `parseSensorHistoryLabel`, `RAIN_HISTORY_FALLBACK_DAYS`,
  `RAIN_TICK_MINUTES`. **Pertahankan** `nearestTickIndex` — akan dipakai
  Sub-proyek B untuk membulatkan posisi OpenWeather ke tick Himawari
  terdekat.

### 3.3 Komponen baru: `LiveTimestampBadge.jsx`

`src/components/dashboard/LiveTimestampBadge.jsx` — presentational,
props `{ label, timestamp }` (`timestamp` adalah `Date | null`).

- `timestamp == null` → render `null` (tidak ada pill kosong/placeholder
  "–"; sama seperti pola `ColorRampLegend`/`MapInfoPill` yang sudah ada).
- Tampilan: pill glass kecil, ikon jam + teks
  `"<label> · diperbarui HH.mm WIB"` (format `toLocaleString('id-ID', {hour:'2-digit', minute:'2-digit'})` + suffix `WIB`, konsisten dengan
  format jam yang sudah dipakai `DashboardHeader.jsx`).
- Posisi: `position: absolute`, top-center, ditumpuk tepat di bawah
  `MapInfoPill` (mengikuti pola stacking notice Himawari yang sudah ada
  di `top: 128`) — badge ini di `top: ~120` (di atas notice Himawari agar
  urutan visual: info pill → timestamp badge → notice kondisional).
  Disembunyikan di bawah breakpoint `sm` seperti elemen overlay peta
  lainnya yang sejenis.

### 3.4 Sumber timestamp per mode (di `page.jsx`)

```js
const rainvisionLastSynced = useMemo(() => {
  if (!SENSOR_STATIONS.length) return null;
  const times = SENSOR_STATIONS
    .map((s) => new Date(s.lastUpdate))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) return null;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}, [SENSOR_STATIONS]);

const [himawariResolvedBasetime, setHimawariResolvedBasetime] = useState(null);
const himawariLastSynced = useMemo(() => {
  const tick = himawari.ticks.find((t) => t.basetime === himawariResolvedBasetime);
  return tick?.date ?? null;
}, [himawari.ticks, himawariResolvedBasetime]);

const activeLayerLastSynced =
  activeLayer === 'himawari' ? himawariLastSynced : rainvisionLastSynced; // rain/mesh/node share sensor data
```

`mesh`/`node` memakai sumber yang sama dengan `rain` (data sensor yang
sama, cuma visualisasi beda) — tidak perlu cabang terpisah.

### 3.5 `HimawariLayer.jsx`: laporkan basetime yang benar-benar tampil

`HimawariLayer` punya fallback-probe ke hingga 4 basetime kandidat
(terbaru dulu) — badge butuh tahu basetime mana yang *benar-benar*
berhasil crossfade in, bukan cuma menebak "yang paling baru". Tambah
prop callback baru:

```
onBasetimeResolved?: (basetime: string | null) => void
```

- Dipanggil dengan `basetime` di dalam `crossfadeIn(basetime)`, tepat di
  titik yang sama dengan `onStatus?.('ok')` dipanggil hari ini (sesudah
  `tryCandidate` menemukan kandidat yang lolos probe).
- Dipanggil dengan `null` di dua cabang lain yang sudah ada: kondisi
  "tidak aktif / tidak ada kandidat" (baris yang memanggil
  `onStatus?.('ok')` untuk kasus kosong) dan kondisi "semua kandidat
  gagal" (baris yang memanggil `onStatus?.('unavailable')`).
- Tidak mengubah signature `onStatus` yang sudah ada — ini murni
  penambahan callback baru, opsional (`?.()`), jadi pemanggil lama yang
  tidak menyertakan prop ini tidak terpengaruh.

`page.jsx` meneruskan `onBasetimeResolved={setHimawariResolvedBasetime}`
ke `<HimawariLayer>` pada path Current.

## 4. Error Handling

- `LiveTimestampBadge` tidak pernah menampilkan waktu palsu — `null`
  timestamp = tidak render apa pun.
- `rainvisionLastSynced` mengembalikan `null` kalau `SENSOR_STATIONS`
  kosong atau semua `lastUpdate` gagal diparse (`Number.isNaN`) —
  menjaga terhadap data yang belum termuat atau format tak terduga dari
  BE, bukan menampilkan `Invalid Date`.
- `himawariLastSynced` mengembalikan `null` kalau `himawariResolvedBasetime`
  belum ada match di `himawari.ticks` (termasuk kasus `unavailable`,
  yang di-set ke `null` lewat `onBasetimeResolved(null)`).

## 5. Verifikasi

Manual, lewat dev server (tidak ada framework test komponen di proyek
ini — konsisten dengan konvensi yang sudah ada):

1. Tab Current: pastikan **tidak ada** Play button/scrubber untuk mode
   apa pun (rain/mesh/node/himawari).
2. `LiveTimestampBadge` tampil dengan waktu yang benar di mode Rainvision
   (rain/mesh/node), dan berganti ke basetime Himawari yang sesuai saat
   pindah ke mode Himawari.
3. Simulasikan kondisi fallback Himawari (basetime terbaru belum
   terbit) — badge harus ikut basetime yang **benar-benar** berhasil
   tampil, bukan yang "seharusnya" terbaru.
4. Kondisi `unavailable` (semua kandidat gagal) — badge hilang (`null`),
   bukan menampilkan waktu basi.
5. Tidak ada regresi pada layer lain yang sudah jalan (lightning, storm,
   wind, OWM tile, sensor dot, klik node → drawer, Provincial Filter, Tab
   Timeline placeholder).
6. `npm test` tetap hijau — pastikan tidak ada test yang menyentuh
   `useRainHistoryRange`/`useHistoricalSensorSnapshot`/fungsi yang
   dihapus dari `timeTravelRange.js` (grep dulu sebelum menghapus).

## 6. Di Luar Scope

- Playback/scrubber di Tab Timeline (Sub-proyek B).
- Integrasi OpenWeather Weather Maps 2.0 / histori (Sub-proyek B).
- Speed multiplier, tombol Live yang fungsional (keduanya milik Tab
  Timeline, Sub-proyek B).
- Perbaikan `MapInfoPill` yang saat ini selalu menampilkan statistik
  "Kerapatan Hujan" apa pun mode aktifnya — ini quirk pra-existing yang
  terpisah dari permintaan badge ini, tidak disentuh di sini.
