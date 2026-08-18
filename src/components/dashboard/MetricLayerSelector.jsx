import { Box, Button, Typography, Divider, FormControlLabel, Switch, Chip } from '@mui/material';
import { Icon } from '@iconify/react';
import { METRICS, UPCOMING_LAYERS } from '@/constants/metrics';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#00e5ff' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'rgba(0, 229, 255, 0.7)' },
};

export default function MetricLayerSelector({
  activeLayer, onLayerChange, showMarkers, onToggleMarkers, showCoverage, onToggleCoverage,
}) {
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
                color: active ? '#00e5ff' : 'text.secondary',
                fontWeight: 700,
                border: `1px solid ${active ? 'rgba(0,229,255,0.44)' : 'transparent'}`,
                background: active ? 'rgba(0,229,255,0.10)' : 'transparent',
                '&:hover': { background: active ? 'rgba(0,229,255,0.14)' : 'rgba(255,255,255,0.04)' },
              }}
            >
              {m.label}
            </Button>
          );
        })}

        {UPCOMING_LAYERS.map((m) => (
          <Button
            key={m.key}
            startIcon={<Icon icon={m.icon} />}
            disabled
            fullWidth
            sx={{
              justifyContent: 'flex-start',
              height: 40,
              borderRadius: 'var(--radius-md, 8px)',
              px: 1.25,
              color: 'text.secondary',
              opacity: 0.55,
              '&.Mui-disabled': { color: 'text.secondary' },
            }}
          >
            {m.label}
            <Box sx={{ flex: 1 }} />
            <Chip label="Segera" size="small"
              sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }} />
          </Button>
        ))}
      </Box>

      <Divider sx={{ my: 0.25, borderColor: 'var(--nirmala-glass-border)' }} />

      <FormControlLabel
        sx={{ ml: 0 }}
        control={<Switch checked={showCoverage} onChange={(e) => onToggleCoverage(e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.primary' }}>Cakupan Sensor</Typography>}
      />
      <FormControlLabel
        sx={{ ml: 0, mt: -1 }}
        control={<Switch checked={showMarkers} onChange={(e) => onToggleMarkers(e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.primary' }}>Titik Sensor</Typography>}
      />
    </Box>
  );
}
