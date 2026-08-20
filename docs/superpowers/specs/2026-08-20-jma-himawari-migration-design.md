# Migrasi layer Himawari dari bignet ke citra JMA langsung

## Latar belakang

Layer "Himawari" saat ini (`useHimawariGrid.js` + `HimawariLayer.jsx`) mengambil
citra dari backend bignet (`/api/grid`, proxy ke
`c4c-nirmala.api.bignet.host`). Investigasi sebelumnya (lihat percakapan
brainstorming 2026-08-20) menemukan bahwa sumber ini:

- Hanya mencakup **satu region: Filipina** (`bounds` tetap
  `{south:4.6, west:116.9, north:21.3, east:126.6}`), tidak mencakup
  Indonesia sama sekali.
- Retensi frame cuma **rolling window ~6 jam** (36 frame × 10 menit).
- Endpoint `/api/grid` sendiri secara eksplisit mendokumentasikan
  keterbatasan ini: *"sumber hanya menyediakan region Philippines (Indonesia
  tak didukung)"*.

Ini adalah keterbatasan sumber data upstream bignet, bukan bug di kode kita
— sudah dikonfirmasi lewat pengecekan API langsung sebelumnya.

Japan Meteorological Agency (JMA) mempublikasikan produk **"Imagery with
Heavy Rainfall Potential Areas"** yang mencakup seluruh Asia Tenggara
termasuk Indonesia, dengan retensi lebih panjang. Spec ini menjelaskan
migrasi penuh ke sumber tersebut.

## Sumber data JMA

- **Halaman referensi**: https://www.data.jma.go.jp/mscweb/data/himawari/sat_hrp.php
- **Pola URL gambar**: `https://www.data.jma.go.jp/mscweb/data/himawari/img/{region}/{region}_{product}_{HHMM}.jpg`
  - `region = r2w` (Southeast Asia, Large/native resolution, 1501×901 JPEG,
    ~500KB). Varian `r2s` (751×451) adalah downsample setengah resolusi —
    tidak dipakai.
  - `product = hrp` (Heavy Rainfall Potential areas).
  - `HHMM` = jam:menit **UTC**, kelipatan 10 menit (mis. `0950`, `1000`).
- **Cakupan geografis** (dari *Users' Guide to Imagery with Heavy Rainfall
  Potential Areas*, JMA, Ver.4 2015): **30°N–15°S, 90°E–165°E**. Ini
  proyeksi equirectangular murni (rasio piksel 1501:901 ≈ rasio derajat
  75:45 ≈ 1.667, cocok persis) — bisa langsung dipakai sebagai `bounds`
  `google.maps.GroundOverlay` tanpa reprojection. Mencakup seluruh
  Indonesia.
- **Resolusi spasial**: 0.05° per piksel (native, sesuai user guide) —
  cocok dengan varian `r2w`.
- **Interval update**: 10 menit. Verifikasi manual: dropdown waktu di
  halaman JMA menyimpan riwayat hingga ~24 jam (144 frame) ke belakang.
  Tidak ada endpoint manifest/index seperti bignet — tidak ada cara
  terprogram untuk tahu persis frame mana yang benar-benar ada tanpa
  mencoba memuatnya.
- **CORS/akses**: dicek langsung — tidak ada header
  `Access-Control-Allow-Origin` di respons, TAPI **tidak masalah** karena
  `GroundOverlay` merender via elemen `<img>` (bukan `fetch`/canvas), jadi
  tidak butuh CORS. Dicek juga tidak ada pemblokiran berdasar
  `Referer`/`Origin`, dan tidak ada `robots.txt` yang melarang. **Kesimpulan:
  tidak perlu proxy backend baru** — client bisa langsung memuat URL JMA.
