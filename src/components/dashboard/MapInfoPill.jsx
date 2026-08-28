import { Box, IconButton, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const numSx = { fontWeight: 700 };

/**
 * Contextual info pill, top-centre over the map. Summarises the active layer
 * (rain density) using real counts — no fabricated values.
 *
 * Dismissible via `onClose`, but never auto-hides on a timer: this is
 * ongoing status (how many sensors report rain right now), not a one-off
 * toast — a fixed-time disappearance would silently remove information a
 * user might still be reading (WCAG 2.2.1 Timing Adjustable exists for
 * exactly this reason). If `onClose` is provided, the parent owns
 * re-showing it (e.g. on mode/tab change) — this component only reports
 * the dismiss intent.
 */
export default function MapInfoPill({ raining, total, loading, onClose }) {
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
        pl: { xs: 1.25, sm: 1.75 },
        pr: onClose ? 0.5 : { xs: 1.25, sm: 1.75 },
        py: { xs: 0.5, sm: 0.75 },
        maxWidth: 'min(420px, calc(100vw - 32px))',
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Icon icon="material-symbols:rainy-rounded" width={16} style={{ color: '#60a5fa', flexShrink: 0 }} />
      <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.78rem' }, color: 'text.primary', whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>
        {loading ? (
          'Memuat data sensor…'
        ) : (
          <>
            Kerapatan Hujan · <Box component="span" sx={{ ...numSx, color: '#60a5fa' }}>{raining.toLocaleString('id-ID')}</Box>
            {' '}dari <Box component="span" sx={numSx}>{total.toLocaleString('id-ID')}</Box> sensor melapor hujan
          </>
        )}
      </Typography>
      {onClose && (
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Tutup"
          sx={{ p: 0.5, color: 'text.secondary', flexShrink: 0, '&:hover': { color: 'text.primary' } }}
        >
          <Icon icon="material-symbols:close-rounded" width={14} />
        </IconButton>
      )}
    </Box>
  );
}
