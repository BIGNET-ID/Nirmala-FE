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
import MetricLayerSelector from '@/components/dashboard/MetricLayerSelector';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import SensorStatsCard from '@/components/dashboard/SensorStatsCard';
import MapInfoPill from '@/components/dashboard/MapInfoPill';
import MapControls from '@/components/map/MapControls';
import TimeTravelBar from '@/components/dashboard/TimeTravelBar';
import { usePlatformData } from '@/hooks/usePlatformData';
import { useSensorStream } from '@/hooks/useSensorStream';
import { useLightningStream } from '@/hooks/useLightningStream';
import { useThunderstormStream } from '@/hooks/useThunderstormStream';
import { useWindField } from '@/hooks/useWindField';
import { useHimawariGrid } from '@/hooks/useHimawariGrid';
import { useRainHistoryRange } from '@/hooks/useRainHistoryRange';
import { useHistoricalSensorSnapshot } from '@/hooks/useHistoricalSensorSnapshot';
import { useAuth } from '@/hooks/useAuth';
import { METRICS } from '@/constants/metrics';
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';
import { LAYER_STATUS } from '@/constants/layerStatus';
import { buildRainTicks } from '@/lib/timeTravelRange';

// SSE streams report 'connecting'/'live'/'reconnecting'; a toggle also needs
// to say "connected but nothing to show right now" — this maps both signals
// into the one LAYER_STATUS vocabulary every layer indicator reads.
function streamStatus(sseStatus, count) {
  if (sseStatus === 'reconnecting') return LAYER_STATUS.ERROR;
  if (sseStatus === 'connecting') return LAYER_STATUS.LOADING;
  return count > 0 ? LAYER_STATUS.OK : LAYER_STATUS.EMPTY;
}

