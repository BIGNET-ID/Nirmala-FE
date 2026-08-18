import { Box, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const monoSx = { fontFamily: 'var(--font-family-mono)', fontWeight: 700 };

/**
 * Contextual info pill, top-centre over the map. Summarises the active layer
 * (rain density) using real counts — no fabricated values.
 */
export default function MapInfoPill({ raining, total, loading }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-overlay, 100)',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.75,
        py: 0.75,
        maxWidth: 'min(420px, calc(100vw - 32px))',
        display: { xs: 'none', sm: 'flex' },
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Icon icon="material-symbols:rainy-rounded" width={16} style={{ color: '#60a5fa', flexShrink: 0 }} />
      <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.primary', whiteSpace: 'nowrap' }}>
        {loading ? (
          'Memuat data sensor…'
        ) : (
          <>
            Kerapatan Hujan · <Box component="span" sx={{ ...monoSx, color: '#60a5fa' }}>{raining.toLocaleString('id-ID')}</Box>
            {' '}dari <Box component="span" sx={monoSx}>{total.toLocaleString('id-ID')}</Box> sensor melapor hujan
          </>
        )}
      </Typography>
    </Box>
  );
}
