import { Box, Button, Typography, Divider, FormControlLabel, Switch } from '@mui/material';
import { Icon } from '@iconify/react';
import { METRICS } from '@/constants/metrics';

export default function MetricLayerSelector({ activeLayer, onLayerChange, showMarkers, onToggleMarkers }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 96,
        left: 16,
        zIndex: 100,
        p: 1.8,
        width: 248,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.2,
        backdropFilter: 'blur(18px)',
        background: 'linear-gradient(180deg, rgba(8, 14, 25, 0.88), rgba(9, 16, 29, 0.78))',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        borderRadius: 3.5,
        boxShadow: '0 12px 20px rgba(2, 6, 23, 0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.14em' }}>
        METRIC METEOROLOGI
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Object.values(METRICS).map((m) => (
          <Button
            key={m.key}
            variant={activeLayer === m.key ? 'contained' : 'outlined'}
            color={m.key === 'temp' ? 'secondary' : 'primary'}
            startIcon={<Icon icon={m.icon} />}
            onClick={() => onLayerChange(m.key)}
            fullWidth
            sx={{
              justifyContent: 'flex-start',
              height: 42,
              borderRadius: 2,
              px: 1.5,
              borderColor: activeLayer === m.key ? 'rgba(0, 229, 255, 0.38)' : 'rgba(148, 163, 184, 0.18)',
              background: activeLayer === m.key ? 'linear-gradient(90deg, rgba(0, 229, 255, 0.2), rgba(14, 116, 144, 0.1))' : 'rgba(15, 23, 42, 0.2)',
              '&:hover': {
                background: activeLayer === m.key ? 'linear-gradient(90deg, rgba(0, 229, 255, 0.26), rgba(14, 116, 144, 0.16))' : 'rgba(15, 23, 42, 0.28)',
              },
            }}
          >
            {m.label}
          </Button>
        ))}
      </Box>
      <Divider sx={{ my: 0.25, borderColor: 'rgba(148,163,184,0.12)' }} />
      <FormControlLabel
        control={
          <Switch
            checked={showMarkers}
            onChange={(e) => onToggleMarkers(e.target.checked)}
            color="primary"
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#00e5ff' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'rgba(0, 229, 255, 0.7)' },
            }}
          />
        }
        label={<Typography variant="body2" sx={{ fontSize: '0.82rem', color: '#dfe9f6' }}>Sensor Station Dots</Typography>}
      />
    </Box>
  );
}