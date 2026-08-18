# Spec: Nirmala Heatmap Density Rework + Wiring Data Asli

**Tanggal:** 2026-08-18
**Status:** Disetujui (siap masuk fase implementation plan)
**Ruang lingkup sesi:** Rework visualisasi heatmap + sambungkan data sensor asli + drawer detail berbasis timeseries asli.

---

## 1. Konteks & Masalah

Nirmala adalah platform pemantauan telemetri cuaca/geospasial *Ventusky-like* (Next.js 16, React 19, MUI v9, `@vis.gl/react-google-maps`, Google Maps JS API). Kondisi kode saat ini **belum sesuai** karena tiga hal:

1. **Marker lingkaran menutupi heatmap.** `page.jsx` merender `SensorMarkers` (cincin glow 40px + animasi pulsing + label nilai) di atas `CanvasOverlay` (IDW). Dua layer bertabrakan.
2. **Heatmap meng-interpolasi angka yang tidak ada.** `CanvasOverlay.jsx` melakukan IDW atas `st.rain`/`st.temp`. `nirmalaApi.js` memalsukan angka itu di mock 6-sensor, dan `getSensors()` di-hardcode **selalu** mengembalikan mock — API asli tidak pernah dipanggil.
3. **Data live bersifat biner.** Peta nasional tidak punya skalar kontinu untuk di-interpolasi.

### Realita data (terverifikasi dari respons API asli)

| Sumber | Isi | Implikasi |
| :-- | :-- | :-- |
| `GET /api/sensors` (4.582 sensor, 1 call) | **Biner**: `is_raining` (true/false) + `status` (active/inactive/blacklisted). Field: `id, latitude, longitude, blacklisted, manual_blacklisted, inactive, unavailable, status, is_raining, last_update, _scraped_at, _type`. **Tidak ada angka intensitas / suhu.** | Satu-satunya sumber untuk peta nasional live. |
| `GET /api/timeseries/{sensor_id}` | **Ada angka**: `rain.chart_data.datasets[0]` = "Rainfall (mm) - 5min average" (deret numerik) + `signal`. Per-sensor, historis. | Per sensor, satu-satu — tidak untuk 4.582 titik sekaligus. Dipakai di drawer detail. |
| Kafka topics | `rainvision.sensor.rain` (~1,5 M pesan) + `rainvision.sensor.signal` | Angka intensitas ADA di backend tapi belum di-expose massal. Upgrade path masa depan. |
| `GET /api/manifest` | `default_map {lat:-2.5, lng:118, zoom:6.5}`, permissions (`can_view_sensor/lightning/radar/himawari`), dataset counts. | Sumber center/zoom default & permission. |
| **Tidak ada suhu** di sumber manapun | — | Layer "Suhu" berdiri di atas data yang tidak ada → dibuang. |

Backend berada di IP privat `http://172.18.188.154:8000` (tidak terjangkau dari mesin dev) → dev butuh **fixture respons asli**, bukan mock fabrikasi.

---

## 2. Prinsip Inti (Honesty-First)

Peta nasional hanya menampilkan apa yang benar-benar diukur. Karena data live biner, heatmap **tidak berpura-pura** jadi intensitas mm/jam; ia menampilkan **kerapatan/konsentrasi hujan**. Angka mm/jam asli hanya muncul di detail per-sensor tempat datanya memang tersedia.

---

## 3. Requirements

### 3.1 Heatmap Density Engine (rewrite `CanvasOverlay.jsx`)

