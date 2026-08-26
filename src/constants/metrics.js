/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity or
 * temperature nationwide. So the only honest national layer is rain DENSITY
 * (concentration of raining sensors), not "mm/jam". Temperature is removed
 * (no data source anywhere). Lightning & thunderstorm layers are declared as
 * upcoming (data exists but not yet wired to the map).
 */
export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Kerapatan Hujan',
    icon: 'material-symbols:rainy-rounded',
    // Matches the heatmap density ramp (cool -> hot).
    colorRamp: 'linear-gradient(to right, #60a5fa, #34d399, #eab308, #fb923c, #ef4444, #c084fc)',
    minLabel: 'Rendah',
    maxLabel: 'Tinggi',
    legendNote: 'Konsentrasi sensor yang melaporkan hujan.',
  },
  mesh: {
    key: 'mesh',
    label: 'Mesh Map',
    icon: 'material-symbols:hub-outline-rounded',
    // Same ramp as 'rain' — reused for edge distance instead of rain
    // intensity, so "cool short, hot long" reads consistently. minLabel/
    // maxLabel here are just a loading-state fallback; ColorRampLegend
    // overrides them with the actual km range once MeshLayer computes it.
    colorRamp: 'linear-gradient(to right, #60a5fa, #34d399, #eab308, #fb923c, #ef4444, #c084fc)',
    minLabel: 'Dekat',
    maxLabel: 'Jauh',
    legendNote: 'Minimum Spanning Tree — setiap sensor terhubung minimal satu garis. Makin merah & tebal, makin jauh jaraknya: garis ini menandai celah cakupan sensor terbesar.',
  },
  node: {
    key: 'node',
    label: 'Node Sensor',
    icon: 'material-symbols:sensors-rounded',
    legendNote: 'Klik titik sensor untuk melihat grafik curah hujan.',
  },
  himawari: {
    key: 'himawari',
    label: 'Himawari',
    icon: 'material-symbols:satellite-alt-rounded',
    legendNote: 'Citra suhu puncak awan (infrared enhanced) dari JMA. Cakupan: piringan penuh Himawari, termasuk Indonesia.',
  },
};

export const UPCOMING_LAYERS = [
  { key: 'lightning', label: 'Petir', icon: 'material-symbols:bolt-rounded' },
  { key: 'thunderstorm', label: 'Sel Badai', icon: 'material-symbols:cyclone-rounded' },
];