- **Lisensi**: dicek *Terms of Use* resmi JMA
  (`data.jma.go.jp/mscweb/en/general/note.html`) — penggunaan komersial
  diizinkan, syaratnya **wajib mencantumkan atribusi** sumber ("Source:
  Meteorological Satellite Center of JMA website" atau minimal "JMA").
- **Sifat data — penting untuk UI**: produk ini mendeteksi *awan
  konvektif berpotensi hujan lebat* dari suhu puncak awan (infrared),
  **bukan pengukuran curah hujan aktual**. Dari hasil validasi resmi JMA
  (Tabel 1 user guide, data Jan–Okt 2011, wilayah SE Asia): POD (tingkat
  deteksi benar) 0.812, tapi SR (rasio area magenta yang benar-benar
  ≥20mm/h) cuma **0.012** — sebagian besar area magenta TIDAK mengalami
  hujan seberat itu (SR untuk ambang hujan ringan >0.1mm/h ~80%). Ini
  harus dikomunikasikan ke user via caveat text, supaya tidak disalahtafsir
  sebagai peta curah hujan presisi.

## Arsitektur

Tidak ada perubahan pada `src/app/api/*` — migrasi ini murni client-side:

```
page.jsx
  └─ useJmaHimawariTicks(active)   [BARU, ganti useHimawariGrid]
       └─ src/lib/jmaHimawari.js   [BARU: pure date/URL helpers]
  └─ HimawariLayer.jsx             [DIUBAH: bounds konstan, retry on error]
```

### `src/lib/jmaHimawari.js` (baru)

- `JMA_SEA_BOUNDS = { north: 30, south: -15, west: 90, east: 165 }` — konstanta.
- `roundDownToStep(date, stepMinutes = 10)` — bulatkan waktu UTC ke kelipatan 10 menit terdekat ke bawah.
- `buildJmaHimawariUrl(date)` — `date` sudah rounded → string URL `r2w_hrp_{HHMM}.jpg` (HHMM dari komponen UTC `date`).

### `src/hooks/useJmaHimawariTicks.js` (baru, ganti `useHimawariGrid.js`)

- Saat `active` (mode Himawari aktif): generate array 144 tick mundur dari
  `roundDownToStep(new Date())`, step 10 menit, masing-masing
  `{ date, url: buildJmaHimawariUrl(date) }`. Murni kalkulasi tanggal, tidak
  ada network call untuk membangun daftar — beda dari `useHimawariGrid` yang
  polling JSON manifest bignet tiap 5 menit.
- Kembalikan `{ ticks, bounds: JMA_SEA_BOUNDS, loading: false }` — `loading`
  selalu `false` karena tidak ada fetch awal yang ditunggu (beda dari
  bignet yang perlu nunggu response manifest pertama).

### `HimawariLayer.jsx` (diubah)

- `bounds` yang diterima sekarang selalu `JMA_SEA_BOUNDS` (konstan), bukan
  hasil parsing API.
- Tambah retry saat frame gagal dimuat: pasang listener error pada image
  overlay (`google.maps.GroundOverlay` internal `<img>`, diakses via
  `overlay.getPane()` atau dengan preload `new Image()` manual sebelum
  membuat GroundOverlay — pilih preload manual karena lebih portable dan
  tidak bergantung struktur internal GroundOverlay yang tidak
  didokumentasikan publik). Kalau gagal, coba tick 10 menit sebelumnya,
  maksimal 3 kali mundur (menutupi lag proses ~30 menit). Kalau tetap gagal
  setelah 3 percobaan, tampilkan pesan "Citra tidak tersedia" alih-alih
  overlay kosong/blank.

### `page.jsx`

- Ganti `import { useHimawariGrid } from '@/hooks/useHimawariGrid'` menjadi
  `useJmaHimawariTicks`. Hapus file `useHimawariGrid.js` (sudah tidak
  dipakai di mana pun setelah migrasi — dicek dengan grep sebelum dihapus).
- `himawari.bounds` sekarang selalu konstanta `JMA_SEA_BOUNDS`, dipakai
  sebagai prop `bounds` ke `<HimawariLayer>` (tidak berubah signature).

### Caveat/atribusi (`TimeTravelBar` via `page.jsx`)

Ganti teks caveat mode Himawari dari:
> "Waktu di atas adalah jam citra satelit tersedia, bukan waktu sekarang · Cakupan: Filipina saja"

menjadi (memenuhi syarat atribusi wajib + jelaskan sifat data):
> "Deteksi awan berpotensi hujan lebat, bukan pengukuran curah hujan aktual · Sumber: JMA (Japan Meteorological Agency)"

## Error handling

- Frame terbaru ("live") belum diproses JMA saat diakses → retry mundur
  otomatis (lihat `HimawariLayer.jsx` di atas), transparan ke user (index
  timeline tetap terlihat "live"/paling kanan meski secara internal
  menunjuk ke frame yang sedikit lebih lama).
- Frame spesifik yang dipilih user dari dropdown/scrub gagal dimuat (mis.
  gap di riwayat JMA) → tampilkan pesan "Citra tidak tersedia untuk waktu
  ini" di area overlay, tidak retry otomatis (user yang pilih waktu
  spesifik, biarkan mereka pilih waktu lain).

## Testing

Manual di browser (tidak ada test otomatis untuk peta/GroundOverlay di
proyek ini saat ini):

1. Masuk mode Himawari → overlay muncul mencakup Indonesia (bukan cuma
   Filipina) — verifikasi visual, cocokkan batas dengan garis pantai.
2. Time-travel dropdown/slider menampilkan 144 opsi (24 jam), bukan 36.
3. Scrub ke waktu yang gambar-nya kemungkinan belum ada (mis. 5 menit yang
   lalu) → verifikasi retry-mundur bekerja, tidak overlay kosong.
4. Scrub ke waktu jauh di masa lalu di luar retensi (>24 jam) → verifikasi
   pesan "Citra tidak tersedia" muncul dengan jelas.
5. Cek teks caveat/atribusi JMA tampil di UI.
6. Cek tidak ada sisa import/referensi ke `useHimawariGrid.js` atau
   endpoint bignet `/api/grid` di kode (grep).

## Yang TIDAK berubah

- Struktur props `HimawariLayer` (`active`, `bounds`, `frameUrl`) — tetap
  sama, hanya nilai `bounds` yang jadi konstan.
- `TimeTravelBar.jsx`, `timeTravelRange.js` (`buildRainTicks` dkk) — tidak
  disentuh, tetap dipakai apa adanya untuk `ticks` yang dihasilkan
  `useJmaHimawariTicks`.
- Endpoint backend bignet lain (`/api/sensors`, `/api/lightning`, dst) —
  tidak terpengaruh, migrasi ini spesifik ke layer Himawari saja.