- **Teknik:** kernel radial **additive**, bukan IDW global. Setiap sensor **yang sedang hujan** (`is_raining === true`) memancarkan gradien radial lembut; kontribusi yang tumpang-tindih **dijumlahkan**. Makin banyak sensor hujan berdekatan → akumulasi makin tinggi → warna makin panas.
- **Keputusan visual (disetujui):** hanya sensor hujan yang memancarkan panas. Sensor kering **tidak** memancar (area kering tetap gelap, seperti layer hujan Ventusky yang transparan di area kering).
- **Yang di-encode:** kerapatan hujan (bukan intensitas). Legend: **"Kerapatan Hujan: rendah → tinggi"**.
- **Palet ramp akumulasi:** transparan → cyan (`#00e5ff`) → hijau (`#00e676`) → kuning (`#ffeb3b`) → oranye (`#ff9800`) → merah (`#f44336`).
- **Radius kernel dalam satuan geografis** (mis. radius representatif dalam km) dikonversi ke piksel sesuai zoom → blob membesar/mengecil natural saat zoom. Sensor hujan tunggal = blob cyan/hijau lembut; klaster padat = inti merah.
- **Performa:**
  - Render hanya sensor di dalam viewport (+margin bounds).
  - Gambar via `canvas` radial-gradient (`createRadialGradient`, komposit `lighter`/additive) — murah untuk ratusan titik terlihat.
  - Redraw di-throttle `requestAnimationFrame`; bersihkan listener/`OverlayView` saat unmount.
  - **Penyederhanaan (YAGNI):** `idwWorker.worker.js` yang berat **tidak** dipakai di jalur ini (gradient tidak butuh worker). QuadTree clustering hanya ditambah bila zoom sangat rendah terbukti lambat.

### 3.2 Marker → Dot Minimal (`page.jsx`)

- Hapus `SensorMarkers` cincin glow 40px + label nilai palsu + `getRainColor` palsu.
- Ganti **titik kecil** (~5–7px): warna menandai status (aktif / sedang hujan / blacklist), tanpa animasi berat.
- Tetap `onClick` → buka drawer detail. Dapat di-toggle on/off (`showMarkers`). Heatmap = lapisan utama; dot = lapisan interaksi tipis di atasnya.

### 3.3 Wiring Data Asli (`nirmalaApi.js`, `axios.js`)

- `getSensors()` benar-benar memanggil `GET /api/sensors` (hapus hardcode mock).
- **Dev fallback = fixture respons ASLI.** Salin respons unduhan ke repo di `src/mocks/fixtures/` (`sensors.json`, `lightning.json`, `thunderstorm.json`, `manifest.json`, `timeseries.json`, `topics.json`, `health.json`). Bila API asli tak terjangkau (dev), gunakan fixture — **bukan** angka fabrikasi.
- `normalizeSensors` diselaraskan ke field asli: `id, lat(latitude), lng(longitude), status, isRaining(is_raining), blacklisted, inactive, lastUpdate(last_update)`. **Buang** `rain`/`temp`/`humidity` palsu.
- Center/zoom default map dibaca dari manifest (`lat:-2.5, lng:118, zoom:6.5`) bila tersedia.

### 3.4 Sensor Detail Drawer + Timeseries (`SensorDetailDrawer.jsx`)

- Saat sensor diklik → fetch `GET /api/timeseries/{id}` → render:
  - **Grafik rain** (mm, "5min average", `rain.chart_data.datasets[0].data` vs `labels`).
  - **Grafik signal** (kualitas sinyal sensor).
  - Metadata asli: koordinat, status, sedang hujan?, update terakhir.
- **Buang** field "Suhu / °C" dan "Intensitas Hujan mm/jam statis" (diganti grafik).
- **Chart tanpa dependency baru:** SVG/canvas sparkline ringan sesuai tema dark-glass (mengikuti skill `dataviz`). Alternatif tercatat: Recharts bila butuh interaktivitas lebih (tidak dipakai dulu).
- State loading/empty ditangani (timeseries bisa kosong / gagal).

### 3.5 Dibuang / Di-disable

- **Layer "Suhu"** dihapus dari `MetricLayerSelector.jsx` (tak ada data). Layer valid saat ini: Hujan (density). Petir/Badai menyusul.
- **`ColorRampLegend.jsx`** diubah ke skala "Kerapatan Hujan" (bukan mm/jam).
- **Timeline 24 jam "forecast"** (`TimelinePlayer.jsx`): saat ini menganimasikan `timeStep` palsu. Tidak ada snapshot nasional historis → scrubbing heatmap nasional belum feasible → **hide/disable** untuk sekarang.

---

## 4. Gap yang Didokumentasikan (kebutuhan backend / klarifikasi)

