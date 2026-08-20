'use client';

import { useEffect, useRef, useState } from 'react';
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
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import MetricLayerSelector from '@/components/dashboard/MetricLayerSelector';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import SensorStatsCard from '@/components/dashboard/SensorStatsCard';
import MapInfoPill from '@/components/dashboard/MapInfoPill';
import MapControls from '@/components/map/MapControls';
import { usePlatformData } from '@/hooks/usePlatformData';
import { useSensorStream } from '@/hooks/useSensorStream';
import { useLightningStream } from '@/hooks/useLightningStream';
import { useThunderstormStream } from '@/hooks/useThunderstormStream';
import { useWindField } from '@/hooks/useWindField';
import { useAuth } from '@/hooks/useAuth';
import { METRICS } from '@/constants/metrics';
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';
import { LAYER_STATUS } from '@/constants/layerStatus';

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
              <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
            )}
            {activeLayer === 'mesh' && <MeshLayer stations={SENSOR_STATIONS} />}
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

          {/* Timeline forecast: hidden — no national historical snapshots yet
              (only per-sensor timeseries). Re-enable when the backend exposes
              historical national snapshots. See spec §3.5 / §7 gaps. */}

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
