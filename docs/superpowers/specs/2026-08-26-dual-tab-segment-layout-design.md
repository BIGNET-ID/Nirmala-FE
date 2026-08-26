# Design: Dual-Tab & Sky/Ground Segment Layout (PRD v2.0 Front-End Phase 1)

**Status:** Approved for implementation planning
**Tanggal:** 2026-08-26
**Sumber:** Product Requirement Document (PRD) - Nirmala Platform v2.0

## 1. Tujuan & Batasan

Melayout ulang dashboard Nirmala agar mengikuti struktur PRD v2.0 §4.1–§4.3
(Dual-Tab Current/Timeline, Sky/Ground Segment, Provincial Filter) — **hanya
lapisan tampilan (layout/komponen UI)**. Tidak ada perubahan pada:
- Hook data yang sudah ada (`usePlatformData`, `useSensorStream`,
  `useLightningStream`, `useThunderstormStream`, `useWindField`,
  `useJmaHimawariTicks`, `useRainHistoryRange`, `useHistoricalSensorSnapshot`).
- Endpoint/kontrak API yang sudah terintegrasi.
- Fitur yang sudah berjalan (rain density heatmap, mesh, node, Himawari,
  OpenWeather tile, lightning, thunderstorm, wind particle, time-travel bar).

Data vendor yang benar-benar tersedia dari BE saat ini hanya **JMA Himawari**
dan **Rainvision** (plus OpenWeather yang sudah terintegrasi terpisah di kode).
Vendor PRD lain (NASA, Sentinel, BMKG, Maxar) belum punya endpoint — di
layout ini mereka tampil sebagai kartu vendor **disabled** ("Segera"), bukan
dihilangkan, supaya arsitektur Sky/Ground Segment dari PRD tetap lengkap
terlihat begitu BE menambah integrasinya.

## 2. Pemetaan Vendor → Layer Existing

| Segment | Vendor (PRD §4.2) | Representasi di kode saat ini | Status |
|---|---|---|---|
| Sky | JMA Himawari-9 | `HimawariLayer` (`activeLayer==='himawari'`) | Aktif |
| Sky | OpenWeather (OWM) | `OpenWeatherLayer` (tile Hujan/Awan) + `WindParticleLayer` | Aktif |
| Sky | NASA (FIRMS & GIBS) | — | Disabled · "Segera" |
| Sky | Sentinel (ESA Copernicus) | — | Disabled · "Segera" |
| Ground | Rainvision | Rain Density heatmap (`CanvasOverlay`), Mesh (`MeshLayer`), Node (`SensorDotLayer`), `LightningLayer`, `ThunderstormLayer` | Aktif |
| Ground | BMKG | — | Disabled · "Segera" |
| Ground | Maxar | — | Disabled · "Segera" |

Catatan: data sensor saat ini (`/api/sensors`) tidak membawa `province_code`
— hanya lat/lng. Provincial Filter di fase ini memakai bounding-box statis
per provinsi (client-side `map.fitBounds`) untuk pan/zoom, dan penghitungan
"sensor dalam provinsi" di widget ringkasan memakai bbox lat/lng sebagai
pendekatan sementara. Begitu BE mengirim `province_code` asli, sumber filter
tinggal diganti tanpa mengubah UI.

## 3. Struktur Komponen

```
(dashboard)/page.jsx
├── DashboardHeader.jsx          [UBAH: tambah slot TabSwitcher]
│   └── TabSwitcher.jsx          [BARU] — Current | Timeline
├── ProvinceFilterSelect.jsx     [BARU] — hanya tampil saat tab = Current
├── SegmentTogglePanel.jsx       [BARU] — pengganti visual MetricLayerSelector
│   ├── Sky Segment (accordion, default expanded)
│   │   ├── Vendor card: JMA Himawari (aktif)
│   │   ├── Vendor card: OpenWeather (aktif — tile mode + wind particle)
│   │   ├── Vendor card: NASA (disabled)
│   │   └── Vendor card: Sentinel (disabled)
│   └── Ground Segment (accordion, default expanded)
│       ├── Vendor card: Rainvision (aktif — mode rain/mesh/node + overlay lightning/thunderstorm)
│       ├── Vendor card: BMKG (disabled)
│       └── Vendor card: Maxar (disabled)
├── ColorRampLegend.jsx          [TETAP]
├── MapInfoPill.jsx              [TETAP + ringkasan provinsi saat difilter]
├── TimeTravelBar.jsx            [TETAP — rain/himawari saja, tab Current saja]
├── TimelineComingSoon.jsx       [BARU] — isi tab Timeline
└── SensorDetailDrawer, SensorStatsCard, MapControls [TETAP]
```

`MetricLayerSelector.jsx` tidak dihapus sebagai logic — semua prop
(`activeLayer`, `onLayerChange`, `showLightning`, `owmLayer`, dst.) yang
sudah diteruskan dari `page.jsx` dipakai ulang persis; `SegmentTogglePanel`
hanya mengubah **kontainer visual** yang menampilkannya (dikelompokkan per
vendor Sky/Ground, bukan daftar flat).

