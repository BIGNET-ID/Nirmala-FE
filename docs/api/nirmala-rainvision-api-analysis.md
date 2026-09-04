# Analisis & Breakdown Nirmala RainVision API

> **Sumber**: Swagger/OpenAPI di `https://c4c-nirmala.api.bignet.host/docs` (openapi.json diverifikasi langsung, versi backend `1.0.0`, judul service `Nirmala RainVision API`).
> **Tanggal analisis**: 2026-08-31.
> **Cara verifikasi**: setiap endpoint di dokumen ini sudah dites live (bukan hanya dibaca dari skema) — response schema di OpenAPI-nya sendiri tidak lengkap (tidak ada Pydantic model untuk body sukses, hanya `HTTPValidationError`), jadi bentuk data di bawah ini diambil dari pemanggilan nyata per 2026-08-31.
> **Status sumber data internal**: root endpoint (`GET /`) membocorkan alamat broker Kafka internal (`172.18.188.180:9092`). Ini bukan temuan baru dari kode kita, murni informasi dari API pihak backend — dicatat di sini untuk kesadaran tim, bukan untuk ditindaklanjuti oleh tim frontend.

---

## 1. Ringkasan Eksekutif

Nirmala RainVision API adalah backend tunggal yang menggabungkan **3 jenis sumber data** di balik satu base URL:

1. **Data sensor real-time milik Nirmala sendiri** (via Kafka: `rainvision.sensors`, `rainvision.lightning`, `rainvision.thunderstorm`, `rainvision.sensor.rain`, `rainvision.sensor.signal`) — ini yang selama ini jadi fokus dan **sudah terintegrasi penuh** ke Nirmala-FE.
2. **Citra satelit/tile cuaca** dari NASA GIBS (Himawari, VIIRS/JPSS, GPM/IMERG) — gabungan CDN publik, tanpa autentikasi, tanpa disimpan di server Nirmala. **Belum diintegrasikan** ke frontend (Himawari yang dipakai saat ini datang langsung dari JMA, jalur terpisah).
3. **Data cuaca titik (point) dari pihak ketiga** — prakiraan (JMA/Open-Meteo, NOAA GFS, Google Weather) dan reanalysis/observasi (NASA POWER, NASA IMERG Earthdata, ESA Sentinel). **Belum diintegrasikan sama sekali.**

Total **24 operation** (23 endpoint fungsional + root). Karena tim saat ini fokus ke *current data* (data sensor real-time), grup #1 adalah yang paling relevan untuk dicek gap-nya dulu, sementara grup #2 dan #3 adalah kandidat fase berikutnya.

Catatan penting soal bentuk data: banyak endpoint di grup #2 dan #3 sebenarnya mengembalikan **JSON metadata terstruktur** (bukan gambar mentah) — mereka membungkus URL tile/gambar dari CDN pihak ketiga (NASA GIBS, Open-Meteo, dst) sekaligus memberi field `note`/`usage` yang secara eksplisit menjelaskan cara pakainya (misalnya "`tile_url` diisi otomatis oleh Leaflet, jangan dibuka mentah"). Ini pola API yang cukup rapi untuk dikonsumsi map library seperti Leaflet.

---

## 2. Tabel Status Integrasi — Semua 24 Endpoint

