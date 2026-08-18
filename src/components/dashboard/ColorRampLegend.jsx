import { Box, Typography } from '@mui/material';
import { METRICS } from '@/constants/metrics';

export default function ColorRampLegend({ activeLayer }) {
  const metric = METRICS[activeLayer];
  if (!metric) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 96,
        right: 16,
        zIndex: 100,
        p: 1.8,
        width: 218,
        backdropFilter: 'blur(18px)',
        background: 'linear-gradient(180deg, rgba(8, 14, 25, 0.88), rgba(9, 16, 29, 0.78))',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        borderRadius: 3.5,
        boxShadow: '0 12px 20px rgba(2, 6, 23, 0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1, letterSpacing: '0.12em' }}>
        SKALA {metric.label.toUpperCase()} ({metric.unit})
      </Typography>
      <Box sx={{ height: 12, borderRadius: 999, background: metric.colorRamp, mb: 1, border: '1px solid rgba(148,163,184,0.12)' }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', color: '#94a3b8' }}>
        <span>{metric.min}{metric.unit}</span>
        <span>{metric.max}+{metric.unit}</span>
      </Box>
    </Box>
  );
}