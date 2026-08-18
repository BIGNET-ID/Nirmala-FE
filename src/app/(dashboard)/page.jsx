'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { motion } from 'motion/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import SensorDotLayer from '@/components/map/SensorDotLayer';
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
import { MAP_CENTER, MAP_ZOOM_DEFAULT } from '@/constants/mapConfig';

export default function NirmalaDashboard() {
  const { sensors: apiSensors, lightning, thunderstorm, loading, error } = usePlatformData();
  
  // Use API sensors if available, otherwise fallback to empty array
  const SENSOR_STATIONS = apiSensors && apiSensors.length > 0 ? apiSensors : [];

  const [activeLayer, setActiveLayer] = useState('rain');
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showLightning, setShowLightning] = useState(false);
  const [showStorms, setShowStorms] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [owmLayer, setOwmLayer] = useState(null); // OpenWeather tile layer id or null
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);

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

        <DashboardHeader stats={stats} />

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GoogleMapWrapper onMapLoad={setMap}>
            <OpenWeatherLayer layer={owmLayer} />
            <CanvasHeatmapOverlay stations={SENSOR_STATIONS} showCoverage={showCoverage} />
            <ThunderstormLayer storms={thunderstorm} show={showStorms} />
            <LightningLayer strikes={lightning} show={showLightning} />
            <WindParticleLayer show={showWind} />
            <SensorDotLayer
              stations={SENSOR_STATIONS}
              showMarkers={showMarkers}
              selectedId={selectedStation?.id ?? null}
              onSelect={setSelectedStation}
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
            showStorms={showStorms}
            onToggleStorms={setShowStorms}
            stormCount={thunderstorm?.length || 0}
            showWind={showWind}
            onToggleWind={setShowWind}
            owmLayer={owmLayer}
            onOwmChange={setOwmLayer}
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
