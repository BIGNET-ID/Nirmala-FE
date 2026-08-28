'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { motion } from 'motion/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import SensorDotLayer from '@/components/map/SensorDotLayer';
import MeshLayer from '@/components/map/MeshLayer';
import OpenWeatherLayer from '@/components/map/OpenWeatherLayer';
import LightningLayer from '@/components/map/LightningLayer';
import ThunderstormLayer from '@/components/map/ThunderstormLayer';
import WindParticleLayer from '@/components/map/WindParticleLayer';
import HimawariLayer from '@/components/map/HimawariLayer';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ProvinceFilterSelect from '@/components/dashboard/ProvinceFilterSelect';
import { SkySegmentPanel, GroundSegmentPanel } from '@/components/dashboard/SegmentTogglePanel';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import SensorStatsCard from '@/components/dashboard/SensorStatsCard';
import MobileControlSheet from '@/components/dashboard/MobileControlSheet';
import MapInfoPill from '@/components/dashboard/MapInfoPill';
import LiveTimestampBadge from '@/components/dashboard/LiveTimestampBadge';
import MapControls from '@/components/map/MapControls';
import TimelineComingSoon from '@/components/dashboard/TimelineComingSoon';
import { usePlatformData } from '@/hooks/usePlatformData';
import { useSensorStream } from '@/hooks/useSensorStream';
import { useLightningStream } from '@/hooks/useLightningStream';
import { useThunderstormStream } from '@/hooks/useThunderstormStream';
import { useWindField } from '@/hooks/useWindField';
import { useJmaHimawariTicks } from '@/hooks/useJmaHimawariTicks';
import { useAuth } from '@/hooks/useAuth';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { METRICS } from '@/constants/metrics';
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';
import { LAYER_STATUS } from '@/constants/layerStatus';
import { PROVINCES } from '@/constants/provinces';
import { filterStationsInBounds, summarizeStations } from '@/lib/provinceFilter';

// SSE streams report 'connecting'/'live'/'reconnecting'; a toggle also needs
// to say "connected but nothing to show right now" — this maps both signals
// into the one LAYER_STATUS vocabulary every layer indicator reads.
function streamStatus(sseStatus, count) {
  if (sseStatus === 'reconnecting') return LAYER_STATUS.ERROR;
  if (sseStatus === 'connecting') return LAYER_STATUS.LOADING;
  return count > 0 ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY;
}