1. **Snapshot historis nasional** untuk timeline heatmap (saat ini hanya per-sensor timeseries).
2. **Endpoint bulk numerik** intensitas mm/jam (topik `rainvision.sensor.rain` sudah ada) → upgrade path: engine density ditukar ke field intensitas asli tanpa mengubah arsitektur.
3. **Auth/token:** manifest menunjukkan permissions; integrasi token via axios/AuthContext perlu diklarifikasi dengan backend (fixture tidak menunjukkan header auth).
4. **Konektivitas backend** (IP privat) dari lingkungan dev/produksi (VPN/proxy?).

---

## 5. Peta Perubahan File

| File | Aksi |
| :-- | :-- |
| `src/components/map/CanvasOverlay.jsx` | Rewrite → kernel-density additive engine |
| `src/app/(dashboard)/page.jsx` | Marker → dot minimal; buang `getRainColor`/`SensorMarkers` palsu; state layer disederhanakan |
| `src/lib/nirmalaApi.js` | Real fetch `/api/sensors`; fixture fallback asli; `normalizeSensors` selaras field asli |
| `src/lib/axios.js` | (opsional) helper fallback fixture saat unreachable |
| `src/components/dashboard/SensorDetailDrawer.jsx` | Fetch timeseries; grafik rain+signal; buang suhu/mm-statis |
| `src/components/dashboard/MetricLayerSelector.jsx` | Buang layer "Suhu" |
| `src/components/dashboard/ColorRampLegend.jsx` | Label skala "Kerapatan Hujan" |
| `src/components/dashboard/TimelinePlayer.jsx` | Disable/hide (dicatat sebagai gap) |
| `src/mocks/fixtures/*.json` | **Baru** — respons API asli sebagai fixture dev |
| `src/components/common/Sparkline*` (atau setara) | **Baru** — chart ringan SVG untuk drawer |

---

## 6. Acceptance Criteria

1. Peta nasional menampilkan **heatmap kerapatan hujan** dari `is_raining` asli 4.582 sensor: klaster sensor hujan tampak sebagai area panas yang menyatu; area kering gelap.
2. Tidak ada angka mm/jam atau suhu yang difabrikasi di manapun pada peta/legend.
3. Marker lingkaran besar hilang; sensor tampil sebagai dot kecil yang bisa diklik & di-toggle.
4. Klik sensor → drawer menampilkan grafik **rain (mm)** + **signal** dari `/api/timeseries/{id}` asli, plus metadata asli.
5. Legend berbunyi "Kerapatan Hujan" (rendah→tinggi), bukan mm/jam.
6. Layer "Suhu" dan timeline forecast palsu tidak lagi tampil.
7. Di dev tanpa akses backend, aplikasi memakai fixture respons asli (bukan mock 6-sensor).
8. Pan/zoom tetap responsif (redraw di-throttle rAF, viewport-culled).

---

## 7. UI Alignment ke BIGNET Web Design System v19

Referensi gold-master: `~/Downloads/Design Consistent Web Pages` (Figma Make, "Nirmala" di atas BIGNET DS v19). Spec token otoritatif: `src/imports/bignet-web-design-system.md` di folder itu. Keputusan disetujui: **base map = Google Maps + dark style** (bukan pindah Leaflet); **adopsi brand penuh** (Roboto + Material Symbols + logo asli).

### 7.1 Token (sentralisasi → CSS variables + MUI theme)
Pindahkan hex hardcode di `page.jsx` ke satu sumber token (CSS vars di `globals`/`theme`), MUI theme memetakan ke token. Token kunci (dark, command-center):
- Grounds: `--nirmala-map-bg #050811`, `--nirmala-map-bg-2 #0a1628`; surface dark `#121212 / #1e1e1e / #272727`; border `#2e2e2e`.
- Glass: `background rgba(10,16,36,0.88)` + `backdrop-filter blur(20px)` + `1px solid rgba(255,255,255,0.07)`. Header `rgba(5,8,17,0.96)` blur20; timeline `rgba(10,16,36,0.92)` blur24.
- Aksen: `--nirmala-cyan #00e5ff` (interaksi/highlight); brand navy `#10325f`/`#0d47a1`; **yellow `#f9a825` aksen ≤15% hard cap, tidak pernah jadi teks di latar terang**.
- Teks dark: `#e0e0e0` (87%), muted `#a0a0a0` (60%).
- Rain ramp (heatmap & legend): `#60a5fa → #34d399 → #eab308 → #fb923c → #ef4444 → #c084fc`. (Catatan: legend berlabel "Kerapatan Hujan", lihat §3.5.)
- Radius: 4/8/12/16/full. Focus ring: `2px var(--color-focus-ring #0d47a1)` offset 4px + input glow `0 0 0 3px rgba(0,229,255,0.12)`. Z-index skala token (dropdown 1000 … tooltip 1600). Shadow hanya di light mode; dark pakai step surface.

