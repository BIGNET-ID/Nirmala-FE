# Migrasi layer Himawari dari produk HRP (magenta mask) ke IR-Enhanced (tile JMA asli)

## Latar belakang

Layer "Himawari" saat ini (lihat
`2026-08-20-jma-himawari-migration-design.md`) mengambil produk JMA
**"Imagery with Heavy Rainfall Potential Areas" (HRP)** — satu JPEG statis
per timestamp (`r2w_hrp_{HHMM}.jpg`), direcolor client-side dari mask magenta
biner menjadi cyan solid transparan (`jmaHimawariRecolor.js`).

User melaporkan tampilan ini tidak sesuai dengan referensi resmi BMKG
(https://www.bmkg.go.id/cuaca/satelit/himawari-ir-enhanced,
`inderaja.bmkg.go.id/IMAGE/HIMA/H08_EH_Indonesia.png`). Investigasi
mendalam (percakapan brainstorming 2026-08-21) menemukan **root cause bukan
kesalahan pewarnaan**, melainkan **produk yang salah**:

- HRP adalah deteksi *area berpotensi hujan lebat* (convective cloud
  detection dari suhu puncak awan), dirender JMA sebagai mask biner
  magenta. Menurut *Users' Guide* JMA sendiri, rasio sukses (SR) untuk
  ambang hujan aktual ≥20mm/jam cuma **1,2%** — bukan produk pengukuran
  suhu/hujan kontinu.
- Produk yang ditampilkan BMKG di halaman referensi adalah **"Cloud-top
  Enhanced Image"** (雲頂強調画像 di UI JMA) — colormap rainbow kontinu
  berdasarkan suhu puncak awan (band IR B13), inilah "IR-Enhanced" yang
  sebenarnya dimaksud user.

Dua produk ini secara struktural berbeda (biner vs kontinu), sehingga
perbandingan visual sebelumnya memang tidak akan pernah cocok — bukan bug
di logic recolor `jmaHimawariRecolor.js`.

Spec ini menjelaskan migrasi dari HRP ke produk Cloud-top Enhanced
(selanjutnya disebut **IR-Enhanced**), sekaligus perubahan arsitektur dari
"1 gambar statis + recolor" menjadi "tile pyramid z/x/y" karena produk ini
disajikan JMA sebagai tile, bukan gambar tunggal per wilayah.

## Sumber data JMA (IR-Enhanced)

Ditemukan lewat network trace langsung ke `jma.go.jp/bosai/map.html`
(opsi menu "雲頂強調画像"):

- **Pola URL tile**:
  ```
  https://www.jma.go.jp/bosai/himawari/data/satimg/{basetime}/fd/{validtime}/SND/ETC/{z}/{x}/{y}.jpg
  ```
  - `basetime === validtime` (produk observasi, bukan forecast), format
    `YYYYMMDDHHMMSS` (UTC).
  - `fd` = full disk (bukan region SE-Asia crop seperti `r2w` HRP) —
    cakupan lebih luas, mencakup Indonesia dengan baik.
  - `SND/ETC` = kode band/produk untuk Cloud-top Enhanced.
  - `{z}/{x}/{y}` = tile scheme standar slippy-map (seperti Google
    Maps/OSM), `tileSize` 256×256 (perlu dikonfirmasi persis saat
    implementasi, asumsi awal sama dengan `OpenWeatherLayer`).
- **Interval update**: 10 menit — konsisten dengan tick logic yang sudah
  ada (`JMA_TICK_STEP_MINUTES=10`, `JMA_PUBLISH_LAG_MINUTES=20` di
  `useJmaHimawariTicks.js`). Tidak ada manifest publik untuk tile ini
  (sama seperti HRP) — tidak ada cara terprogram memastikan basetime
  tertentu sudah tersedia tanpa mencoba memuatnya.