| # | Method + Path | Fungsi Singkat | Status di Nirmala-FE | Lokasi Kode |
|---|---|---|---|---|
| 1 | `GET /api/sensors` | Snapshot semua sensor (lokasi, status, `is_raining`) | ✅ Terintegrasi | `nirmalaApiService.getSensors()` → `SensorDotLayer` |
| 2 | `GET /api/lightning` | Snapshot sambaran petir terkini | ⚠️ Data ditarik, **belum di-wire ke peta** | `nirmalaApiService.getLightning()`, tercatat "upcoming" di `metrics.js` |
| 3 | `GET /api/thunderstorm` | Snapshot sel badai (poligon GeoJSON) | ⚠️ Data ditarik, **belum di-wire ke peta** | `nirmalaApiService.getThunderstorm()`, tercatat "upcoming" di `metrics.js` |
| 4 | `GET /api/manifest` | Konfigurasi akun: permission, default map/layer | ✅ Terintegrasi | `AuthContext.getManifest()` |
| 5 | `GET /api/timeseries/{sensor_id}` | Riwayat hujan+sinyal per sensor (opsional `from`/`to`) | ✅ Terintegrasi | `SensorDetailDrawer` via `getTimeseries()` |
| 6 | `GET /api/health` | Status pipeline Kafka (uptime, backlog per topic) | ✅ Terintegrasi | `usePlatformData` (polling 60s) |
| 7 | `GET /api/topics` | Daftar topic Kafka yang tersedia | ✅ Terintegrasi | `nirmalaApiService.getTopics()` |
| 8 | `GET /api/raw/{topic}` | Pesan mentah per topic (debug, `limit` default 20) | ❌ Belum dipakai | — |
| 9 | `GET /api/stream` | SSE ringkas: notifikasi "ada versi baru" | ⚠️ Ada hook generik (`useSSEStream`), tidak dipakai untuk channel ini secara eksplisit | `useSSEStream.js` |
| 10 | `GET /api/stream/sensors` | SSE penuh — update sensor real-time | ✅ Terintegrasi | `useSensorStream.js` |
| 11 | `GET /api/stream/lightning` | SSE penuh — update petir real-time | ✅ Hook ada, tapi **layer visual belum ada** (sama seperti #2) | `useLightningStream.js` |
| 12 | `GET /api/stream/thunderstorm` | SSE penuh — update sel badai real-time | ✅ Hook ada, tapi **layer visual belum ada** (sama seperti #3) | `useThunderstormStream.js` |
| 13 | `GET /api/satellite` | Gabungan semua layer tile satelit (Himawari+VIIRS+IMERG) | ❌ Belum dipakai | — |
| 14 | `GET /api/himawari` | Tile awan Himawari-8/9 via NASA GIBS | ❌ Belum dipakai (frontend pakai jalur JMA langsung, lihat §3.2) | — |
| 15 | `GET /api/jpss` | Tile VIIRS (NOAA-20/SNPP): citra harian + banjir | ❌ Belum dipakai | — |
| 16 | `GET /api/gpm` | Peta laju hujan current se-Indonesia (GPM/IMERG, tile) | ❌ Belum dipakai | — |
| 17 | `GET /api/imerg` | **Nilai** laju hujan mm/jam di satu titik (GPM/IMERG Earthdata) | ❌ Belum dipakai | — |
| 18 | `GET /api/jma` | Prakiraan cuaca per titik (JMA MSM/GSM via Open-Meteo) | ❌ Belum dipakai | — |
| 19 | `GET /api/google` | Prakiraan cuaca per titik (Google Weather, **berbayar**) | ❌ Belum dipakai | — |
| 20 | `GET /api/sentinel` | Katalog scene Sentinel ESA (non-cuaca, metadata saja) | ❌ Belum dipakai | — |
| 21 | `GET /api/nasa` | Presipitasi & awan harian per titik (NASA POWER) | ❌ Belum dipakai | — |
| 22 | `GET /api/nasa/indonesia` | Peta laju hujan current se-Indonesia — **alias `/api/gpm`** (dikonfirmasi di deskripsi root endpoint) | ❌ Belum dipakai (duplikat #16) | — |
| 23 | `GET /api/noaa` | Prakiraan cuaca per titik (NOAA GFS *atau* JMA, via Open-Meteo) | ❌ Belum dipakai | — |
| 24 | `GET /` | Root — daftar semua endpoint + info service (termasuk alamat Kafka internal) | ❌ Belum dipakai (tidak perlu di-consume FE) | — |

Legenda: ✅ = data + UI lengkap · ⚠️ = data ditarik tapi belum tervisualisasi penuh · ❌ = sama sekali belum diintegrasikan.

---

## 3. Breakdown Per Endpoint

### 3.1 Grup A — Data Sensor & Real-Time (fokus tim saat ini)

Ini grup yang menopang dashboard Nirmala hari ini. Semua berbasis Kafka topic yang disebut di `GET /api/health` dan `GET /api/topics`: `rainvision.sensors`, `rainvision.lightning`, `rainvision.thunderstorm`, `rainvision.sensor.rain`, `rainvision.sensor.signal`.

#### `GET /api/sensors`
Snapshot semua sensor curah hujan Nirmala se-Indonesia.

```json
{
  "scraped_at_utc": "2026-08-31T08:06:27Z",
  "bounds": { "north": 6.5, "south": -11.5, "east": 141.5, "west": 94.5 },
  "filters": { "active": true, "bignet": true, "inactive": true, "blacklisted": true },
  "total_items": 4584,
  "alert": "Live: 4584 sensor · 4480 aktif · 55 hujan · 104 blacklist",
  "sensors": [
    {
      "id": "bignet_1093",
      "latitude": -2.796992,
      "longitude": 100.143703,
      "blacklisted": true,
      "manual_blacklisted": false,
      "inactive": false,
      "unavailable": false,
      "status": "blacklisted",
      "is_raining": false,
      "last_update": "2026-08-31T07:50:00",
      "_scraped_at": "2026-08-31T08:06:27Z",
      "_type": "sensor"
    }
  ]
}
```

- **Fungsi untuk Nirmala**: sumber utama `SensorDotLayer` (posisi + status tiap titik sensor di peta) dan penghitung agregat (jumlah aktif/hujan/blacklist).
- **Field yang sudah dipakai** (via `normalizeSensor`): `id, latitude, longitude, status, is_raining, blacklisted, manual_blacklisted, inactive, unavailable, last_update, _scraped_at`.
- **Field yang tersedia tapi belum dipakai**: `bounds` (bounding box Indonesia — bisa dipakai untuk auto-fit peta pertama kali alih-alih hardcode), `filters` (state filter default dari server), `alert` (ringkasan human-readable siap tampil — berpotensi dipakai langsung sebagai badge/status text tanpa perlu Nirmala-FE menghitung ulang jumlah aktif/hujan/blacklist sendiri).
- **Catatan penting**: field ini murni **binary** (`is_raining`) + status kategori, **tidak ada intensitas hujan numerik spasial** — ini alasan `METRICS.rain` di `metrics.js` memakai kerapatan sensor (bukan mm/jam) untuk layer peta. Intensitas numerik baru tersedia per-sensor lewat `/api/timeseries/{id}` (lihat di bawah).

#### `GET /api/lightning`
Snapshot sambaran petir.

```json
{
  "request_time": "2026-08-12 16:20 (UTC)",
  "content": [
    {
      "long": 120.0745,
      "lat": 14.3817,
      "cloud": false,
      "signalStrengthKA": -25,
      "time": "2026-08-12 16:10 (UTC)",
      "request_time": "2026-08-12 16:20 (UTC)",
      "_type": "lightning"
    }
  ]
}
```

- **Fungsi untuk Nirmala**: menampilkan titik sambaran petir historis/terkini (cloud-to-cloud vs cloud-to-ground bisa dibedakan dari `cloud`, dan intensitasnya dari `signalStrengthKA`).
- **Status**: sudah ditarik & dinormalisasi (`normalizeLightningStrike`), tapi **belum ada layer peta visual** — di `metrics.js` masuk `UPCOMING_LAYERS`. Ini gap paling siap-digarap karena data & normalisasi sudah ada, tinggal komponen render (mis. `LightningLayer.jsx` yang disebut di laporan eksplorasi tapi tampaknya belum sepenuhnya wired).

#### `GET /api/thunderstorm`
Snapshot sel badai sebagai poligon GeoJSON.

```json
{
  "request_time": "2026-08-12 17:00 (UTC)",
  "content": [
    {
      "stormId": 300760276,
      "referenceTime": "2026-08-12 17:00 (UTC)",
      "severe": false,
      "centroid": { "type": "Point", "coordinates": [120.65381, 10.50014] },
      "polygon": { "type": "Polygon", "coordinates": [[[120.6144, 10.26196], "..."]] },
      "request_time": "2026-08-12 17:00 (UTC)",
      "_type": "thunderstorm"
    }
  ]
}
```

- **Fungsi untuk Nirmala**: menggambar area sel badai (bukan cuma titik) di peta, dengan flag `severe` untuk badai signifikan.
- **Status**: sama seperti petir — data & normalisasi (`normalizeThunderstormCell`) sudah ada, layer visual belum di-wire. `polygon` sudah GeoJSON standar sehingga tinggal di-render lewat layer poligon Google Maps/Leaflet tanpa transformasi tambahan.

#### `GET /api/timeseries/{sensor_id}` (+ `?from=&to=`)
Riwayat rain & signal strength per sensor, granularitas 5 menit.

```json
{
  "sensor_id": "bignet_1010",
  "n_days": null,
  "rain": {
    "success": true,
    "chart_data": {
      "labels": ["08-29 13:05", "08-29 13:10", "..."],
      "data": ["<nilai mm per interval>"]
    }
  },
  "signal": { "signal_data": { "labels": ["..."], "data": ["..."] } }
}
```

(Format berbeda tergantung ada tidaknya `from`/`to`: tanpa parameter memakai bungkus `chart_data`/`signal_data` seperti di atas; dengan `from`/`to` eksplisit, hasil observasi lain menunjukkan bentuk lebih datar `rain.points: [{ts, value}]` — **frontend harus menangani kedua bentuk** karena `nirmalaApiService.normalizeTimeseries` saat ini diasumsikan hanya menangani satu bentuk; ini poin verifikasi yang perlu dicek ke tim backend agar tidak ada asumsi yang salah.)

- **Fungsi untuk Nirmala**: grafik hujan+sinyal di `SensorDetailDrawer` saat user klik sebuah sensor.
- **Field yang dipakai**: `rain` (mm per 5 menit) dan `signal` digabung berdasarkan **timestamp asli** (bukan index) karena rain punya gap konektivitas sedangkan signal gapless.
- ⚠️ **Poin yang harus dikonfirmasi ke tim backend/API** (karena instruksi zero-tolerance-error): dua bentuk response (`chart_data` vs `points`) yang teramati di atas berasal dari kondisi query yang berbeda saat pengujian — sebelum dianggap final, tim FE sebaiknya minta konfirmasi eksplisit dari tim backend soal kontrak field ini per kombinasi parameter, supaya `normalizeTimeseries` tidak diam-diam salah parse salah satu bentuk.

#### `GET /api/manifest`
Konfigurasi akun & ringkasan dataset.

```json
{
  "source": "kafka://rainvision (live)",
  "scraped_at_utc": "2026-08-31T08:06:27Z",
  "live": true,
  "account": {
    "permissions": { "can_view_sensor": true, "can_view_lightning": true, "can_view_radar": true, "can_view_himawari": true },
    "is_admin": false,
    "is_indonesia": true,
    "default_map": { "lat": -2.5, "lng": 118.0, "zoom": 6.5 },
    "default_layer": "sensor"
  },
  "datasets": {
    "sensors": { "count": 4584 },
    "thunderstorm": { "count": 7 },
    "lightning": { "count": 586 },
    "messages_consumed": { "...": "..." }
  }
}
```

- **Fungsi untuk Nirmala**: sumber `default_map` (posisi awal peta) dan `permissions` (kontrol akses fitur per akun) — dipanggil sekali per sesi login.
- **Field belum dipakai**: `permissions.can_view_radar` dan `can_view_himawari` — berarti backend **sudah menyiapkan gating akses** untuk layer radar dan Himawari yang belum diimplementasikan di frontend. Ini sinyal jelas bahwa integrasi radar/Himawari via API ini memang direncanakan oleh backend, bukan sekadar tersedia kebetulan.

#### `GET /api/health`
Status pipeline Kafka.

```json
{
  "connected": true,
  "caught_up": true,
  "uptime_s": 6468.0,
  "scraped_at_utc": "2026-08-31T08:06:27Z",
  "messages_consumed": { "rainvision.sensors": 3668761, "rainvision.sensor.rain": 29617992 },
  "last_message_epoch": { "rainvision.sensors": 1788163590.19 },
  "state": { "sensors": 4584, "storms": 7, "lightning": 586, "sensors_with_rain": 4500, "sensors_with_signal": 4531 }
}
```

- **Fungsi untuk Nirmala**: indikator kesehatan pipeline data (dipoll tiap 60 detik) — bisa dipakai untuk badge "data live/stale" di UI.
- **Field belum dimanfaatkan penuh**: `last_message_epoch` per topic bisa dipakai untuk mendeteksi topic mana yang macet (mis. petir tidak update lebih dari X menit), bukan cuma status koneksi umum.

#### `GET /api/topics`
```json
{ "topics": ["rainvision.sensors", "rainvision.lightning", "rainvision.thunderstorm", "rainvision.sensor.rain", "rainvision.sensor.signal"] }
```
- **Fungsi untuk Nirmala**: daftar topic yang valid untuk dipakai sebagai parameter `/api/raw/{topic}`. Saat ini hanya dipanggil tapi hasilnya tidak dipakai untuk validasi apa pun di FE.

#### `GET /api/raw/{topic}?limit=20`
```json
{
  "topic": "rainvision.sensors",
  "messages": [
    { "id": "bignet_999", "latitude": 1.46335, "longitude": 99.471042, "status": "active", "is_raining": false, "last_update": "2026-08-31T08:10:00", "_scraped_at": "2026-08-31T08:27:52Z", "_type": "sensor" }
  ]
}
```
- **Fungsi**: melihat pesan mentah per topic Kafka — murni tool debugging/observability, **bukan untuk dikonsumsi UI produksi**. Berguna kalau tim FE perlu memverifikasi bentuk data terbaru tanpa akses langsung ke Kafka.

#### SSE Streams — `GET /api/stream`, `/api/stream/sensors`, `/api/stream/lightning`, `/api/stream/thunderstorm`
- **Mekanisme**: server push lewat Server-Sent Events; `/api/stream` adalah versi ringkas (notifikasi "ada versi baru" tanpa payload penuh, cocok untuk trigger refetch murah), sedangkan 3 lainnya mengirim payload penuh per domain. Semua terima query `?interval=` (1–300 detik, default 10) untuk atur cadence kirim per klien, dibatasi kuota `MAX_SSE` koneksi bersamaan di server.
- **Fungsi untuk Nirmala**: dasar live-update peta tanpa polling — `useSensorStream` sudah dipakai; `useLightningStream`/`useThunderstormStream` sudah ada sebagai hook tapi hasilnya belum divisualisasikan (selaras dengan status REST snapshot-nya di atas).
- **Catatan arsitektur yang sudah benar**: koneksi SSE sengaja **tidak** lewat proxy Next.js (langsung ke `NEXT_PUBLIC_NIRMALA_STREAM_BASE_URL`) karena proxy `await upstream.text()` akan menahan seluruh body dan menyumbat stream — ini keputusan desain yang tepat dan sebaiknya dipertahankan untuk endpoint stream baru apa pun ke depannya.
- **Endpoint `/api/stream` (ringkas)** belum benar-benar dimanfaatkan — berpotensi jadi cara lebih murah untuk deteksi "ada data baru" ketimbang selalu subscribe ke payload penuh, khususnya untuk client dengan bandwidth terbatas (mobile).

---

### 3.2 Grup B — Citra Satelit / Tile

Semua endpoint ini **tidak menyimpan data di server Nirmala** — mereka membungkus URL tile/gambar dari NASA GIBS (CDN publik, tanpa autentikasi) dengan metadata siap pakai untuk Leaflet/Google Maps.

#### `GET /api/satellite` — gabungan semua layer
```json
{
  "source": "NASA GIBS (multi-satelit)",
  "coverage": "Indonesia",
  "usage": "image_url = GAMBAR NYATA Indonesia — BUKA LANGSUNG di browser atau L.imageOverlay(...); tile_url = untuk peta interaktif, {z}/{y}/{x} diisi OTOMATIS oleh L.tileLayer(...) — JANGAN buka tile_url mentah.",
  "excluded": {
    "GOES-East / GOES-West (NOAA)": "ada di GIBS tapi meliput Amerika — bukan Indonesia",
    "Meteosat / Fengyun FY-3 & FY-4 / MetOp": "tidak tersedia di GIBS; butuh akun EUMETSAT / China NSMC"
  },
  "count": 5,
  "layers": [ "..." ]
}
```
- **Fungsi**: satu panggilan untuk dapat semua layer tile satelit sekaligus (Himawari + VIIRS + IMERG) — cocok untuk panel "pilih layer satelit" di UI, tanpa perlu 3 panggilan terpisah.
- Field `excluded` transparan menjelaskan keterbatasan cakupan (berguna untuk dokumentasi/tooltip di UI kalau user bertanya "kenapa tidak ada radar Meteosat").

#### `GET /api/himawari`
```json
{
  "source": "Himawari-9 (JMA) via NASA GIBS",
  "coverage": "Indonesia (geostasioner 140,7°E — geometri optimal)",
  "layers": [{
    "id": "himawari_ir", "name": "Himawari-9 — Awan IR (Band 13)",
    "kind": "xyz",
    "tile_url": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    "max_zoom": 6, "refresh_min": 10
  }]
}
```
- **⚠️ Temuan penting**: Nirmala-FE saat ini sudah punya `HimawariLayer.jsx` yang mengambil tile **langsung dari `www.jma.go.jp`** (bukan dari endpoint ini), dengan logic probe-fallback basetime sendiri. Endpoint API baru ini menyediakan **jalur alternatif via NASA GIBS** untuk citra Himawari yang sama secara konsep (band IR), dengan `refresh_min` dan `max_zoom` sudah ditentukan server — berarti ada **duplikasi sumber untuk data yang sama**. Ini poin keputusan arsitektur (lihat §5) — bukan bug, tapi perlu keputusan sadar: pertahankan jalur JMA langsung, pindah ke endpoint ini, atau simpan dua-duanya untuk failover.

#### `GET /api/jpss`
Tile VIIRS (NOAA-20/SNPP) — citra optik harian + deteksi banjir 3-hari, `max_zoom: 9`. Belum ada padanan di frontend saat ini (murni fitur baru, bukan duplikasi).

#### `GET /api/gpm` & `GET /api/nasa/indonesia`
Keduanya **identik** — root endpoint mengonfirmasi `/api/nasa/indonesia` adalah alias `/api/gpm`. Mengembalikan 1 gambar overlay laju hujan (`rainmap.image_url`, PNG transparan 1024×380px) yang menutup seluruh Indonesia, plus versi tile WMS. Update tiap ~30 menit.
- **Fungsi potensial untuk Nirmala**: pengganti/pelengkap layer "Kerapatan Hujan" (`METRICS.rain`) yang saat ini murni kualitatif (kerapatan sensor `is_raining`) — endpoint ini punya **intensitas hujan spasial nyata** (mm/jam) untuk seluruh Indonesia, bukan hanya per-titik-sensor. Ini relevan langsung dengan catatan di `AGENTS.md` soal keterbatasan data spasial rain saat ini.

---

### 3.3 Grup C — Data Cuaca Titik (Forecast / Reanalysis Pihak Ketiga)

Semua butuh `lat`/`lon` (wajib), sebagian besar diproxy dari Open-Meteo (gratis) kecuali Google (berbayar).

#### `GET /api/imerg?lat=&lon=&steps=`
Nilai laju hujan **near-real-time** per titik (bukan tile — angka langsung), grid ~11km, tiap 30 menit, latensi ~4 jam.
```json
{
  "unit": "mm/hr",
  "latest": { "time": "2026-08-31T03:30:00Z", "precip_mm_hr": 0.0 },
  "series": [{ "time": "2026-08-31T03:00:00Z", "precip_mm_hr": 0.0 }, "..."]
}
```
- **Beda dengan `/api/gpm`**: `/api/gpm` = gambar/tile untuk seluruh Indonesia; `/api/imerg` = angka presisi untuk satu titik koordinat. Keduanya sumber data sama (GPM/IMERG) tapi bentuk output beda kegunaan.

#### `GET /api/jma?lat=&lon=&days=`
Prakiraan cuaca titik dari model JMA MSM/GSM (via Open-Meteo), gratis: `current` + `daily` + `hourly` — precip (mm), suhu (°C), awan (%), angin (km/h + arah derajat), kelembapan (%).

#### `GET /api/noaa?lat=&lon=&days=&model=`
Sama seperti `/api/jma` tapi model bisa dipilih: `gfs_seamless` (NOAA GFS, default) atau `jma_seamless` (JMA MSM/GSM) — **artinya `/api/noaa?model=jma_seamless` fungsinya tumpang tindih dengan `/api/jma`**. Kalau mau dipakai, cukup satu endpoint (`/api/noaa` dengan parameter model) yang perlu diintegrasikan untuk cover kedua model, bukan dua-duanya.

#### `GET /api/google?lat=&lon=&days=`
Prakiraan dari Google Weather API — **berbayar**, di-cache 1 jam di server. Karena berbayar, integrasi ke FE (kalau nanti dipakai) sebaiknya dibatasi ke skenario yang benar-benar butuh akurasi lebih tinggi dari Open-Meteo, bukan dipanggil bebas dari client.

#### `GET /api/nasa?lat=&lon=&days=`
Presipitasi & awan **harian** dari NASA POWER (MERRA-2/GEOS reanalysis) — latensi 2-3 hari, jadi ini historis, bukan real-time. Contoh nyata: field `precip_mm` dan `cloud_pct` sering kembali `null` untuk hari-hari terbaru (karena reanalysis belum diproses) — **frontend wajib menangani `null` secara eksplisit**, jangan asumsikan selalu angka.

#### `GET /api/sentinel?lat=&lon=&days=&collection=`
Katalog scene citra satelit ESA Sentinel (Sentinel-1/2/3/5P) — **metadata saja** (nama file, waktu, `cloud_pct`, footprint GeoJSON, link S3), bukan pixel gambar (butuh akun CDSE gratis terpisah untuk unduh piksel). **Non-cuaca** — lebih ke observasi permukaan/tutupan lahan. Tanpa `lat`/`lon` = seluruh Indonesia.

---

### 3.4 Grup D — Utilitas

#### `GET /api/raw/{topic}` dan `GET /`
Sudah dibahas di atas — keduanya murni tooling/observability untuk developer, tidak dimaksudkan untuk dipanggil dari UI produksi.

---

## 4. Rekomendasi Best Practice Integrasi

1. **Ikuti pola proxy yang sudah ada, jangan bikin baru per fitur.** `src/app/api/[...path]/route.js` sudah generik (meneruskan `/api/*` apa pun ke `NIRMALA_BACKEND_URL` dengan Bearer token opsional). Endpoint baru manapun di Grup B/C otomatis bisa lewat proxy ini **tanpa perlu route baru** — cukup dipanggil dari `nirmalaApiService` dengan path yang sesuai. Pengecualian: endpoint SSE baru (kalau ada) harus tetap **langsung dari browser**, bukan lewat proxy — konsisten dengan alasan buffering yang sudah didokumentasikan untuk stream sensor/petir/badai saat ini.

2. **Selalu sertakan fallback fixture untuk endpoint baru**, mengikuti pola `nirmalaApiService` yang sudah ada (tiap method fallback ke `/public/fixtures/*.json` saat request gagal). Ini penting khususnya untuk Grup C yang bergantung pada layanan pihak ketiga (Open-Meteo, Google) yang bisa down/rate-limit independen dari uptime Nirmala sendiri.

3. **Defensive parsing wajib, terutama untuk field yang eksplisit bisa `null`** — contoh nyata: `/api/nasa` sering mengembalikan `precip_mm: null` untuk hari terbaru. Normalizer baru (mengikuti pola `normalizeSensor`/`normalizeTimeseries`) harus eksplisit menangani `null`, bukan mengasumsikan selalu number.

4. **Cache/refresh interval harus ikut anjuran server, bukan ditebak sendiri.** Banyak endpoint sudah memberi tahu cadence idealnya di field response: `/api/gpm` & `/api/himawari` (~10–30 menit), `/api/imerg` (30 menit, latensi ~4 jam), `/api/nasa` (harian, latensi 2-3 hari), `/api/google` (di-cache 1 jam di server — jangan polling lebih sering dari itu karena berbayar). Pola `useWindField` (viewport 20 menit, ambient 3 jam) sudah contoh yang benar untuk ditiru.

5. **Jangan integrasikan endpoint yang fungsinya duplikat tanpa keputusan sadar** — sudah ditemukan 2 pasang: `/api/gpm` ≡ `/api/nasa/indonesia` (alias eksplisit dari backend), dan `/api/noaa?model=jma_seamless` ≡ `/api/jma` (model sama, endpoint beda). Pilih satu representasi kanonik di layer `nirmalaApiService`, jangan panggil dua-duanya.

6. **Manfaatkan `manifest.account.permissions`** (`can_view_radar`, `can_view_himawari`) sebagai *feature flag* resmi dari backend sebelum mengaktifkan layer baru di UI — backend sudah menyiapkan gating ini, jadi integrasi radar/Himawari baru sebaiknya menghormati flag ini, bukan selalu tampil untuk semua akun.

7. **Tambahkan `.env.example`** — repo saat ini **tidak punya** `.env.example` sama sekali (hanya `.env.local` berisi nilai asli), padahal `AGENTS.md` mewajibkannya sebagai *source of truth* env var dengan placeholder. Ini gap kepatuhan guardrail yang sudah ada, terlepas dari fitur API baru — perlu dibuat sebelum menambah env var baru untuk endpoint Grup C (mis. kalau nanti butuh key terpisah untuk rate-limit tracking).

8. **Bereskan env var `VIONA_*` yang sudah tidak dipakai** di `.env.local` — kodenya sudah dihapus total, tinggal env var tertinggal. Bukan blocker, tapi technical debt kecil yang gampang dibereskan bersamaan saat merapikan env var untuk integrasi baru.

---

## 5. Rekomendasi Prioritas / Roadmap

> Bagian ini murni **saran** berdasarkan analisis gap di atas — bukan keputusan tim. Diurutkan dari yang paling murah/cepat berdampak, ke yang butuh diskusi arsitektur lebih dulu.

| Prioritas | Item | Alasan | Effort relatif |
|---|---|---|---|
| 1 | Wire layer **petir** & **sel badai** ke peta (data+normalizer sudah ada, tinggal komponen visual) | Gap paling kecil untuk effort — bukan integrasi baru, cuma "selesaikan yang sudah 80% jalan" | Kecil |
| 2 | Manfaatkan field `alert`, `bounds` dari `/api/sensors` yang sudah ditarik tapi belum dipakai | Zero biaya integrasi baru (data sudah ada di response yang sudah dipanggil), langsung kurangi kerja hitung ulang di FE | Sangat kecil |
| 3 | Klarifikasi ke backend soal kontrak `rain.chart_data` vs `rain.points` di `/api/timeseries` | Ini soal *kebenaran data*, sesuai concern "jangan sampai ada kesalahan" — perlu dipastikan sebelum menambah fitur apa pun di atas endpoint ini | Kecil (butuh koordinasi, bukan koding) |
| 4 | Integrasikan `/api/gpm` (peta intensitas hujan spasial se-Indonesia) sebagai pelengkap/pengganti layer kerapatan hujan kualitatif saat ini | Langsung menjawab keterbatasan yang sudah dicatat di `AGENTS.md` (tidak ada data mm/jam spasial) — dampak visual besar untuk eksekutif non-teknis | Sedang |
| 5 | Putuskan Himawari: pertahankan jalur JMA langsung, pindah ke `/api/himawari`, atau simpan dua-duanya sebagai failover | Ada duplikasi sumber yang perlu keputusan sadar, bukan dibiarkan ambigu | Sedang (butuh diskusi arsitektur) |
| 6 | Integrasikan `/api/jma` atau `/api/noaa` (satu saja, lihat gap #5 di best-practice) untuk prakiraan titik | Melengkapi dashboard dari "kondisi saat ini" ke "prakiraan ke depan" — user value tinggi tapi di luar scope "current data" yang jadi fokus tim sekarang | Sedang |
| 7 | `/api/jpss` (citra VIIRS + deteksi banjir) | Fitur baru murni (bukan duplikasi), tapi butuh kejelasan use-case dulu (siapa yang butuh info banjir 3-hari ini) | Sedang–besar (butuh desain UX) |
| 8 | `/api/nasa`, `/api/sentinel` | Reanalysis/katalog non-real-time, cocok untuk fitur historis/analitik jangka panjang, bukan use-case "current data" saat ini | Besar (perlu kejelasan fitur dulu) |
| 9 | `/api/google` | Berbayar — hanya masuk akal kalau ada kebutuhan akurasi spesifik yang tidak terpenuhi Open-Meteo | Tunda sampai ada justifikasi biaya |
