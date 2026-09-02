'use client';

import { useState } from 'react';
import { Box, Fab, SwipeableDrawer, Badge } from '@mui/material';
import { Icon } from '@iconify/react';
import { SkySegmentContent, GroundSegmentContent } from '@/components/dashboard/SegmentTogglePanel';
import { ColorRampLegendContent } from '@/components/dashboard/ColorRampLegend';
import { SensorStatsCardContent } from '@/components/dashboard/SensorStatsCard';

const SUB_TABS = [
  { key: 'sky', label: 'Sky', icon: 'material-symbols:satellite-alt-rounded' },
  { key: 'ground', label: 'Ground', icon: 'material-symbols:sensors-rounded' },
  { key: 'stats', label: 'Stats', icon: 'material-symbols:bar-chart-rounded' },
  { key: 'legend', label: 'Legend', icon: 'material-symbols:palette-rounded' },
];

/**
 * Compact-mode (< lg / 1200px) replacement for the three desktop floating
 * panels (SegmentTogglePanel, ColorRampLegend, SensorStatsCard) — a phone
 * screen has no room for three ~220-280px-wide boxes side by side, so their
 * content is combined into one swipeable bottom sheet, reached via a FAB.
 * Default closed: the map stays the visual focus until the user asks for
 * controls, matching the Google Maps/Gojek bottom-sheet pattern.
 */
export default function MobileControlSheet({ segmentProps, legendProps, statsProps }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('sky');

  return (
    <>
      <Fab
        onClick={() => setOpen(true)}
        aria-label="Open map controls"
        sx={{
          position: 'absolute',
          right: 16,
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          zIndex: 'var(--z-overlay, 100)',
          width: 56,
          height: 56,
          bgcolor: 'var(--nirmala-glass-bg)',
          color: 'var(--nirmala-cyan)',
          border: '1px solid var(--nirmala-glass-border)',
          boxShadow: 'none',
          '&:hover': { bgcolor: 'var(--nirmala-cyan-dim)' },
        }}
      >
        <Badge color="info" variant="dot" invisible={!open}>
          <Icon icon="material-symbols:layers-rounded" width={24} />
        </Badge>
      </Fab>

      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        disableSwipeToOpen
        // Matches the Paper's own --z-modal below — without this, the
        // Modal root (backdrop included) sits at MUI's default drawer
        // z-index (1200) instead, an inconsistency with no visible effect
        // today but a latent trap for future stacking bugs.
        sx={{ zIndex: 'var(--z-modal, 1400)' }}
        slotProps={{
          paper: {
            sx: {
              zIndex: 'var(--z-modal, 1400)',
              maxHeight: '75vh',
              bgcolor: 'var(--nirmala-glass-bg)',
              backgroundImage: 'none',
              borderTop: '1px solid var(--nirmala-glass-border)',
              borderTopLeftRadius: 'var(--radius-lg, 12px)',
              borderTopRightRadius: 'var(--radius-lg, 12px)',
              pb: 'env(safe-area-inset-bottom)',
            },
          },
        }}
      >
        {/* Grab handle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 999, bgcolor: 'var(--nirmala-glass-border)' }} />
        </Box>

        {/* Sub-tabs — horizontally scrollable so 4 tabs stay comfortably
            sized on narrow phones instead of being squeezed to fit. */}
        <Box sx={{ display: 'flex', gap: 0.5, px: 2, pt: 1.5, pb: 1, overflowX: 'auto' }}>
          {SUB_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Box
                key={t.key}
                onClick={() => setTab(t.key)}
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.6,
                  height: 44,
                  px: 1.75,
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
                  background: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
                  border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
                }}
              >
                <Icon icon={t.icon} width={16} />
                {t.label}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ px: 2, pb: 3, overflowY: 'auto' }}>
          {tab === 'sky' && <SkySegmentContent {...segmentProps} />}
          {tab === 'ground' && <GroundSegmentContent {...segmentProps} />}
          {tab === 'stats' && <SensorStatsCardContent {...statsProps} />}
          {tab === 'legend' && <ColorRampLegendContent {...legendProps} />}
        </Box>
      </SwipeableDrawer>
    </>
  );
}