- **Zoom range**: perlu divalidasi saat implementasi. Trace awal
  menunjukkan tile ter-load di `z=5`; full-disk imagery kemungkinan punya
  `maxZoom` lebih rendah dari tile regional beresolusi tinggi — clamp
  `minZoom`/`maxZoom` di `ImageMapType` seperti pola `OpenWeatherLayer`
  (`minZoom: 0, maxZoom: 19` di sana, nilai untuk Himawari IR-Enhanced
  harus dicek ulang, jangan diasumsikan sama).
- **Warna**: sudah di-render JMA server-side (rainbow enhanced palette
  berdasar suhu puncak awan) — **tidak ada LUT/recolor yang perlu dibuat
  di sisi klien**.
- **CORS**: dicek langsung via `fetch()` browser —
  `Access-Control-Allow-Origin: *` (terbuka penuh), disajikan via
  CloudFront/S3, `Cache-Control: max-age=86400` (aman di-cache karena
  setiap URL basetime unik/immutable). Tidak perlu proxy backend.
- **Lisensi**: konten JMA default di bawah "公共データ利用規約" (Public
  Data Terms, mirip CC-BY) kecuali dinyatakan lain — wajib atribusi,
  konsisten dengan yang sudah diantisipasi di spec HRP sebelumnya.

## Keputusan desain (dari sesi brainstorming)

1. **Hapus total produk HRP**, tidak dipertahankan sebagai layer opsional
   — satu mode Himawari, IR-Enhanced sebagai satu-satunya sumber.
2. **Fetch langsung dari browser klien ke `jma.go.jp`**, tanpa proxy
   backend Nirmala (CORS sudah terbuka, tidak ada API key yang perlu
   disembunyikan — beda dengan OpenWeather yang butuh proxy karena API
   key rahasia).
3. **Crossfade antar frame tetap dipertahankan** (bukan swap langsung),
   diimplementasikan ulang di atas tile layer, bukan dihapus.

## Arsitektur

Tidak ada perubahan pada `src/app/api/*` — migrasi ini murni client-side:

```
page.jsx
  └─ useJmaHimawariTicks(active)   [DIUBAH: hasilkan basetime, bukan URL gambar]
       └─ src/lib/jmaHimawari.js   [DIUBAH: buildJmaHimawariTileUrlTemplate, bukan buildJmaHimawariUrl]
  └─ HimawariLayer.jsx             [DIROMBAK: ImageMapType tile crossfade, bukan GroundOverlay]
  └─ src/lib/jmaHimawariRecolor.js [DIHAPUS]
```

### `src/lib/jmaHimawari.js` (diubah)

- Hapus `JMA_SEA_BOUNDS`, `buildJmaHimawariUrl` (spesifik ke gambar
  tunggal `r2w_hrp`).
- Tambah `buildJmaHimawariBasetime(date)` — `date` sudah di-`roundDownToStep`
  → string `YYYYMMDDHHMMSS` (UTC), dipakai untuk `basetime` dan
  `validtime` (selalu sama untuk produk observasi).
- Tambah `buildJmaHimawariTileUrl(basetime, z, x, y)` — merangkai pola URL
  tile lengkap di atas.
- `roundDownToStep` dipertahankan apa adanya (logic tick 10 menit tidak
  berubah).

### `src/hooks/useJmaHimawariTicks.js` (diubah)

- Setiap tick sekarang `{ date, basetime }` (bukan `{ date, url }`) —
  `basetime` dari `buildJmaHimawariBasetime(date)`. URL tile aktual
  dibangun per-tile oleh `getTileUrl` di `HimawariLayer`, bukan di sini.
- `bounds` dihapus dari return value — tile-based tidak butuh
  `LatLngBounds` eksplisit (JMA full-disk tile menentukan sendiri area
  yang valid via `getTileUrl` mengembalikan `null` untuk koordinat di luar
  cakupan, mengikuti pola `OpenWeatherLayer`).
- Retensi 144 tick / 24 jam, `JMA_PUBLISH_LAG_MINUTES=20` — tidak berubah.

