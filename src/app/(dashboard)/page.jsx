'use client';

import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box, Button } from '@mui/material';
import { AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { Icon } from '@iconify/react';
import GoogleMapWrapper from '@/components/map/GoogleMapWrapper';
import CanvasHeatmapOverlay from '@/components/map/CanvasOverlay';
import MetricLayerSelector from '@/components/dashboard/MetricLayerSelector';
import TimelinePlayer from '@/components/dashboard/TimelinePlayer';
import ColorRampLegend from '@/components/dashboard/ColorRampLegend';
import SensorDetailDrawer from '@/components/dashboard/SensorDetailDrawer';
import MapControls from '@/components/map/MapControls';
import { usePlatformData } from '@/hooks/usePlatformData';
import { nirmalaTheme } from '@/lib/theme';

function getRainColor(val) {
  if (val < 5) return '#94a3b8';
  if (val < 25) return '#00e5ff';
  if (val < 50) return '#00e676';
  if (val < 75) return '#ffeb3b';
  if (val < 100) return '#ff9800';
  return '#f44336';
}

function SensorMarkers({ stations, activeLayer, showMarkers, onSelect, selectedStation, onCloseInfo }) {
  if (!showMarkers) return null;

  return (
    <>
      {stations.map((st) => {
        const value = activeLayer === 'rain' ? st.rain : st.temp;
        const unit = activeLayer === 'rain' ? 'mm/j' : '°C';
        const color = activeLayer === 'rain' ? getRainColor(st.rain) : '#00e5ff';

        return (
          <React.Fragment key={st.id}>
            <AdvancedMarker
              position={{ lat: st.lat, lng: st.lng }}
              onClick={() => onSelect?.(st)}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  '&:hover .marker-ring': { transform: 'scale(1.15)' },
                }}
              >
                <Box
                  className="marker-ring"
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: `2px solid ${color}`,
                    bgcolor: `${color}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 16px ${color}88, inset 0 0 8px ${color}22`,
                    transition: 'transform 0.2s ease',
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      inset: -6,
                      borderRadius: '50%',
                      border: `1px solid ${color}33`,
                      animation: 'pulse-ring 2s ease-out infinite',
                    },
                    '@keyframes pulse-ring': {
                      '0%': { transform: 'scale(0.8)', opacity: 1 },
                      '100%': { transform: 'scale(1.6)', opacity: 0 },
                    },
                  }}
                >
                  <Box component="span" sx={{ fontSize: 14 }}>
                    {activeLayer === 'rain' ? '🌧' : '🌡'}
                  </Box>
                </Box>
                <Box
                  sx={{
                    mt: 0.5,
                    bgcolor: 'rgba(5,8,23,0.9)',
                    border: `1px solid ${color}55`,
                    borderRadius: 1,
                    px: 0.75,
                    py: 0.25,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <Box sx={{ fontSize: '0.65rem', color, fontWeight: 700, lineHeight: 1.2 }}>
                    {value} {unit}
                  </Box>
                </Box>
              </Box>
            </AdvancedMarker>

            {selectedStation?.id === st.id && (
              <InfoWindow
                position={{ lat: st.lat, lng: st.lng }}
                onCloseClick={onCloseInfo}
                pixelOffset={[0, -60]}
              >
                <Box sx={{ p: 1, minWidth: 180, bgcolor: '#0f172a', color: '#f8fafc' }}>
                  <Box sx={{ color: '#00e5ff', fontWeight: 700, mb: 0.5 }}>{st.name}</Box>
                  <Box sx={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>ID: {st.id}</Box>
                  <Box sx={{ my: 0.75, borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Box>
                      <Box sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>Hujan</Box>
                      <Box sx={{ fontSize: '0.85rem', fontWeight: 700, color: getRainColor(st.rain) }}>
                        {st.rain} mm/j
                      </Box>
                    </Box>
                    <Box>
                      <Box sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>Suhu</Box>
                      <Box sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#00e5ff' }}>
                        {st.temp} °C
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </InfoWindow>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

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
            <CanvasHeatmapOverlay stations={SENSOR_STATIONS} activeLayer={activeLayer} />
            <SensorMarkers
              stations={SENSOR_STATIONS}
              activeLayer={activeLayer}
              showMarkers={showMarkers}
              onSelect={setSelectedStation}
              selectedStation={selectedStation}
              onCloseInfo={() => setSelectedStation(null)}
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
