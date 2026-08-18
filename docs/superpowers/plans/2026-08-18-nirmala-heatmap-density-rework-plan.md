# Implementation Plan: Nirmala Heatmap Density Rework + Wiring Data Asli

**Spec:** `docs/superpowers/specs/2026-08-18-nirmala-heatmap-density-rework-design.md`
**Tanggal:** 2026-08-18

Prinsip eksekusi: setiap fase kecil, meninggalkan aplikasi tetap bisa dijalankan (`npm run dev`), dan diakhiri pengecekan konkret. Backend (`172.18.188.154:8000`) tidak terjangkau dari dev → verifikasi memakai fixture respons asli.

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

## Fase 5 — Verifikasi acceptance criteria

Jalankan `npm run dev`, lalu validasi tiap butir AC di spec §6 (1–8). Catat gap yang masih terbuka (auth token, konektivitas backend, endpoint intensitas bulk, snapshot historis) di README/section catatan.

**Cek akhir:** 8 AC terpenuhi memakai fixture asli; tidak ada angka fabrikasi; pan/zoom responsif.

---

## Catatan risiko
- **Colorize additive:** remap alpha→palet bisa perlu tuning agar tidak "washed out". Fallback: gradient berwarna langsung.
- **Jumlah dot:** 4.582 `AdvancedMarker` bisa berat di zoom nasional → viewport-cull / batasi; QuadTree hanya bila perlu (di luar cakupan kalau tak jadi bottleneck).
- **Timeseries shape:** `signal.chart_data` strukturnya berbeda dari `rain` — parse defensif saat implementasi.
