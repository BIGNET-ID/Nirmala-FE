/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity or
 * temperature nationwide. So the only honest national layer is rain DENSITY
 * (concentration of raining sensors), not "mm/jam". Temperature is removed
 * (no data source anywhere).
 */

export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Rain Density',
    icon: 'material-symbols:rainy-rounded',
    // Full meteorological precipitation spectrum (Windy/BMKG-style) — an
    // approved exception to "no rainbow" in AGENTS.md, always paired with
    // qualitative tickLabels below rather than fabricated mm/h numbers
    // (Nirmala has no spatial mm/h intensity data, only binary is_raining).
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['Low', 'Moderate', 'High', 'Extreme'],
    legendNote: 'Density of sensors reporting rain — a relative category, not a per-point mm/hour measurement.',
    // Shown instead of the gradient above once the map switches from the
    // KDE blob to AdminRegionLayer (see ColorRampLegendContent's
    // `regionView` branch) — that layer paints kecamatan polygons by
    // categorical sensor status, not this ramp, so the legend must switch
    // with it rather than describe a gradient that isn't on screen.
    regionLegendNote: "Kecamatan colored by its nearest sensor's status (within 9km) — kecamatan with no sensor that close simply aren't shown, rather than guessing.",
  },
  node: {
    key: 'node',
    label: 'Sensor Spot',
    icon: 'material-symbols:sensors-rounded',
    // No colorRamp/tickLabels — this mode has no gradient legend, just
    // enlarged sensor dots as the primary content (see SensorDotLayer's
    // `focus` prop). ColorRampLegendContent already falls back to showing
    // just the title + legendNote when colorRamp is absent.
    legendNote: 'Click a sensor point to see its rainfall chart.',
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
    minLabel: 'Near',
    maxLabel: 'Far',
    legendNote: 'Nearest-neighbor sensor network — every sensor connects to the ones around it, none are isolated. The redder and thicker a line, the greater the distance: these lines mark the largest gaps in sensor coverage. Hover over a line to see its exact distance.',
  },
  bmkg: {
    key: 'bmkg',
    label: 'BMKG',
    icon: 'material-symbols:cloud-outline-rounded',
    // Same rainbow spectrum as Rain Density's RAIN_RAMP — approved
    // exception to "no rainbow" in AGENTS.md, paired with a real numeric
    // legend below (unlike Rain Density's qualitative-only labels) because
    // precip_mm is a real per-kabupaten BMKG measurement, not a fabricated
    // number. Breakpoints are a standard hourly meteorological convention,
    // not an official BMKG-published threshold — see src/lib/bmkgWeather.js.
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    // Angka pakai koma desimal (konvensi Indonesia) — bukan titik. Label
    // terakhir sengaja pendek ("30+", bukan "30+ mm/jam") supaya tidak
    // bertabrakan dengan label "15" di sebelahnya pada lebar legend yang
    // sempit; satuan mm/jam disebutkan di legendNote di bawah.
    tickLabels: ['0', '2,5', '7,5', '15', '30+'],
    legendNote: 'Official BMKG precipitation per kabupaten, mm/hour (real per-point data, not sensor interpolation).',
  },
  himawari: {
    key: 'himawari',
    label: 'Himawari',
    icon: 'material-symbols:satellite-alt-rounded',
    legendNote: "Cloud-top temperature imagery (infrared enhanced) from JMA. Coverage: Himawari's full disk, including Indonesia.",
  },
};