export default function NirmalaDashboard() {
  const { isCompact } = useResponsiveLayout();
  const { sensors: apiSensors, lightning: apiLightning, thunderstorm: apiThunderstorm, health, loading, error } = usePlatformData();
  const { permissions, defaultMap, defaultLayer } = useAuth();

  // Initial REST snapshot seeds each SSE hook; live updates flow in via /api/stream/*.
  const { stations: SENSOR_STATIONS, status: sensorStreamStatus } = useSensorStream(apiSensors);
  const { strikes: lightning, status: lightningStreamStatus } = useLightningStream(apiLightning);
  const { storms: thunderstorm, status: thunderstormStreamStatus } = useThunderstormStream(apiThunderstorm);
  const [activeLayer, setActiveLayer] = useState('rain');
  // The last-selected ground mode (rain/mesh/node) — restored when the
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
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showLightning, setShowLightning] = useState(false);
  const [showStorms, setShowStorms] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [owmLayer, setOwmLayer] = useState(null); // OpenWeather tile layer id or null
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'timeline' — PRD §4.1 Dual-Tab
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(null);
  // Reported by MeshLayer once it computes the Mesh Map MST, so
  // ColorRampLegend can label its gradient with the real km range instead
  // of recomputing the same tree a second time.
  const [meshDistanceRange, setMeshDistanceRange] = useState(null);

  // Dismiss state for the two top-center status pills — manual close only,
  // never a timer (this is ongoing status, not a one-off toast; see the
  // components' own doc comments). Resetting on mode/tab change means a
  // user who dismissed one for "Kerapatan Hujan" still sees it again after
  // switching to "Himawari", since the content underneath is genuinely new.
  const [infoPillDismissed, setInfoPillDismissed] = useState(false);
  const [timestampBadgeDismissed, setTimestampBadgeDismissed] = useState(false);
  useEffect(() => {
    setInfoPillDismissed(false);
    setTimestampBadgeDismissed(false);
  }, [activeLayer, activeTab]);

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

  const stats = {
    total: SENSOR_STATIONS.length,
    active: SENSOR_STATIONS.filter((s) => s.status === 'active').length,
    raining: SENSOR_STATIONS.filter((s) => s.isRaining).length,
    blacklist: SENSOR_STATIONS.filter((s) => s.blacklisted || s.status === 'blacklisted').length,
  };

  const handleZoom = (delta) => {
    if (!map) return;
    const nextZoom = Math.min(Math.max(map.getZoom() + delta, 4), 17);
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
    return summarizeStations(filterStationsInBounds(SENSOR_STATIONS, province.bounds));
  }, [selectedProvinceCode, SENSOR_STATIONS]);

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
        />

        {activeTab === 'current' && (
          <ProvinceFilterSelect
            selectedCode={selectedProvinceCode}
            onSelectCode={handleProvinceSelect}
            matched={matchedProvinceStations}
          />
        )}

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: activeTab === 'current' ? 'block' : 'none' }}>
            <GoogleMapWrapper onMapLoad={setMap}>
              {/* Himawari (cloud-top IR) and this tile both depict cloud/weather
                  cover over the same area — lower this one's opacity while
                  Himawari is active so the two don't visually fight (see the
                  matching note in SegmentTogglePanel). */}
              <OpenWeatherLayer layer={owmLayer} opacity={activeLayer === 'himawari' ? 0.4 : 0.75} />
              {activeLayer === 'rain' && (
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
              <ThunderstormLayer storms={thunderstorm} show={showStorms} />
              <LightningLayer strikes={lightning} show={showLightning} />
              <WindParticleLayer show={showWind} field={windField} ambientField={windAmbientField} />
              <SensorDotLayer
                stations={SENSOR_STATIONS}
                showMarkers={activeLayer === 'rain' ? showMarkers : true}
                selectedId={selectedStation?.id ?? null}
                onSelect={setSelectedStation}
                focus={activeLayer === 'node'}
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
                showLightning, onToggleLightning: setShowLightning, lightningCount: lightning?.length || 0,
                lightningStatus: streamStatus(lightningStreamStatus, lightning?.length || 0),
                showStorms, onToggleStorms: setShowStorms, stormCount: thunderstorm?.length || 0,
                stormStatus: streamStatus(thunderstormStreamStatus, thunderstorm?.length || 0),
                showWind, onToggleWind: setShowWind, windStatus: windFieldStatus,
                owmLayer, onOwmChange: setOwmLayer, permissions,
              };
              const legendProps = { activeLayer, showCoverage, meshDistanceRange };
              const statsProps = { stats };

              if (isCompact) {
                return (
                  <MobileControlSheet
                    segmentProps={segmentProps}
                    legendProps={legendProps}
                    statsProps={statsProps}
                  />
                );
              }
              return (
                <>
                  {/* Left: Sky Segment panel above Ground Segment panel — centred
                      vertically in the space between the header and the bottom
                      edge (not top-anchored), so the pair never hangs low when
                      both are expanded. */}
                  <Box sx={{
                    position: 'absolute', top: 72, bottom: 16, left: 16, zIndex: 'var(--z-overlay, 100)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5,
                  }}>
                    <SkySegmentPanel {...segmentProps} />
                    <GroundSegmentPanel {...segmentProps} />
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

            {/* Top-center: contextual info pill */}
            {!infoPillDismissed && (
              <MapInfoPill
                raining={stats.raining}
                total={stats.total}
                loading={loading && stats.total === 0}
                onClose={() => setInfoPillDismissed(true)}
              />
            )}

            {/* Top-center, below the info pill: Live Timestamp Badge (PRD §4.1) —
                when each mode's data was actually last synced. Renders nothing
                until a real timestamp is known (see LiveTimestampBadge). */}
            {!timestampBadgeDismissed && (
              <LiveTimestampBadge
                label={METRICS[activeLayer]?.label ?? ''}
                timestamp={activeLayerLastSynced}
                onClose={() => setTimestampBadgeDismissed(true)}
              />
            )}

            {/* Top-center, below the timestamp badge: Himawari notice — either
                "zoom out of range" (JMA only serves this product at zoom 3-5;
                takes priority since it explains why nothing shows regardless of
                data status) or the load-failure notice (rare: JMA hasn't
                published any of the last 4 frames). Neither needs a permanent
                slot the way MapInfoPill/LiveTimestampBadge do — always shown
                (including on phones), text just wraps below `sm`. */}
            {activeLayer === 'himawari' && (!himawariZoomInRange || himawariStatus === 'unavailable') && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 152,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 'var(--z-overlay, 100)',
                  px: 1.75,
                  py: 0.75,
                  maxWidth: 'calc(100vw - 32px)',
                  textAlign: 'center',
                  backdropFilter: 'blur(20px)',
                  background: 'var(--nirmala-glass-bg)',
                  border: '1px solid var(--nirmala-glass-border)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  fontSize: { xs: '0.7rem', sm: '0.78rem' },
                  color: 'text.primary',
                }}
              >
                {himawariZoomInRange
                  ? 'Citra tidak tersedia untuk waktu ini'
                  : 'Perbesar/perkecil peta ke level zoom 3–5 untuk melihat citra satelit'}
              </Box>
            )}

            {/* Map Controls */}
            <MapControls
              onZoomIn={() => handleZoom(1)}
              onZoomOut={() => handleZoom(-1)}
              onReset={handleReset}
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
