# Implementation Plan: Nirmala Heatmap Density Rework + Wiring Data Asli

**Spec:** `docs/superpowers/specs/2026-08-18-nirmala-heatmap-density-rework-design.md`
**Tanggal:** 2026-08-18

Prinsip eksekusi: setiap fase kecil, meninggalkan aplikasi tetap bisa dijalankan (`npm run dev`), dan diakhiri pengecekan konkret. Backend (`172.18.188.154:8000`) tidak terjangkau dari dev → verifikasi memakai fixture respons asli.

Dua jalur digabung: **fungsional** (heatmap + data asli, Fase 0–5) dan **UI alignment ke BIGNET DS v19** (Fase A di depan + restyle per-komponen menyatu di tiap fase + polish Fase B). Referensi otoritatif token: `~/Downloads/Design Consistent Web Pages/src/imports/bignet-web-design-system.md`. Spec §7–§8.

---

## Fase A — Design foundation (token, font, ikon, logo, dark map)

Dikerjakan lebih dulu supaya seluruh fase fungsional mewarisi styling yang benar.

1. **Token terpusat:** buat sumber token (CSS variables global + MUI theme yang memetakannya). Pindahkan hex dari `page.jsx`. Nilai dari spec §7.1.
2. **Font & ikon:** muat Roboto (400/700) + Material Symbols Rounded; set `fontFamily` theme; util mono untuk numerik. Hapus Inter.
3. **Logo & favicon:** salin aset NIRMALA asli dari reference ke `public/`; pasang di header + `app/layout` favicon.
4. **Dark map style:** tambah styled-map JSON near-black navy di `GoogleMapWrapper`.

**Cek:** app render dengan ground near-black, panel memakai token, Roboto termuat, favicon/logo asli tampil, tidak ada emoji.

---

## Fase 0 — Fondasi data asli (fixtures + wiring)

Tujuan: 4.582 sensor asli (biner) mengalir ke UI; hentikan fabrikasi angka.

1. **Salin fixture respons asli** dari `~/Downloads/API Nirmala 2/` ke `src/mocks/fixtures/`:
   `sensors.json`, `lightning.json`, `thunderstorm.json`, `manifest.json`, `timeseries.json`, `topics.json`, `health.json` (rename dari `response_:api:*.json`).
2. **`src/lib/nirmalaApi.js`:**
   - `getSensors()` memanggil `nirmalaApi.get('/api/sensors')`; pada gagal/timeout → `import` fixture `sensors.json` (bukan mock 6-sensor). Hapus `getMockSensors`.
   - Terapkan pola fallback-fixture yang sama untuk `getLightning`, `getThunderstorm`, `getManifest`, `getHealth`, dan tambah `getTimeseries(id)` → `/api/timeseries/{id}` (fallback `timeseries.json`).
   - `normalizeSensors`: map field asli → `{ id, name:id, lat:latitude, lng:longitude, status, isRaining:is_raining, blacklisted, inactive, lastUpdate:last_update }`. **Buang** `rain/temp/humidity`.
3. **`usePlatformData`:** baca `manifest.account.default_map` → expose `defaultMap {lat,lng,zoom}` untuk center peta.

**Cek:** console `usePlatformData` menunjukkan `count=4582`; tidak ada field `rain`/`temp` numerik palsu; app tetap render (heatmap lama akan kosong karena `st.rain` hilang — itu wajar, diperbaiki Fase 1).

---

## Fase 1 — Density heatmap engine (rewrite `CanvasOverlay.jsx`)

Tujuan: heatmap kerapatan hujan dari `isRaining` asli.

1. Ganti fungsi IDW dengan **kernel radial additive**:
   - Filter sensor: hanya `isRaining === true` dan berada dalam `map.getBounds()` (+margin).
   - Untuk tiap sensor hujan: `ctx.globalCompositeOperation = 'lighter'`, gambar `createRadialGradient` (pusat opasitas tinggi → tepi transparan). Radius = konversi km→piksel pada zoom saat ini (`radiusKm` konstan, mis. 25 km).
   - Hasil akumulasi (kanal alpha/intensitas) → colorize via ramp: transparan→cyan→hijau→kuning→oranye→merah. Implementasi: gambar gradient dalam grayscale/alpha lalu remap ke palet melalui `getImageData` lookup, ATAU langsung pakai gradient berwarna dengan `lighter` (pilih yang lebih cepat; mulai dari gradient berwarna additive, tuning kalau perlu).
2. Pertahankan mekanisme `OverlayView` (onAdd/draw/onRemove) yang ada; **throttle** `draw()` dengan `requestAnimationFrame` (satu frame per event pan/zoom).
3. Hapus jalur `idwWorker` dari komponen ini (tidak dipakai).

