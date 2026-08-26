import { Box, IconButton, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

/**
 * Live Timestamp Badge (PRD §4.1) — shows when the Current tab's active
 * mode last actually synced data. Never shows a fake or stale time:
 * `timestamp == null` (no data yet, or Himawari's fallback probing found
 * nothing published) renders nothing rather than a placeholder dash.
 *
 * Dismissible via `onClose`, but never auto-hides on a timer — same
 * reasoning as MapInfoPill.jsx: this is ongoing status, not a one-off
 * toast, so a fixed-time disappearance would work against WCAG 2.2.1
 * Timing Adjustable. The parent owns re-showing it (e.g. on mode/tab
 * change); this component only reports the dismiss intent.
 */
export default function LiveTimestampBadge({ label, timestamp, onClose }) {
  if (!timestamp) return null;

  const formatted = timestamp.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 112,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-overlay, 100)',
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 0.75,
        pl: 1.5,
        pr: onClose ? 0.5 : 1.5,
        py: 0.5,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Icon icon="material-symbols:schedule-rounded" width={14} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {label} · diperbarui{' '}
        <Box component="span" sx={{ fontFamily: 'var(--font-family-mono)', color: 'text.primary', fontWeight: 700 }}>
          {formatted}
        </Box>{' '}
        WIB
      </Typography>
      {onClose && (
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Tutup"
          sx={{ p: 0.5, color: 'text.secondary', flexShrink: 0, '&:hover': { color: 'text.primary' } }}
        >
          <Icon icon="material-symbols:close-rounded" width={13} />
        </IconButton>
      )}
    </Box>
  );
}