### `HimawariLayer.jsx` (dirombak)

Ganti total dari `google.maps.GroundOverlay` + preload `Image()` +
`recolorToTransparentPng` menjadi pola tile mirip `OpenWeatherLayer`, tapi
dengan crossfade (yang tidak ada di `OpenWeatherLayer`):

- Terima prop `basetime` (bukan `candidateUrls`/`bounds`).
- `getTileUrl(coord, zoom)` → `buildJmaHimawariTileUrl(basetime, zoom, x, coord.y)`
  dengan wrap horizontal `x` seperti `OpenWeatherLayer`, `return null` untuk
  `coord.y` di luar rentang valid zoom tersebut.
- Crossfade: saat `basetime` berubah, buat `ImageMapType` baru
  (`incoming`), push ke `map.overlayMapTypes`, animasikan
  `incoming.setOpacity(t * opacity)` / `outgoing.setOpacity((1-t) * opacity)`
  via `requestAnimationFrame` selama `CROSSFADE_MS=400` (sama seperti
  sekarang), lalu `removeAt` outgoing dari `overlayMapTypes` setelah
  selesai. Struktur guard yang sudah ada (mencegah overlay "nyangkut" saat
  scrub cepat, debounce 200ms sebelum commit ke basetime baru) **dipertahankan
  logikanya**, hanya target API-nya ganti dari `GroundOverlay` ke
  `ImageMapType`.
- **Tidak ada lagi** proses `img.crossOrigin='anonymous'` + canvas
  recolor — `ImageMapType` merender tile langsung sebagai `<img>`
  standar Google Maps, tidak butuh akses pixel-level.
- **Prefetch-ahead untuk mode Play**: saat `isPlaying` aktif (dideteksi
  via prop baru atau exposed dari parent), jangan hanya membangun tile
  layer untuk basetime saat ini — panggil `getTileUrl` untuk tile-tile
  viewport saat ini pada basetime **berikutnya** sekali frame sekarang
  mulai ditampilkan (misal via `new Image().src = url` untuk warm
  browser cache), supaya saat frame berikutnya di-crossfade-in, tile-nya
  sudah ada di cache dan tidak menyebabkan stutter. Detail teknis
  (berapa tile yang diprefetch, mekanisme deteksi viewport tile mana yang
  relevan) diputuskan saat implementasi — cukup viewport tile yang
  sedang terlihat, tidak perlu seluruh pyramid.

### `src/lib/jmaHimawariRecolor.js`

**Dihapus total** — `recolorToTransparentPng`, `isMagentaPixel`,
`DEFAULT_RECOLOR_TARGET` tidak lagi punya konsumen setelah
`HimawariLayer.jsx` dirombak. Verifikasi dengan grep sebelum menghapus
bahwa tidak ada import lain ke file ini.

### `page.jsx`

- `himawari.ticks[i]` sekarang `{ date, basetime }` — `himawariCandidateUrls`
  (logic fallback-chain URL) diganti jadi `himawariBasetimeCandidates`
  (array basetime, bukan URL) karena strategi "coba beberapa kandidat
  mundur" tetap relevan (tidak ada manifest), tapi kini di level basetime
  bukan URL gambar tunggal.
- `HimawariLayer` menerima prop `basetime` tunggal (yang sedang aktif
  dicoba) bukan `candidateUrls` array + `bounds` — fallback-mundur-jika-gagal
  kini terjadi di level "apakah tile untuk basetime ini bisa dimuat",
  detail mekanismenya di bagian Error handling di bawah.

### Caveat/atribusi (`TimeTravelBar` via `page.jsx`)

Ganti teks caveat dari:
> "Deteksi awan berpotensi hujan lebat, bukan pengukuran curah hujan aktual · Sumber: JMA (Japan Meteorological Agency)"

menjadi:
> "Citra infrared awan (suhu puncak awan) · Sumber: JMA (Japan Meteorological Agency)"

