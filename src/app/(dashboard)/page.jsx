'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { motion } from 'motion/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import SensorDotLayer from '@/components/map/SensorDotLayer';
import MeshLayer from '@/components/map/MeshLayer';
import OpenWeatherLayer from '@/components/map/OpenWeatherLayer';
import WindParticleLayer from '@/components/map/WindParticleLayer';
import HimawariLayer from '@/components/map/HimawariLayer';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { SegmentPanel } from '@/components/dashboard/SegmentTogglePanel';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import SensorStatsCard from '@/components/dashboard/SensorStatsCard';
import MobileControlSheet from '@/components/dashboard/MobileControlSheet';
import MapControls from '@/components/map/MapControls';
import MapExtrasCluster from '@/components/map/MapExtrasCluster';
import ThemeToggleControl from '@/components/map/ThemeToggleControl';
import TimelineComingSoon from '@/components/dashboard/TimelineComingSoon';
import { usePlatformData } from '@/hooks/usePlatformData';
import { useSensorStream } from '@/hooks/useSensorStream';
import { useWindField } from '@/hooks/useWindField';
import { useJmaHimawariTicks } from '@/hooks/useJmaHimawariTicks';
import { useAuth } from '@/hooks/useAuth';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useNow } from '@/hooks/useNow';
import { useThemeMode } from '@/context/ThemeModeContext';
import { METRICS } from '@/constants/metrics';
import { MAP_CENTER, MAP_ZOOM_DEFAULT, MAP_MIN_ZOOM, MAP_MAX_ZOOM } from '@/constants/mapConfig';
import { PROVINCES } from '@/constants/provinces';
import { filterStationsInBounds, summarizeStations } from '@/lib/provinceFilter';
import { statusBucket } from '@/lib/sensorColor';
import { averageSpeed } from '@/lib/windStats';

// OpenWeather's precipitation tiles are pale, semi-transparent PNGs — the
// same fixed alpha reads much dimmer against the near-black dark basemap
// than the light one, so opacity is tuned per theme (and lowered further
// while Himawari is active, so the two cloud/weather layers don't visually
// fight — see the matching note in SegmentTogglePanel).
const OWM_OPACITY = {
  light: { normal: 0.9, himawari: 0.6 },
  dark: { normal: 0.85, himawari: 0.55 },
};

