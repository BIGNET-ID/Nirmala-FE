/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity or
 * temperature nationwide. So the only honest national layer is rain DENSITY
 * (concentration of raining sensors), not "mm/jam". Temperature is removed
 * (no data source anywhere).
 */
export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Kerapatan Hujan',
    icon: 'material-symbols:rainy-rounded',
    // Full meteorological precipitation spectrum (Windy/BMKG-style) — an
    // approved exception to "no rainbow" in AGENTS.md, always paired with
    // qualitative tickLabels below rather than fabricated mm/h numbers
    // (Nirmala has no spatial mm/h intensity data, only binary is_raining).
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['Rendah', 'Sedang', 'Tinggi', 'Ekstrem'],
    legendNote: 'Kerapatan sensor yang melaporkan hujan — kategori relatif, bukan pengukuran mm/jam per titik.',
  },
  mesh: {
    key: 'mesh',
    label: 'Mesh Map',
    icon: 'material-symbols:hub-outline-rounded',
    // Own sequential blue + alert-red ramp for edge distance (not the rain
    // metric's spectrum above — different meaning, "cool short, hot long
    // gap"). minLabel/maxLabel here are just a loading-state fallback;
    // ColorRampLegend overrides them with the actual km range once
    // MeshLayer computes it.
    colorRamp: 'linear-gradient(to right, #dbeafe, #93c5fd, #3b82f6, #1d4ed8, #1e3a8a, #dc2626)',
    minLabel: 'Dekat',
    maxLabel: 'Jauh',
    legendNote: 'Jaringan sensor terdekat — setiap sensor terhubung ke sensor-sensor di sekitarnya, tidak ada yang terputus. Makin merah & tebal, makin jauh jaraknya: garis ini menandai celah cakupan sensor terbesar. Arahkan kursor ke sebuah garis untuk melihat jarak persisnya.',
  },
  himawari: {
    key: 'himawari',
    label: 'Himawari',
    icon: 'material-symbols:satellite-alt-rounded',
    legendNote: 'Citra suhu puncak awan (infrared enhanced) dari JMA. Cakupan: piringan penuh Himawari, termasuk Indonesia.',
  },
};