## Error handling & ketersediaan data

Berbeda dari HRP (satu `Image.onerror` per frame), tile-based berarti
"gagal" adalah properti per-ubin, bukan per-frame. Strategi:

1. Sebelum commit ke basetime baru (live atau hasil scrub), **probe satu
   ubin representatif** (ubin di tengah viewport saat ini) dengan
   `fetch()`/`Image()` manual. Jika gagal (404/error) → basetime tersebut
   dianggap belum terbit.
2. **Live** (tidak ada scrub eksplisit): retry mundur otomatis maksimal 3
   basetime (menutupi lag publikasi ~30 menit), transparan ke user — sama
   filosofinya dengan spec HRP sebelumnya.
3. **Basetime spesifik dari scrub/dropdown user**: tidak retry otomatis,
   tampilkan "Citra tidak tersedia untuk waktu ini" bila probe gagal —
   user yang pilih waktu spesifik, jangan diam-diam ganti ke waktu lain.
4. Kegagalan tile individual **setelah** probe berhasil (misal satu ubin
   di pinggir viewport gagal saat pan/zoom) tidak dianggap kegagalan
   frame — `ImageMapType` browser secara native menampilkan tile kosong
   untuk ubin yang gagal tanpa menggagalkan seluruh layer; ini perilaku
   yang diterima (bukan kondisi yang perlu ditangani khusus).

## Testing

Manual di browser (tidak ada test otomatis untuk peta/tile layer di
proyek ini saat ini):

1. Buka Nirmala mode Himawari berdampingan dengan tab BMKG
   (`himawari-ir-enhanced`) untuk waktu yang sama (mis. jam UTC yang
   sama) → warna dan bentuk awan harus cocok secara visual (rainbow
   IR palette, bukan cyan solid).
2. Zoom in/out → pastikan tile termuat sampai `maxZoom` yang benar
   (tidak ada tile 404 masif di zoom tinggi karena clamp salah).
3. Tekan Play → animasi berjalan mulus 1 frame/detik tanpa stutter
   berarti (verifikasi prefetch-ahead bekerja); bandingkan kesan
   "gerakan awan" dengan slider animasi di jma.go.jp.
4. Scrub cepat bolak-balik di time-travel slider → tidak ada overlay
   tile "nyangkut" di opacity parsial (regresi guard crossfade).
5. Scrub ke waktu live terbaru saat frame belum terbit → verifikasi
   retry-mundur otomatis bekerja.
6. Scrub ke basetime spesifik yang sengaja tidak ada → pesan "Citra
   tidak tersedia" muncul, tidak diam-diam fallback.
7. Pindah keluar dari mode Himawari saat Play aktif → pastikan tidak ada
   `overlayMapTypes` yang nyangkut di map (regresi unmount).
8. Cek teks caveat/atribusi baru tampil di UI.
9. Grep codebase memastikan tidak ada sisa import
   `jmaHimawariRecolor.js`, `JMA_SEA_BOUNDS`, atau `buildJmaHimawariUrl`
   (nama lama).

## Yang TIDAK berubah

- Mekanisme Play/pause di `page.jsx` (`setInterval` 1 detik/tick,
  melangkah maju di array `ticks`) — migrasi ini tidak menyentuh logic
  ini, hanya apa yang di-render per tick.
- `TimeTravelBar.jsx`, `timeTravelRange.js` — tidak disentuh.
- Struktur retensi 144 tick / rolling 24 jam, `JMA_TICK_STEP_MINUTES=10`,
  `JMA_PUBLISH_LAG_MINUTES=20` — nilai-nilai ini tetap sama, cuma
  konsumsinya (basetime vs URL gambar) yang berubah.
- Endpoint backend bignet lain (`/api/sensors`, `/api/lightning`,
  `/api/owm`, dst) — tidak terpengaruh.
- Pola `OpenWeatherLayer.jsx` itu sendiri — dipakai sebagai referensi,
  tidak diubah.