### 7.2 Tipografi & ikon (adopsi penuh)
- Font **Roboto** (400/700) gantikan Inter. **Nilai numerik/teknis** (koordinat, ID, waktu, count, status) pakai **mono**. Skala fluid `clamp()` sesuai DS.
- **Micro-label pattern**: label seksi/panel = 10–13px, 700, UPPERCASE, `letter-spacing 0.08–0.1em`, muted ("LAYER DATA", "STATISTIK SENSOR", dst).
- Ikon **Material Symbols Rounded** (via Iconify `material-symbols:*` yang sudah ada, atau variable font). **Buang semua emoji** (🌧/🌡 di marker) — anti-pattern per QA.

### 7.3 Logo & favicon
Salin aset asli dari reference ke `public/`: logo `NIRMALA-BRAND` (header, ~26–28px) + `NIRMALA-BRAND-DARK`, favicon `nirmala-dark-favicon.png`. Ganti placeholder kotak "N".

### 7.4 Base map dark style
Terapkan **styled-map JSON Google Maps** near-black navy (air `#050811`, land gelap, label redup) agar peta menyatu dengan panel glass — setara tampilan CartoDB dark reference. Konfigurasi di `GoogleMapWrapper`.

### 7.5 Komponen (restyle ke spec glass)
Header 56px glass (wordmark · divider · icon tab-nav aktif underline cyan · spacer · LIVE pill hijau pulsing · alert pill biru · datetime mono · avatar). Panel mengambang: layer selector (row aktif tinted `${c}18` + border `${c}44` + dot), **stat mini-cards "STATISTIK SENSOR"** (Total/Aktif/Hujan/Blacklist, angka mono), zoom stack kanan-atas, **info-pill kontekstual atas-tengah**, legend kerapatan kanan-bawah (gradient bar + swatch rows), timeline player (disable dulu, §3.5), drawer kanan (`slide-in-right 0.22s`, icon badge bulat + metric + sparkline). Kartu: radius-lg, hairline border, header+body dipisah border.

### 7.6 Motion & aksesibilitas (QA ui-ux-pro-max)
Durasi 150–300ms, ease standard; keyframe `pulse-dot`/`slide-in-right`/`fade-in`; **`prefers-reduced-motion` wajib** (kill-switch). Pulse hanya di sensor **terpilih/aktif** (bukan 4.582 dot — perf). `cursor-pointer` di semua elemen klik; hover transisi halus; focus ring terlihat (keyboard nav); kontras teks AA+; responsif turun ke layar kecil (panel bisa collapse).

## 8. Acceptance Criteria UI

9. Semua warna berasal dari token terpusat (tidak ada hex acak di komponen); palet = BIGNET DS v19.
10. Font Roboto termuat; nilai numerik pakai mono; micro-label UPPERCASE muncul di tiap panel.
11. Tidak ada emoji sebagai ikon; semua ikon Material Symbols.
12. Logo & favicon NIRMALA asli terpasang (bukan placeholder).
13. Base map tampil near-black navy (dark style), menyatu dengan panel glass.
14. Panel = glass sesuai spec (blur/border/radius); stat mini-cards & info-pill hadir.
15. `prefers-reduced-motion` dihormati; focus ring terlihat; yellow ≤15% & bukan teks di latar terang.

## 9. Di Luar Cakupan (sub-proyek berikutnya)

Wind particle system; integrasi layer lightning & thunderstorm ke peta; timeline historis nasional; IndexedDB tile cache; QuadTree clustering; integrasi auth token penuh; endpoint intensitas bulk; halaman Settings & Login (reference punya, tapi di luar fokus dashboard sesi ini).
