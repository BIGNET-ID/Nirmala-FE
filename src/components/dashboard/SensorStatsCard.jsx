import { Box, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};
function Row({ icon, color, label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Icon icon={icon} width={16} style={{ color }} />
      <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, fontSize: '0.8rem' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, color, fontSize: '0.85rem' }}>
        {value.toLocaleString('id-ID')}
      </Typography>
    </Box>
  );
}

/** Bare stats content — shared by the desktop floating card and the mobile bottom sheet. */
export function SensorStatsCardContent({ stats }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ ...eyebrowSx, mb: 0.25 }}>Statistik Sensor</Typography>
      <Row icon="material-symbols:sensors-rounded" color="var(--color-text)" label="Total" value={stats.total} />
      <Row icon="material-symbols:check-circle-rounded" color="#34d399" label="Aktif" value={stats.active} />
      <Row icon="material-symbols:rainy-rounded" color="#60a5fa" label="Hujan" value={stats.raining} />
      <Row icon="material-symbols:block-rounded" color="#ef4444" label="Blacklist" value={stats.blacklist} />
    </Box>
  );
}

/** Desktop/tablet-landscape floating card (no self-positioning — the parent controls placement). */
export default function SensorStatsCard({ stats }) {
  return (
    <Box
      sx={{
        p: 1.75,
        width: 218,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <SensorStatsCardContent stats={stats} />
    </Box>
  );
}
