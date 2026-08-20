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
    // Rain-front gradient: dry (neutral) -> raining (blue), same pair used per-edge.
    colorRamp: 'linear-gradient(to right, #4b5563, #34d399, #60a5fa)',
    minLabel: 'Kering',
    maxLabel: 'Hujan',
    legendNote: 'Garis menghubungkan tiap sensor ke tetangga terdekatnya; warna gradien mengikuti status hujan kedua ujung.',
  },
  node: {
    key: 'node',
    label: 'Node Sensor',
    icon: 'material-symbols:sensors-rounded',
    legendNote: 'Klik titik sensor untuk melihat grafik curah hujan.',
  },
};

export const UPCOMING_LAYERS = [
  { key: 'lightning', label: 'Petir', icon: 'material-symbols:bolt-rounded' },
  { key: 'thunderstorm', label: 'Sel Badai', icon: 'material-symbols:cyclone-rounded' },
];
