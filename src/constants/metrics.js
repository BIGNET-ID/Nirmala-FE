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
  },
};

export const UPCOMING_LAYERS = [
  { key: 'lightning', label: 'Petir', icon: 'material-symbols:bolt-rounded' },
  { key: 'thunderstorm', label: 'Sel Badai', icon: 'material-symbols:cyclone-rounded' },
];
