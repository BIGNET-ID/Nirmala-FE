import { Box, Typography } from '@mui/material';
import { METRICS } from '@/constants/metrics';
import { SENSOR_STATUS_COLOR } from '@/lib/sensorColor';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

const NODE_STATUS_ITEMS = [
  { color: SENSOR_STATUS_COLOR.active, label: 'Aktif (kering)' },
  { color: SENSOR_STATUS_COLOR.raining, label: 'Hujan' },
  { color: SENSOR_STATUS_COLOR.blacklisted, label: 'Blacklist' },
  { color: SENSOR_STATUS_COLOR.inactive, label: 'Nonaktif' },
];

export default function ColorRampLegend({ activeLayer, showCoverage = false }) {
  const metric = METRICS[activeLayer];
  if (!metric) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 24,
        right: 16,
        zIndex: 'var(--z-overlay, 100)',
        p: 1.75,
        width: 218,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <Typography sx={{ ...eyebrowSx, display: 'block', mb: 1 }}>
        {metric.label}
      </Typography>

      {metric.colorRamp ? (
        <>
          <Box sx={{ height: 12, borderRadius: 999, background: metric.colorRamp, mb: 0.75, border: '1px solid rgba(148,163,184,0.12)' }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'text.secondary' }}>
            <span>{metric.minLabel}</span>
            <span>{metric.maxLabel}</span>
          </Box>
        </>
      ) : activeLayer === 'node' ? (
        // Sensor-status dots only make sense for the Node layer (each dot IS
        // a sensor). Himawari also has no colorRamp (it's a raw JMA tile
        // image, not our own value scale) but must not fall into this
        // branch — there's no sensor status to show for a satellite image.
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
          {NODE_STATUS_ITEMS.map((item) => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}

      {metric.legendNote && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
          {metric.legendNote}
        </Typography>
      )}

      {activeLayer === 'rain' && showCoverage && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, pt: 1, borderTop: '1px solid var(--nirmala-glass-border)' }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', background: 'linear-gradient(135deg, #14466e, #40b4cd)', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.3 }}>
            Jaringan sensor aktif (tidak hujan)
          </Typography>
        </Box>
      )}
    </Box>
  );
}