**Cek:** di viewport dengan klaster sensor hujan tampak area panas menyatu; sensor hujan tunggal = blob lembut; area kering gelap; pan/zoom halus (tak nge-freeze).

---

## Fase 2 — Marker → dot minimal (`page.jsx`)

1. Hapus komponen `SensorMarkers` lama + `getRainColor`.
2. Buat dot kecil (~6px) via `AdvancedMarker`: warna per status (aktif=cyan, hujan=biru/kuning, blacklist=abu). Tanpa cincin/animasi/label.
3. `onClick` → `setSelectedStation`. Pertahankan toggle `showMarkers`.
4. Pertimbangan performa: pada zoom rendah render dot hanya untuk viewport (atau batasi jumlah) — mulai sederhana, optimalkan bila perlu.

**Cek:** tidak ada cincin glow 40px; sensor = titik kecil; klik membuka drawer; toggle berfungsi.

---

## Fase 3 — Detail drawer + timeseries (`SensorDetailDrawer.jsx`)

1. Buat komponen chart ringan tanpa dependency: `src/components/common/Sparkline.jsx` (SVG line/bar, tema dark-glass, ikut skill `dataviz`).
2. Drawer: saat `open` & ada `station` → `getTimeseries(station.id)`; tampilkan:
   - **Rain (mm)** dari `rain.chart_data.datasets[0].data` vs `labels` (bar/area).
   - **Signal** dari `signal.chart_data` (line).
   - Metadata: koordinat, status, `isRaining`, `lastUpdate`.
3. **Buang** blok "Suhu / °C" dan "Intensitas Hujan mm/jam" statis. Tangani loading & empty/error.

**Cek:** klik sensor → drawer menampilkan grafik rain + signal asli + metadata; tidak ada field suhu.

---

## Fase 4 — Cleanup & honesty

1. **`MetricLayerSelector.jsx`:** hapus layer "Suhu". Sisakan "Hujan" (density). (Petir/Badai ditandai "segera".)
2. **`ColorRampLegend.jsx`:** label skala → "Kerapatan Hujan: rendah → tinggi" (bukan mm/jam).
3. **`TimelinePlayer.jsx`:** disable/hide (dengan komentar merujuk gap snapshot historis nasional).
4. **`page.jsx`:** hapus `activeLayer==='temp'` paths, `timeStep` fake untuk heatmap; sederhanakan state.
5. Hapus kode mati: `getMockSensors`, path `tempToRgba`, referensi `st.temp`.

**Cek:** UI tak lagi menampilkan Suhu/timeline forecast palsu; legend berbunyi kerapatan; `grep` tak menemukan `rain_rate`/`temperature` fabrikasi.

---

Di tiap fase 1–4, komponen yang disentuh langsung di-restyle ke spec glass §7.5 (jangan biarkan style lama): heatmap ramp kerapatan, dot marker (buang emoji, pulse hanya saat terpilih), drawer glass + sparkline, layer selector + stat mini-cards, legend, info-pill.

## Fase B — Polish UI & QA

1. Tambah komponen yang belum ada di repo: **stat mini-cards "STATISTIK SENSOR"** (top-left) & **info-pill kontekstual** (top-center). Header ke spec (LIVE pill, alert pill, datetime mono, avatar).
2. Micro-label UPPERCASE di semua panel; nilai numerik → mono.
3. Motion: keyframe terukur + `prefers-reduced-motion`; `cursor-pointer`, hover transisi, focus ring.
4. Disiplin: yellow ≤15% & bukan teks di latar terang; kontras AA+; panel collapse di layar kecil.

**Cek:** checklist pre-delivery ui-ux-pro-max lolos; tampilan menyamai screenshot reference (`Screenshot_2026-08-18_at_12.06.05.png`).

## Fase 5 — Verifikasi acceptance criteria

Jalankan `npm run dev`, lalu validasi tiap butir AC di spec §6 (fungsional 1–8) **dan §8 (UI 9–15)**. Catat gap yang masih terbuka (auth token, konektivitas backend, endpoint intensitas bulk, snapshot historis).

**Cek akhir:** 15 AC terpenuhi memakai fixture asli; tidak ada angka fabrikasi; tidak ada emoji; pan/zoom responsif; tampilan selaras BIGNET DS v19.

---

## Catatan risiko
- **Colorize additive:** remap alpha→palet bisa perlu tuning agar tidak "washed out". Fallback: gradient berwarna langsung.
- **Jumlah dot:** 4.582 `AdvancedMarker` bisa berat di zoom nasional → viewport-cull / batasi; QuadTree hanya bila perlu (di luar cakupan kalau tak jadi bottleneck).
- **Timeseries shape:** `signal.chart_data` strukturnya berbeda dari `rain` — parse defensif saat implementasi.