export default function NirmalaDashboard() {
  const { isCompact } = useResponsiveLayout();
  const { mode } = useThemeMode();
  const { sensors: apiSensors, health, loading, error } = usePlatformData();
  const { permissions, defaultMap, defaultLayer } = useAuth();

  // Initial REST snapshot seeds the SSE hook; live updates flow in via /api/stream/*.
  const { stations: SENSOR_STATIONS, status: sensorStreamStatus } = useSensorStream(apiSensors);
  const [activeLayer, setActiveLayer] = useState('rain');
  // The last-selected ground mode (rain/mesh) — restored when the
  // Himawari switch turns off, so leaving Himawari mode never dead-ends on
  // "no mode selected"; it goes back to wherever the user actually was.
  const [groundLayer, setGroundLayer] = useState('rain');
  const handleLayerChange = (layer) => {
    setActiveLayer(layer);
    if (layer !== 'himawari') setGroundLayer(layer);
  };
  const handleHimawariToggle = (checked) => {
    setActiveLayer(checked ? 'himawari' : groundLayer);
  };
  // Coverage-first default: individual sensor dots are opt-in, so a
  // first-time non-technical viewer sees one clear aggregate picture on
  // login rather than dots + coverage competing for attention.
  const [showMarkers, setShowMarkers] = useState(false);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showWind, setShowWind] = useState(false);
  // Visual-only override on top of the real-data-driven particle speed —
  // see WindParticleLayer's speedMultiplier prop. 1 = today's exact
  // behavior (VELOCITY_SCALE unscaled).
  const [windSpeedMultiplier, setWindSpeedMultiplier] = useState(1);
  const [owmLayer, setOwmLayer] = useState(null); // OpenWeather tile layer id or null
  // Which sensor-status rows (from Statistik Sensor) are hidden from the map
  // dots. Stats counts themselves stay unfiltered — this only trims what
  // SensorDotLayer draws. Buckets match statusBucket() precedence.
  const [hiddenStatuses, setHiddenStatuses] = useState(() => new Set());
  const toggleStatusVisibility = (bucket) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
      return next;
    });
  };
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);
  const mapContainerRef = useRef(null);
  // Master show/hide for MapControls, the merged Space/Ground panel,
  // SensorStatsCard, and ColorRampLegend — toggled from MapExtrasCluster,
  // which itself always stays visible so there's always a way back.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'timeline' — PRD §4.1 Dual-Tab
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(null);
  // Reported by MeshLayer once it computes the Mesh Map MST, so
  // ColorRampLegend can label its gradient with the real km range instead
  // of recomputing the same tree a second time.
  const [meshDistanceRange, setMeshDistanceRange] = useState(null);

  const himawari = useJmaHimawariTicks(activeLayer === 'himawari');
  const [himawariStatus, setHimawariStatus] = useState('ok'); // 'ok' | 'loading' | 'unavailable' — only 'unavailable' has UI today (see the notice box below); 'loading' is reserved for a future spinner.
  const [himawariZoomInRange, setHimawariZoomInRange] = useState(true); // JMA only serves this product at zoom 3-5 — see HimawariLayer's onZoomRangeChange
  // Which basetime HimawariLayer actually crossfaded onto the map (not just
  // "the newest tick") — HimawariLayer falls back through up to 4 recent
  // candidates when the newest hasn't published yet, so this is the only
  // reliable source for "as of" time. null = nothing currently shown.
  const [himawariResolvedBasetime, setHimawariResolvedBasetime] = useState(null);
  // Clear the resolved basetime as soon as we leave Himawari mode.
  // HimawariLayer unmounts and stops reporting, but this state would
  // otherwise keep its stale value — and since himawari.ticks is a rolling
  // 24h window, that stale basetime can still match a tick on re-entry,
  // making himawariLastSynced briefly show a genuinely stale "as of" time
  // until HimawariLayer resolves a fresh one. Clearing it here means the
  // badge hides itself (per its own no-stale-time rule) instead.
  useEffect(() => {
    if (activeLayer !== 'himawari') setHimawariResolvedBasetime(null);
  }, [activeLayer]);

  // Current tab is a static live snapshot (PRD §4.1: no Play/scrubber for
  // any mode) — no timelineIndex/isPlaying state here. himawariBasetimeCandidates
  // always uses the "most recent, with fallback" chain; there is no
  // scrubbed-to-a-specific-tick case to handle on this tab.
  const himawariBasetimeCandidates = useMemo(() => {
    if (activeLayer !== 'himawari' || !himawari.ticks.length) return [];
    return himawari.ticks.slice(-4).reverse().map((t) => t.basetime);
  }, [activeLayer, himawari.ticks]);

  // Live Timestamp Badge (PRD §4.1) sources, per mode:
  // - Himawari: the tick matching whichever basetime actually rendered
  //   (see himawariResolvedBasetime above) — null while nothing has
  //   resolved yet, or when every fallback candidate failed to probe.
  const himawariLastSynced = useMemo(() => {
    const tick = himawari.ticks.find((t) => t.basetime === himawariResolvedBasetime);
    return tick?.date ?? null;
  }, [himawari.ticks, himawariResolvedBasetime]);
  // - Rainvision (rain/mesh/node all read the same sensor stream): the most
  //   recent `lastUpdate` across all stations, not a fake "now".
  const rainvisionLastSynced = useMemo(() => {
    if (!SENSOR_STATIONS.length) return null;
    const times = SENSOR_STATIONS
      .map((s) => new Date(s.lastUpdate))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!times.length) return null;
    return new Date(Math.max(...times.map((d) => d.getTime())));
  }, [SENSOR_STATIONS]);
  const activeLayerLastSynced = activeLayer === 'himawari' ? himawariLastSynced : rainvisionLastSynced;

  // Notification bell content (DashboardHeader) — live status, not a
  // discrete message log, since all three of these continuously re-derive
  // from the sensor stream/Himawari state rather than firing one-off events.
  const himawariNoticeMessage = activeLayer === 'himawari' && (!himawariZoomInRange || himawariStatus === 'unavailable')
    ? (himawariZoomInRange
        ? 'Imagery unavailable for this time'
        : 'Zoom the map to level 3–5 to see satellite imagery')
    : null;

  // Manifest resolves async, after activeLayer's initial state and (likely) after
  // the map has already mounted with the hardcoded MAP_CENTER/MAP_ZOOM_DEFAULT —
  // apply its default_layer/default_map once each, the same way handleReset does.
  const appliedDefaultLayerRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultLayerRef.current || !defaultLayer) return;
    if (METRICS[defaultLayer]) handleLayerChange(defaultLayer);
    appliedDefaultLayerRef.current = true;
  }, [defaultLayer]);

  const appliedDefaultMapRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultMapRef.current || !map || !defaultMap) return;
    // If the user has already picked a province by the time the manifest
    // resolves, don't yank the viewport back to the default view — but
    // don't mark the ref as done either, so this can still apply later
    // once the province selection is cleared (checked in the effect body,
    // not the dependency array, so clearing the province alone doesn't
    // re-run this effect and isn't required to).
    if (selectedProvinceCode) return;
    map.setCenter({ lat: defaultMap.lat, lng: defaultMap.lng });
    // Never let the manifest zoom in tighter than our national-view floor —
    // it may only zoom out further.
    map.setZoom(Math.min(defaultMap.zoom, MAP_ZOOM_DEFAULT));
    appliedDefaultMapRef.current = true;
  }, [map, defaultMap]);

  // Tracks the map's current viewport so useWindField can fetch a wind grid
  // over wherever the user is actually looking (see route.js/useWindField.js
  // for why: a fixed world-sized bbox would spread the same 54 OpenWeather
  // points too thin to look like anything). Debounced on `idle` (fires once
  // pan/zoom settles) rather than on every drag frame.
  const [mapBounds, setMapBounds] = useState(null);
  useEffect(() => {
    if (!map) return;
    let timer = null;
    const listener = map.addListener('idle', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = map.getBounds();
        if (!b) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setMapBounds({ north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() });
      }, 800);
    });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [map]);

  const { field: windField, ambientField: windAmbientField, status: windFieldStatus } = useWindField(mapBounds);

  // Dense field preferred, ambient as fallback — same precedence
  // WindParticleLayer already uses when sampling per-particle velocity.
  const avgWindSpeedKmh = useMemo(() => {
    const source = windField?.speed?.length ? windField : windAmbientField;
    const avg = averageSpeed(source);
    return avg == null ? null : avg * 3.6; // m/s -> km/h
  }, [windField, windAmbientField]);

  // Ticks every 60s so Unavailable(2h)/Inactive(24h) status keeps advancing
  // purely from the clock, even between sensor stream updates.
  const now = useNow();

  // Derived from statusBucket() so these counts stay mutually exclusive and
  // in lockstep with the map dot colors and the hide/show filter below —
  // no separate ad-hoc predicates to drift out of sync.
  const stats = useMemo(() => {
    const counts = { total: SENSOR_STATIONS.length, active: 0, raining: 0, unavailable: 0, inactive: 0, blacklist: 0 };
    for (const s of SENSOR_STATIONS) {
      const bucket = statusBucket(s, now);
      if (bucket === 'blacklisted') counts.blacklist += 1;
      else counts[bucket] += 1;
    }
    return counts;
  }, [SENSOR_STATIONS, now]);

  // Stats above always reflect the true totals; only the dots drawn on the
  // map are trimmed by hiddenStatuses (see toggleStatusVisibility above).
  const visibleStations = hiddenStatuses.size
    ? SENSOR_STATIONS.filter((s) => !hiddenStatuses.has(statusBucket(s, now)))
    : SENSOR_STATIONS;

  // Master reset toggles next to the Space/Ground Segment panel titles —
  // ON re-activates every boolean control in that segment, OFF turns them
  // all off. OWM's 3-way mode only follows the OFF direction (→ "Nonaktif");
  // it stays a radio-select, not a boolean, so there's no single "on" value
  // to restore.
  const skyFilterActive = activeLayer === 'himawari' && showWind;
  const handleSkyFilterToggle = (checked) => {
    handleHimawariToggle(checked);
    setShowWind(checked);
    if (!checked) setOwmLayer(null);
  };
  const groundFilterActive = showCoverage && showMarkers;
  const handleGroundFilterToggle = (checked) => {
    setShowCoverage(checked);
    setShowMarkers(checked);
  };

  const handleZoom = (delta) => {
    if (!map) return;
    // Mirrors the minZoom/maxZoom passed to <Map> in GoogleMapWrapper.
    const nextZoom = Math.min(Math.max(map.getZoom() + delta, MAP_MIN_ZOOM), MAP_MAX_ZOOM);
    map.setZoom(nextZoom);
  };

  const handleReset = () => {
    setSelectedProvinceCode(null);
    if (!map) return;
    map.setCenter(MAP_CENTER);
    map.setZoom(MAP_ZOOM_DEFAULT);
  };

  // Shared by handleProvinceSelect and the "map became ready after a
  // province was already selected" effect below, so the LatLngBounds
  // construction only lives in one place.
  const fitBoundsToProvince = (targetMap, code) => {
    const province = PROVINCES.find((p) => p.code === code);
    if (!province || !targetMap) return;
    targetMap.fitBounds(new window.google.maps.LatLngBounds(
      { lat: province.bounds.south, lng: province.bounds.west },
      { lat: province.bounds.north, lng: province.bounds.east },
    ));
  };

  const handleProvinceSelect = (code) => {
    setSelectedProvinceCode(code);
    if (!code) {
      handleReset();
      return;
    }
    fitBoundsToProvince(map, code);
  };

  // Race guard: if the user picks a province before the map has finished
  // loading, handleProvinceSelect's fitBounds call above is a no-op (no
  // `map` yet) and never retries. Re-apply the fit once `map` becomes
  // available while a province is still selected.
  useEffect(() => {
    if (!map || !selectedProvinceCode) return;
    fitBoundsToProvince(map, selectedProvinceCode);
  }, [map, selectedProvinceCode]);

  const matchedProvinceStations = useMemo(() => {
    if (!selectedProvinceCode) return null;
    const province = PROVINCES.find((p) => p.code === selectedProvinceCode);
    if (!province) return null;
    return summarizeStations(filterStationsInBounds(SENSOR_STATIONS, province.bounds), now);
  }, [selectedProvinceCode, SENSOR_STATIONS, now]);

  return (
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', bgcolor: 'var(--nirmala-map-bg)', overflow: 'hidden' }}>

        {/* Emerge-from-the-light reveal (continues the login fly-through flash) */}
        <Box
          component={motion.div}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          sx={{ position: 'fixed', inset: 0, bgcolor: '#eef5ff', pointerEvents: 'none', zIndex: 3000 }}
        />

        <DashboardHeader
          health={health}
          streamStatus={sensorStreamStatus}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          mapInfo={{ raining: stats.raining, total: stats.total, loading: loading && stats.total === 0 }}
          timestampInfo={{ label: METRICS[activeLayer]?.label ?? '', timestamp: activeLayerLastSynced }}
          himawariNotice={himawariNoticeMessage}
        />

        {/* Map container */}
        <Box ref={mapContainerRef} sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: activeTab === 'current' ? 'block' : 'none' }}>
            <GoogleMapWrapper onMapLoad={setMap}>
              {/* Himawari (cloud-top IR) and this tile both depict cloud/weather
                  cover over the same area — lower this one's opacity while
                  Himawari is active so the two don't visually fight (see the
                  matching note in SegmentTogglePanel). */}
              <OpenWeatherLayer
                layer={owmLayer}
                opacity={OWM_OPACITY[mode][activeLayer === 'himawari' ? 'himawari' : 'normal']}
              />
              {(activeLayer === 'rain' || activeLayer === 'himawari') && (
                <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
              )}
              {activeLayer === 'mesh' && (
                <MeshLayer stations={SENSOR_STATIONS} onDistanceRangeChange={setMeshDistanceRange} />
              )}
              {activeLayer === 'himawari' && (
                <HimawariLayer
                  active
                  candidateBasetimes={himawariBasetimeCandidates}
                  onStatus={setHimawariStatus}
                  onZoomRangeChange={setHimawariZoomInRange}
                  onBasetimeResolved={setHimawariResolvedBasetime}
                />
              )}
              <WindParticleLayer show={showWind} field={windField} ambientField={windAmbientField} speedMultiplier={windSpeedMultiplier} />
              <SensorDotLayer
                stations={visibleStations}
                // Mesh Map is about inspecting gaps/coverage between
                // sensors — hiding dots by default there would defeat the
                // point, so it always shows them regardless of the user's
                // toggle.
                showMarkers={activeLayer === 'mesh' ? true : showMarkers}
                selectedId={selectedStation?.id ?? null}
                onSelect={setSelectedStation}
              />
            </GoogleMapWrapper>

            {/* Soften the Google attribution strip to match the theme, without
                covering or reducing the legibility of the logo/Terms link. */}
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 40,
                pointerEvents: 'none',
                zIndex: 1,
                background: 'linear-gradient(to top, var(--nirmala-map-bg) 0%, transparent 100%)',
                opacity: 0.55,
              }}
            />

            {(() => {
              const segmentProps = {
                activeLayer, onLayerChange: handleLayerChange, onToggleHimawari: handleHimawariToggle,
                showMarkers, onToggleMarkers: setShowMarkers, showCoverage, onToggleCoverage: setShowCoverage,
                showWind, onToggleWind: setShowWind, windStatus: windFieldStatus,
                avgWindSpeedKmh, windSpeedMultiplier, onWindSpeedMultiplierChange: setWindSpeedMultiplier,
                owmLayer, onOwmChange: setOwmLayer, permissions,
              };
              const legendProps = { activeLayer, showCoverage, meshDistanceRange };
              const statsProps = { stats, hiddenStatuses, onToggleStatus: toggleStatusVisibility };

              if (isCompact) {
                return (
                  <MobileControlSheet
                    segmentProps={segmentProps}
                    legendProps={legendProps}
                    statsProps={statsProps}
                  />
                );
              }
              if (!controlsVisible) return null;
              return (
                <>
                  {/* Left: Space/Ground segment panel, merged into one with a
                      tab switcher — vertically centred between the header
                      and bottom edge so it never hangs low when expanded. */}
                  <Box sx={{
                    position: 'absolute', top: 72, bottom: 16, left: 16, zIndex: 'var(--z-overlay, 100)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5,
                  }}>
                    <SegmentPanel
                      {...segmentProps}
                      skyFilterActive={skyFilterActive}
                      onSkyFilterToggle={handleSkyFilterToggle}
                      groundFilterActive={groundFilterActive}
                      onGroundFilterToggle={handleGroundFilterToggle}
                    />
                  </Box>
                  {/* Right: sensor statistics above the rain-density legend */}
                  <Box sx={{
                    position: 'absolute', bottom: 24, right: 16, zIndex: 'var(--z-overlay, 100)',
                    display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-end',
                  }}>
                    <SensorStatsCard {...statsProps} />
                    <ColorRampLegend {...legendProps} />
                  </Box>
                </>
              );
            })()}

            {/* Map Controls */}
            {controlsVisible && (
              <MapControls
                onZoomIn={() => handleZoom(1)}
                onZoomOut={() => handleZoom(-1)}
                onReset={handleReset}
              />
            )}

            {/* Theme toggle — top-left, standalone */}
            <ThemeToggleControl />

            {/* Province search, fullscreen, show/hide-all — top-right, always visible */}
            <MapExtrasCluster
              fullscreenTargetRef={mapContainerRef}
              controlsVisible={controlsVisible}
              onToggleControlsVisible={() => setControlsVisible((v) => !v)}
              selectedProvinceCode={selectedProvinceCode}
              onSelectProvinceCode={handleProvinceSelect}
              matchedProvinceStations={matchedProvinceStations}
            />

            {/* Detail drawer */}
            <SensorDetailDrawer
              station={selectedStation}
              open={Boolean(selectedStation)}
              onClose={() => setSelectedStation(null)}
            />
          </Box>

          {activeTab === 'timeline' && <TimelineComingSoon />}
        </Box>
      </Box>
  );
}
