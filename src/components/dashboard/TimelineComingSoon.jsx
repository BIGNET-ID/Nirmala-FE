import { Box, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const ROADMAP_ITEMS = [
  { icon: 'material-symbols:play-circle-rounded', text: '24-Hour Interactive Slider dengan Play/Pause dan speed multiplier (1x, 2x, 4x)' },
  { icon: 'material-symbols:satellite-alt-rounded', text: 'Himawari 10-Minute Tick Sync — 144 frame per 24 jam (24 jam × 6 tick/jam)' },
  { icon: 'material-symbols:sync-alt-rounded', text: 'Temporal Layer Alignment — radar darat & sensor mengikuti posisi scrubber waktu' },
];

/**
 * Tab Timeline placeholder (PRD §4.6, Phase 2 roadmap). No playback engine
 * yet — the backend has no national historical snapshot endpoint (only
 * per-sensor /api/timeseries, see TimelinePlayer.jsx's own note). Kept as a
 * styled placeholder so PRD §4.1's Dual-Tab structure is visible now.
 */
export default function TimelineComingSoon() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          p: 4,
          textAlign: 'center',
          background: 'var(--nirmala-glass-bg)',
          border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-lg, 12px)',
        }}
      >
        <Icon icon="material-symbols:schedule-rounded" width={40} style={{ color: 'var(--nirmala-cyan)' }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1.5 }}>
          Fase 2 — Playback 24 Jam
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 2.5 }}>
          Tab Timeline sedang dalam roadmap pengembangan. Berikut yang akan dibangun:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, textAlign: 'left' }}>
          {ROADMAP_ITEMS.map((item) => (
            <Box key={item.text} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Icon icon={item.icon} width={18} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
                {item.text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