## 4. Layout (viewport)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Logo | Nav | [Current] [Timeline] ← TabSwitcher | chips │
├─────────────────────────────────────────────────────────────────┤
│ [Filter Provinsi ▾]  (bar tipis, hanya tab Current)              │
├───────────────┬───────────────────────────────────┬─────────────┤
│ Sky Segment    │                                   │  Legend     │
│  ☑ Himawari    │                                   │  (existing) │
│  ☑ OpenWeather │            MAP CANVAS             │             │
│  ⊘ NASA        │                                   │             │
│  ⊘ Sentinel    │                                   │             │
│ ──────────     │                                   │             │
│ Ground Segment │                                   │             │
│  ☑ Rainvision  │                                   │             │
│  ⊘ BMKG        │                                   │             │
│  ⊘ Maxar       │                                   │             │
├───────────────┴───────────────────────────────────┴─────────────┤
│  Stats card (bottom-left, existing) | TimeTravelBar (bottom-center)│
└─────────────────────────────────────────────────────────────────┘
```

- **TabSwitcher**: segmented-pill di `DashboardHeader`, warna aktif cyan
  (konsisten dengan nav existing), ditempatkan antara nav dan status chips.
- **SegmentTogglePanel**: menggantikan posisi `MetricLayerSelector`
  (top:72, left:16), lebar ±280px (naik dari 248px) untuk menampung 2 grup +
  card vendor.
- **Vendor card aktif**: judul + master switch, expand untuk sub-item (mode
  single-select atau overlay switch independen — sama seperti
  `LayerSwitch`/tombol OWM yang sudah ada, hanya dikelompokkan).
- **Vendor card disabled**: opacity ~50%, badge "Segera", tooltip
  "Menunggu integrasi Backend", tidak ada handler klik.
- **ProvinceFilterSelect**: bar tipis full-width di bawah header, dropdown
  provinsi + tombol reset. Hanya tampil di tab Current.
- **TimelineComingSoon**: saat tab Timeline aktif, konten Current
  (map+panel) diganti layar penuh dengan ringkasan fitur PRD §4.6
  (Play/Pause, speed multiplier, 144-frame Himawari sync) sebagai roadmap
  card — gaya glass card konsisten, bukan halaman kosong.

## 5. Styling

Tidak ada token warna baru — tetap memakai variabel CSS existing
(`--nirmala-glass-bg`, `--nirmala-cyan`, `--nirmala-glass-border`, dll di
`theme.js`/`globals.css`).

- Font tetap `Google Sans Flex` (sudah default di `theme.js` typography) untuk
  semua label/nama vendor — konsisten dengan UI existing, tidak diganti ke
  font mono.
- Font mono (`--font-family-mono`) tetap dipakai HANYA untuk angka/status
  (counter, badge LIVE/health) — pola yang sudah ada di `DashboardHeader`,
  tidak diperluas ke nama vendor.
- Vendor card diberi border-left accent 2px per segmen (cyan muda = Sky,
  hijau-teal = Ground) untuk scan cepat tanpa perlu baca label — membantu
  persona lintas usia (22–60 tahun) yang beragam kecepatan membacanya.
- Density tinggi (spacing 8–12px) di panel kiri, konsisten dengan karakter
  dashboard operasional yang sudah ada.
- Motion: expand/collapse accordion 200ms (`--duration-fast`/`--ease-standard`
  yang sudah ada), hover transisi warna 150ms — tidak menambah pola animasi
  baru.

## 6. Interaksi

- Klik vendor card aktif → expand sub-item; state tetap dikontrol lewat
  props `page.jsx` yang sudah ada (`activeLayer`, `showLightning`,
  `showStorms`, `showWind`, `owmLayer`).
- Klik vendor card disabled → tidak ada aksi; tooltip on-hover/tap saja.
- Pilih provinsi → `map.fitBounds(bbox)` client-side; tidak ada request BE
  baru. Widget ringkasan menghitung sensor dalam bbox dari data yang sudah
  di-fetch.
- Klik tab Timeline → swap konten utama ke `TimelineComingSoon`; TabSwitcher
  tetap terlihat agar bisa balik ke Current tanpa reset state (activeLayer,
  filter provinsi, dll tetap tersimpan di memory React).

## 7. Error Handling (khusus UI)

- Provinsi terpilih tapi 0 sensor dalam bbox → pesan non-error di widget
  ringkasan: "Belum ada data sensor terdeteksi di wilayah ini" (bukan klaim
  akurat 100% karena bbox adalah pendekatan, bukan `province_code` asli).
- Vendor disabled tidak pernah memicu fetch/log error — murni state visual
  statis.

## 8. Verifikasi

Manual, lewat dev server browser (bukan API baru untuk ditest):
1. Semua toggle existing (rain/mesh/node/himawari/OWM/lightning/thunderstorm/
   wind) berfungsi sama persis setelah dipindah ke `SegmentTogglePanel` — nol
   regresi.
2. Pindah tab Current↔Timeline tidak memicu re-fetch/re-mount hook data
   (`usePlatformData` dkk. tidak re-run).
3. Vendor disabled tidak bisa diklik/toggle, tooltip muncul dengan benar.
4. Provinsi filter memicu pan/zoom peta dengan benar, reset mengembalikan ke
   `MAP_CENTER`/`MAP_ZOOM_DEFAULT`.
5. Kontras & responsif dasar (card disabled vs aktif, tidak ada horizontal
   scroll di lebar sempit).

## 9. Di Luar Scope (Phase 2+, sesuai PRD roadmap)

- Implementasi nyata Tab Timeline (playback 24 jam, speed multiplier, time
  scrubber) — hanya placeholder di fase ini.
- Integrasi endpoint BMKG/NASA/Sentinel/Maxar.
- `province_code` asli dari BE untuk filter sensor presisi (saat ini bbox
  client-side).
