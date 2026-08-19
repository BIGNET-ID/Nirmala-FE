import { Box, Button, Typography, Divider, FormControlLabel, Switch } from '@mui/material';
import { Icon } from '@iconify/react';
import { METRICS } from '@/constants/metrics';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

function LayerSwitch({ checked, onChange, label, count, sx }) {
  return (
    <FormControlLabel
      sx={{ ml: 0, mr: 0, justifyContent: 'space-between', width: '100%', ...sx }}
      labelPlacement="start"
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} size="small" sx={switchSx} />}
      label={
        <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.primary' }}>
          {label}{typeof count === 'number' ? <Box component="span" sx={{ color: 'text.secondary', fontFamily: 'var(--font-family-mono)', ml: 0.5 }}>· {count}</Box> : null}
        </Typography>
      }
    />
  );
}

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#00e5ff' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'rgba(0, 229, 255, 0.7)' },
};

const OWM_LAYERS = [
  { id: null, label: 'Mati' },
  { id: 'precipitation_new', label: 'Hujan' },
  { id: 'clouds_new', label: 'Awan' },
];

export default function MetricLayerSelector({
  activeLayer, onLayerChange, showMarkers, onToggleMarkers, showCoverage, onToggleCoverage,
  showLightning, onToggleLightning, lightningCount,
  showStorms, onToggleStorms, stormCount,
  showWind, onToggleWind,
  owmLayer, onOwmChange,
  permissions,
}) {
  // Fail-open: a toggle is only hidden when the manifest explicitly says `false`.
  // Undefined/null (manifest not loaded yet, or flag not present) keeps it visible.
  // Thunderstorm has no dedicated permission flag in the PRD manifest contract,
  // so it is intentionally never gated here.
  const canViewSensor = permissions?.can_view_sensor !== false;
  const canViewLightning = permissions?.can_view_lightning !== false;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 72,
        left: 16,
        zIndex: 'var(--z-overlay, 100)',
        p: 1.75,
        width: 248,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <Typography sx={eyebrowSx}>Layer Data</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {Object.values(METRICS).map((m) => {
          const active = activeLayer === m.key;
          return (
            <Button
              key={m.key}
              startIcon={<Icon icon={m.icon} />}
              onClick={() => onLayerChange(m.key)}
              fullWidth
              disableRipple
              sx={{
                justifyContent: 'flex-start',
                height: 40,
                borderRadius: 'var(--radius-md, 8px)',
                px: 1.25,
                color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
                fontWeight: 700,
                border: `1px solid ${active ? 'var(--nirmala-cyan)' : 'transparent'}`,
                borderColor: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
                background: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
                '&:hover': { background: 'var(--nirmala-cyan-dim)' },
              }}
            >
              {m.label}
            </Button>
          );
        })}
      </Box>

      {onOwmChange && (
        <>
          <Divider sx={{ my: 0.25, borderColor: 'var(--nirmala-glass-border)' }} />
          <Typography sx={eyebrowSx}>Cuaca (OpenWeather)</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {OWM_LAYERS.map((o) => {
              const active = owmLayer === o.id;
              return (
                <Button
                  key={o.label}
                  onClick={() => onOwmChange(o.id)}
                  disableRipple
                  sx={{
                    flex: 1, minWidth: 0, px: 0.5, py: 0.5, fontSize: '0.68rem', fontWeight: 700,
                    borderRadius: 'var(--radius-sm, 4px)',
                    color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
                    border: `1px solid ${active ? 'var(--nirmala-cyan)' : 'transparent'}`,
                    borderColor: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
                    background: active ? 'var(--nirmala-cyan-dim)' : 'rgba(255,255,255,0.03)',
                    '&:hover': { background: 'var(--nirmala-cyan-dim)' },
                  }}
                >
                  {o.label}
                </Button>
              );
            })}
          </Box>
        </>
      )}

      <Divider sx={{ my: 0.25, borderColor: 'var(--nirmala-glass-border)' }} />
      <Typography sx={eyebrowSx}>Layer Tambahan</Typography>
      {onToggleLightning && canViewLightning && (
        <LayerSwitch checked={showLightning} onChange={onToggleLightning} label="Petir" count={lightningCount} />
      )}
      {onToggleStorms && (
        <LayerSwitch checked={showStorms} onChange={onToggleStorms} label="Sel Badai" count={stormCount} sx={{ mt: -0.75 }} />
      )}
      {onToggleWind && (
        <LayerSwitch checked={showWind} onChange={onToggleWind} label="Angin (partikel)" sx={{ mt: -0.75 }} />
      )}
      {canViewSensor && (
        <>
          <LayerSwitch checked={showCoverage} onChange={onToggleCoverage} label="Cakupan Sensor" sx={{ mt: -0.75 }} />
          <LayerSwitch checked={showMarkers} onChange={onToggleMarkers} label="Titik Sensor" sx={{ mt: -0.75 }} />
        </>
      )}
    </Box>
  );
}
