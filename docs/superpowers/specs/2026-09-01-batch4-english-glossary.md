# Batch 4 — English Translation Glossary

Reference glossary for translating all Indonesian UI microcopy in the
Nirmala dashboard to English. Once approved, this is the single source of
truth applied verbatim across the 15 files listed in the Batch 4 plan —
the same Indonesian string must map to the same English string everywhere
it appears.

**Standing rules (already agreed, do not re-litigate per row):**
- Province names (`src/constants/provinces.js`) stay in Indonesian — not in scope.
- `toLocaleString('id-ID', ...)` / `toLocaleDateString('id-ID', ...)` calls keep the `id-ID` locale — numbers and dates keep their Indonesian formatting (`4.584`, not `4,584`).
- `WIB` stays as-is (technical timezone abbreviation, not translated).
- "Kerapatan Hujan" → **"Rain Density"** everywhere (explicit decision).

---

## DashboardHeader.jsx

| Indonesian | English | Note |
|---|---|---|
| Peta Radar | Radar Map | nav label |
| Pengaturan | Settings | nav label |
| Segera | Coming soon | disabled-nav badge |
| Status & pengaturan | Status & settings | tooltip (compact icon) |
| Notifikasi | Notifications | tooltip + aria-label |
| Menu akun | Account menu | aria-label |
| Aktifkan mode terang | Switch to light mode | aria-label |
| Aktifkan mode gelap | Switch to dark mode | aria-label |
| Mode Terang | Light mode | tooltip + menu item |
| Mode Gelap | Dark mode | tooltip + menu item |
| Keluar | Log out | menu item |
| Operator | Operator | fallback name, already neutral |
| Kafka pipeline tidak terhubung | Kafka pipeline disconnected | tooltip |
| Koneksi stream sensor: ${streamStatus} | Sensor stream connection: ${streamStatus} | tooltip |
| Tidak ada info saat ini. | No info right now. | notif dropdown empty state |
| Memuat data sensor… | Loading sensor data… | notif dropdown loading |
| Kerapatan Hujan · {raining} dari {total} sensor melapor hujan | Rain Density · {raining} of {total} sensors reporting rain | notif dropdown |
| · diperbarui {time} WIB | · updated {time} WIB | notif dropdown; "WIB" unchanged |

## SegmentTogglePanel.jsx

| Indonesian | English | Note |
|---|---|---|
| Tidak ada data untuk ditampilkan saat ini. | No data to display right now. | status dot tooltip |
| Gagal memuat data. | Failed to load data. | status dot tooltip |
| Menunggu integrasi Backend | Awaiting backend integration | disabled vendor card tooltip |
| Segera | Coming soon | disabled vendor card badge |
| Nonaktif | Off | OWM layer option |
| Hujan | Rain | OWM layer option |
| Awan | Clouds | OWM layer option |
| Lapisan curah hujan dari penyedia data cuaca global OpenWeather. | Rainfall layer from the OpenWeather global weather data provider. | info tooltip |
| Opacity diturunkan otomatis karena Himawari aktif | Opacity automatically reduced while Himawari is active | caption |
| Data diperbarui otomatis setiap ±10 menit. | Data refreshes automatically every ~10 minutes. | caption |
| Data cuaca oleh OpenWeather | Weather data by OpenWeather | attribution link |
| Angin (partikel) | Wind (particles) | toggle label |
| Cakupan Sensor | Sensor Coverage | toggle label |
| Titik Sensor | Sensor Points | toggle label |
| Sembunyikan panel | Hide panel | collapse tooltip |
| Matikan semua filter | Turn off all filters | master toggle tooltip |
| Aktifkan semua filter | Turn on all filters | master toggle tooltip |

## SensorDetailDrawer.jsx

| Indonesian | English | Note |
|---|---|---|
| Blacklist | Blacklist | already English |
| Inaktif | Inactive | status chip |
| Aktif | Active | status chip |
| Koordinat | Coordinates | field label |
| Sedang Hujan | Currently Raining | field label |
| Ya / Tidak | Yes / No | field value |
| Update Terakhir | Last Update | field label |
| Stasiun Sensor | Sensor Station | eyebrow label |
| Tutup | Close | aria-label |
| Data 1 jam terakhir | Last hour of data | section title |
| Curah Hujan · mm (5 min) | Rainfall · mm (5 min) | chart title — see note below |
| Sinyal | Signal | chart title |
| Timeseries tidak tersedia. | Timeseries unavailable. | empty state |
| Curah hujan satu jam terakhir, puncak {max} mm | Rainfall over the last hour, peak {max} mm | sparkline aria-label |
| Kualitas sinyal sensor, satu jam terakhir | Sensor signal quality, last hour | sparkline aria-label |

**Note on "Curah Hujan" here vs. "Kerapatan Hujan":** this component shows a
*per-sensor numeric mm chart* (an actual measured value), a different
concept from the *national density metric* on the map. Translated as
**"Rainfall"**, not "Rain Density", to keep the two concepts distinct in
English the way they already are in the current Indonesian wording.

## SparklineOverviewDialog.jsx

| Indonesian | English |
|---|---|
| Tutup | Close |
| Data 1 jam terakhir | Last hour of data |
| Curah Hujan · mm (5 min) | Rainfall · mm (5 min) |
| Sinyal | Signal |

