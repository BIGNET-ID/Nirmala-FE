'use client';

import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box, Button } from '@mui/material';
import { Icon } from '@iconify/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import SensorDotLayer from '@/components/map/SensorDotLayer';
import MetricLayerSelector from '@/components/dashboard/MetricLayerSelector';
import TimelinePlayer from '@/components/dashboard/TimelinePlayer';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import MapControls from '@/components/map/MapControls';
import { usePlatformData } from '@/hooks/usePlatformData';
import { nirmalaTheme } from '@/lib/theme';

export default function NirmalaDashboard() {
  const { sensors: apiSensors, lightning, thunderstorm, loading, error } = usePlatformData();
  
  // Use API sensors if available, otherwise fallback to empty array
  const SENSOR_STATIONS = apiSensors && apiSensors.length > 0 ? apiSensors : [];

  const [activeLayer, setActiveLayer] = useState('rain');
  const [showMarkers, setShowMarkers] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeStep, setTimeStep] = useState(12);
  const [selectedStation, setSelectedStation] = useState(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeStep((prev) => (prev >= 24 ? 0 : prev + 1));
      }, 800);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleZoom = (delta) => {
    if (!map) return;
    const nextZoom = Math.min(Math.max(map.getZoom() + delta, 4), 17);
    map.setZoom(nextZoom);
  };

  const handleReset = () => {
    if (!map) return;
    map.setCenter({ lat: -6.2088, lng: 106.8456 });
    map.setZoom(11);
  };

  return (
    <ThemeProvider theme={nirmalaTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', bgcolor: '#050811', overflow: 'hidden' }}>
        
        {/* Header */}
        <Box sx={{
          height: '56px',
          flexShrink: 0,
          background: 'rgba(5,8,17,0.96)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          gap: 1.5,
          zIndex: 1000,
        }}>
          
          {/* Nirmala brand */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              component="img"
              src="/nirmala-brand-dark.png"
              alt="Nirmala"
              sx={{ height: 'var(--size-logo-header, 28px)', width: 'auto', display: 'block' }}
            />
          </Box>

          <Box sx={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

          {/* Navigation tabs */}
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {[
              { label: 'Peta Radar', id: 'dashboard', icon: 'radar' },
              { label: 'Sensor', id: 'sensors', icon: 'sensors' },
              { label: 'Pengaturan', id: 'settings', icon: 'settings' },
            ].map((item) => (
              <Button key={item.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 0.75,
                  background: item.id === 'dashboard' ? 'rgba(0,229,255,0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: item.id === 'dashboard' ? '2px solid #00e5ff' : '2px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  color: item.id === 'dashboard' ? '#00e5ff' : 'rgba(160,160,160,0.8)',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  '&:hover': item.id !== 'dashboard' ? { color: '#f8fafc' } : {},
                  textTransform: 'none',
                  fontWeight: 500,
                }}
              >
                <Icon icon={item.icon === 'radar' ? 'solar:radar-bold-duotone' : item.icon === 'sensors' ? 'solar:server-2-bold-duotone' : 'solar:settings-bold-duotone'} width={14} />
                {item.label}
              </Button>
            ))}
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Status badges */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.5,
            background: 'rgba(52,211,153,0.1)',
            border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: '999px',
          }}>
            <Box sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#34d399',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.5 },
              },
            }} />
            <Box sx={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>
              LIVE · {SENSOR_STATIONS.filter(s => s.status === 'active').length}/{SENSOR_STATIONS.length}
            </Box>
          </Box>

          {/* Alert badge */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            background: 'rgba(96,165,250,0.1)',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: '999px',
          }}>
            <Icon icon="solar:water-drop-bold-duotone" width={14} style={{ color: '#60a5fa' }} />
            <Box sx={{ fontSize: '0.65rem', color: '#60a5fa', fontWeight: 700 }}>
              {SENSOR_STATIONS.filter(s => s.isRaining).length} Hujan
            </Box>
          </Box>

          {/* DateTime */}
          <Box sx={{ fontSize: '0.65rem', color: 'rgba(160,160,160,0.6)', fontFamily: 'monospace' }}>
            {new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB
          </Box>

          {/* User menu button */}
          <Button
            sx={{
              width: 34,
              height: 34,
              minWidth: 'auto',
              borderRadius: '50%',
              background: '#0d47a1',
              color: '#fff',
              fontSize: '0.7rem',
              fontWeight: 700,
              '&:hover': { background: '#1565c0' },
            }}
          >
            OP
          </Button>
        </Box>

        {/* Map container */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GoogleMapWrapper onMapLoad={setMap}>
            <CanvasHeatmapOverlay stations={SENSOR_STATIONS} />
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
          />

          {/* Right: Legend */}
          <ColorRampLegend activeLayer={activeLayer} />

          {/* Bottom: Timeline */}
          <TimelinePlayer
            timeStep={timeStep}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((prev) => !prev)}
            onTimeChange={setTimeStep}
          />

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
            activeLayer={activeLayer}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
