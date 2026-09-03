// Sensor staleness thresholds, measured against lastUpdate/scrapedAt.
// Unavailable = unreachable for 2h; Inactive = no data at all for 24h
// (a superset of Unavailable — see statusBucket() in src/lib/sensorColor.js).
export const UNAVAILABLE_AFTER_MS = 2 * 60 * 60 * 1000;
export const INACTIVE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Live sensors report only BINARY is_raining — there is no numeric intensity
 * from them. Rain Density's actual intensity now comes from OpenWeather's
 * grid-sampled mm/h data instead (see src/app/api/wind/route.js's `rain`
 * field and src/components/map/CanvasOverlay.jsx's drawRainField) — sensors
 * still drive the separate "coverage" (active network) base layer only.
 * Temperature is removed (no data source anywhere).
 */

// Standard meteorological hourly-intensity classes (WMO-style): light,
// moderate, heavy, violent — mm of rain per hour. Shared by the legend tick
// labels below and by src/lib/rainRamp.js's mmToT(), so the class
// boundaries always land exactly on the legend's tick marks (ColorRampLegend
// draws tickLabels at even 0/33/66/100% positions regardless of the
// underlying values).
export const RAIN_MM_BREAKPOINTS = [0, 2.5, 7.6, 50];

export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Rain Density',
    icon: 'material-symbols:rainy-rounded',
    // Full meteorological precipitation spectrum (Windy/BMKG-style) — an
    // approved exception to "no rainbow" in AGENTS.md, always paired with
    // a numeric tick legend below.
    colorRamp: 'linear-gradient(to right, #3b82f6, #22d3ee, #22c55e, #eab308, #f97316, #dc2626)',
    tickLabels: ['0', '2.5', '7.6', '50+ mm/h'],
    legendNote: 'Rainfall intensity from OpenWeather, interpolated across a coarse grid — not a per-sensor reading.',
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
  himawari: {
    key: 'himawari',
    label: 'Himawari',
    icon: 'material-symbols:satellite-alt-rounded',
    legendNote: "Cloud-top temperature imagery (infrared enhanced) from JMA. Coverage: Himawari's full disk, including Indonesia.",
  },
};