## SeriesStatsRow.jsx

| Indonesian | English |
|---|---|
| Rata-rata | Average |
| Maks | Max |

(Min is already English, no change needed.)

## SensorStatsCard.jsx

| Indonesian | English | Note |
|---|---|---|
| Statistik Sensor | Sensor Statistics | card title |
| Total | Total | already English |
| Aktif | Active | row label |
| Hujan | Raining | row label — verb form since it's a live count of currently-raining sensors |
| Blacklist | Blacklist | already English |
| Tampilkan sensor {label} di peta | Show {label} sensors on the map | tooltip |
| Sembunyikan sensor {label} dari peta | Hide {label} sensors from the map | tooltip |
| Sembunyikan statistik | Hide statistics | collapse tooltip |
| Tampilkan statistik | Show statistics | collapse tooltip |

## ColorRampLegend.jsx

| Indonesian | English |
|---|---|
| Jaringan sensor aktif (tidak hujan) | Active sensor network (not raining) |
| Sembunyikan legenda | Hide legend |
| Tampilkan legenda | Show legend |

## TimeTravelBar.jsx

| Indonesian | English |
|---|---|
| Pause | Pause (already English) |
| Putar | Play |
| Kembali ke Live | Back to Live |
| Lompat ke waktu... | Jump to a time... |

## TimelineComingSoon.jsx

| Indonesian | English |
|---|---|
| Fase 2 — Playback 24 Jam | Phase 2 — 24-Hour Playback |
| Tab Timeline sedang dalam roadmap pengembangan. Berikut yang akan dibangun: | The Timeline tab is on the development roadmap. Here's what's coming: |
| 24-Hour Interactive Slider dengan Play/Pause dan speed multiplier (1x, 2x, 4x) | 24-hour interactive slider with play/pause and speed multiplier (1x, 2x, 4x) |
| Himawari 10-Minute Tick Sync — 144 frame per 24 jam (24 jam × 6 tick/jam) | Himawari 10-minute tick sync — 144 frames per 24 hours (24 hours × 6 ticks/hour) |
| Temporal Layer Alignment — radar darat & sensor mengikuti posisi scrubber waktu | Temporal layer alignment — ground radar & sensors follow the time scrubber position |

## ProvinceFilterSelect.jsx

| Indonesian | English |
|---|---|
| Semua Provinsi | All Provinces |
| Reset ke tampilan nasional | Reset to national view |
| Belum ada data sensor terdeteksi di wilayah ini | No sensor data detected in this region yet |
| {matched.total} sensor di {selected.name} | {matched.total} sensors in {selected.name} |
| melapor hujan | reporting rain |

## MobileControlSheet.jsx

| Indonesian | English |
|---|---|
| Statistik | Stats |
| Legenda | Legend |
| Buka kontrol peta | Open map controls |

## MapControls.jsx

| Indonesian | English |
|---|---|
| Perbesar | Zoom in |
| Perkecil | Zoom out |
| Tampilan Nasional | National view |
| Reset tampilan | Reset view |

## metrics.js

| Indonesian | English | Note |
|---|---|---|
| Kerapatan Hujan (label) | Rain Density | national map metric |
| Rendah, Sedang, Tinggi, Ekstrem (tickLabels) | Low, Moderate, High, Extreme | rain density legend scale |
| Kerapatan sensor yang melaporkan hujan — kategori relatif, bukan pengukuran mm/jam per titik. | Density of sensors reporting rain — a relative category, not a per-point mm/hour measurement. | rain legendNote |
| Dekat (mesh minLabel) | Near | |
| Jauh (mesh maxLabel) | Far | |
| Jaringan sensor terdekat — setiap sensor terhubung ke sensor-sensor di sekitarnya, tidak ada yang terputus. Makin merah & tebal, makin jauh jaraknya: garis ini menandai celah cakupan sensor terbesar. Arahkan kursor ke sebuah garis untuk melihat jarak persisnya. | Nearest-neighbor sensor network — every sensor connects to the ones around it, none are isolated. The redder and thicker a line, the greater the distance: these lines mark the largest gaps in sensor coverage. Hover over a line to see its exact distance. | mesh legendNote |
| Citra suhu puncak awan (infrared enhanced) dari JMA. Cakupan: piringan penuh Himawari, termasuk Indonesia. | Cloud-top temperature imagery (infrared enhanced) from JMA. Coverage: Himawari's full disk, including Indonesia. | himawari legendNote |

## page.jsx

| Indonesian | English |
|---|---|
| Citra tidak tersedia untuk waktu ini | Imagery unavailable for this time |
| Perbesar/perkecil peta ke level zoom 3–5 untuk melihat citra satelit | Zoom the map to level 3–5 to see satellite imagery |

## login/page.jsx

| Indonesian | English | Note |
|---|---|---|
| Prakiraan & Pemantauan Cuaca Real-time | Real-time Weather Forecasting & Monitoring | eyebrow tagline |
| Masuk | Log in | heading + button (both instances) |
| Tampilkan password | Show password | aria-label |
| Login gagal. Periksa email & password. | Login failed. Check your email & password. | error message |
