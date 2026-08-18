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

## 7. Di Luar Cakupan (sub-proyek berikutnya)

Wind particle system; integrasi layer lightning & thunderstorm ke peta; timeline historis nasional; IndexedDB tile cache; QuadTree clustering; integrasi auth token penuh; endpoint intensitas bulk.