export default function NirmalaDashboard() {
  const { sensors: apiSensors, lightning: apiLightning, thunderstorm: apiThunderstorm, health, loading, error } = usePlatformData();
  const { permissions, defaultMap, defaultLayer } = useAuth();

  // Initial REST snapshot seeds each SSE hook; live updates flow in via /api/stream/*.
  const { stations: SENSOR_STATIONS, status: sensorStreamStatus } = useSensorStream(apiSensors);
  const { strikes: lightning, status: lightningStreamStatus } = useLightningStream(apiLightning);
  const { storms: thunderstorm, status: thunderstormStreamStatus } = useThunderstormStream(apiThunderstorm);
  const { field: windField, status: windFieldStatus } = useWindField();

  const [activeLayer, setActiveLayer] = useState('rain');
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showLightning, setShowLightning] = useState(false);
  const [showStorms, setShowStorms] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [owmLayer, setOwmLayer] = useState(null); // OpenWeather tile layer id or null
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);

  // Global time-travel control (Play + scrubber). `timelineIndex === null`
  // means "live"; otherwise it indexes into `ticks` below. Ticks are per-mode:
  // rain history's actual retained window (discovered from a reference
  // sensor's timeseries — the backend has no fixed/contractual retention, see
  // useRainHistoryRange), or the Himawari API's own rolling frame window
  // (~hours, not days — see constants/metrics.js note).
  const [timelineIndex, setTimelineIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const himawari = useHimawariGrid(activeLayer === 'himawari');
  const rainHistoryRefSensorId = SENSOR_STATIONS.find((s) => s.status === 'active')?.id ?? SENSOR_STATIONS[0]?.id;
  const rainHistory = useRainHistoryRange(activeLayer === 'rain', rainHistoryRefSensorId);
  // Memoized so tick Date objects keep a stable identity across renders that
  // don't actually change the range — ticks[i].date otherwise gets a fresh
  // Date instance every render, which fed into useHistoricalSensorSnapshot's
  // effect deps as a "changed" value on every render and looped infinitely.
  const ticks = useMemo(() => {
    if (activeLayer === 'himawari') return himawari.ticks;
    if (!rainHistory.start || !rainHistory.end) return [];
    return buildRainTicks(rainHistory.start, rainHistory.end).map((date) => ({ date }));
  }, [activeLayer, himawari.ticks, rainHistory.start, rainHistory.end]);

  // Switching Layer Data resets the timeline to live — each mode's range is
  // independent (a rain-history position rarely lines up with a Himawari frame).
  useEffect(() => { setTimelineIndex(null); setIsPlaying(false); }, [activeLayer]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setTimelineIndex((i) => {
        const next = (i ?? 0) + 1;
        if (next >= ticks.length) { setIsPlaying(false); return null; }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, ticks.length]);

  const handleTimelinePlayPause = () => {
    setTimelineIndex((i) => (i == null ? 0 : i));
    setIsPlaying((p) => !p);
  };
  const handleTimelineScrub = (v) => { setTimelineIndex(v); setIsPlaying(false); };
  const handleTimelineGoLive = () => { setTimelineIndex(null); setIsPlaying(false); };

  const selectedTimestamp = activeLayer === 'rain' && timelineIndex != null ? ticks[timelineIndex].date : null;
  const historicalStations = useHistoricalSensorSnapshot(selectedTimestamp, SENSOR_STATIONS, map);
  const rainStations = selectedTimestamp ? (historicalStations || SENSOR_STATIONS) : SENSOR_STATIONS;

  const currentHimawariTick = activeLayer === 'himawari'
    ? (timelineIndex != null ? himawari.ticks[timelineIndex] : himawari.ticks[himawari.ticks.length - 1])
    : null;

  // Manifest resolves async, after activeLayer's initial state and (likely) after
  // the map has already mounted with the hardcoded MAP_CENTER/MAP_ZOOM_DEFAULT —
  // apply its default_layer/default_map once each, the same way handleReset does.
  const appliedDefaultLayerRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultLayerRef.current || !defaultLayer) return;
    if (METRICS[defaultLayer]) setActiveLayer(defaultLayer);
    appliedDefaultLayerRef.current = true;
  }, [defaultLayer]);

  const appliedDefaultMapRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultMapRef.current || !map || !defaultMap) return;
    map.setCenter({ lat: defaultMap.lat, lng: defaultMap.lng });
    // Never let the manifest zoom in tighter than our national-view floor —
    // it may only zoom out further.
    map.setZoom(Math.min(defaultMap.zoom, MAP_ZOOM_DEFAULT));
    appliedDefaultMapRef.current = true;
  }, [map, defaultMap]);

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
    if (!map) return;
    map.setCenter(MAP_CENTER);
    map.setZoom(MAP_ZOOM_DEFAULT);
  };

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

        <DashboardHeader stats={stats} health={health} streamStatus={sensorStreamStatus} />

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GoogleMapWrapper onMapLoad={setMap}>
            <OpenWeatherLayer layer={owmLayer} />
            {activeLayer === 'rain' && (
              <CanvasHeatmapOverlay stations={rainStations} showCoverage={showCoverage} />
            )}
            {activeLayer === 'mesh' && <MeshLayer stations={SENSOR_STATIONS} />}
            {activeLayer === 'himawari' && (
              <HimawariLayer active bounds={himawari.bounds} frameUrl={currentHimawariTick?.url} />
            )}
            <ThunderstormLayer storms={thunderstorm} show={showStorms} />
            <LightningLayer strikes={lightning} show={showLightning} />
            <WindParticleLayer show={showWind} field={windField} />
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

          {/* Left: Layer selector */}
          <MetricLayerSelector
            activeLayer={activeLayer}
            onLayerChange={setActiveLayer}
            showMarkers={showMarkers}
            onToggleMarkers={setShowMarkers}
            showCoverage={showCoverage}
            onToggleCoverage={setShowCoverage}
            showLightning={showLightning}
            onToggleLightning={setShowLightning}
            lightningCount={lightning?.length || 0}
            lightningStatus={streamStatus(lightningStreamStatus, lightning?.length || 0)}
            showStorms={showStorms}
            onToggleStorms={setShowStorms}
            stormCount={thunderstorm?.length || 0}
            stormStatus={streamStatus(thunderstormStreamStatus, thunderstorm?.length || 0)}
            showWind={showWind}
            onToggleWind={setShowWind}
            windStatus={windFieldStatus}
            owmLayer={owmLayer}
            onOwmChange={setOwmLayer}
            permissions={permissions}
          />

          {/* Right: Legend */}
          <ColorRampLegend activeLayer={activeLayer} showCoverage={showCoverage} />

          {/* Top-center: contextual info pill */}
          <MapInfoPill raining={stats.raining} total={stats.total} loading={loading && stats.total === 0} />

          {/* Bottom-left: sensor statistics */}
          <SensorStatsCard stats={stats} />

          {/* Bottom-center: time-travel player. Rain-history mode replays sensors
              (viewport-capped, see useHistoricalSensorSnapshot for why); Himawari
              mode scrubs real satellite frames. Not shown for Mesh/Node — no time
              dimension there. */}
          {(activeLayer === 'rain' || activeLayer === 'himawari') && (
            <TimeTravelBar
              ticks={ticks}
              index={timelineIndex}
              isPlaying={isPlaying}
              onScrub={handleTimelineScrub}
              onPlayPause={handleTimelinePlayPause}
              onGoLive={handleTimelineGoLive}
              loading={(activeLayer === 'himawari' && himawari.loading) || (activeLayer === 'rain' && rainHistory.loading)}
              caveat={activeLayer === 'himawari' ? 'Waktu di atas adalah jam citra satelit tersedia, bukan waktu sekarang · Cakupan: Filipina saja' : null}
            />
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
      </Box>
  );
}
