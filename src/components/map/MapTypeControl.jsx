'use client';

import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const SEGMENTS = [
  { id: 'roadmap', label: 'Default map', icon: 'material-symbols:map-rounded' },
  { id: 'satellite', label: 'Satellite', icon: 'material-symbols:satellite-alt-rounded' },
  { id: 'outline', label: 'Outline', icon: 'material-symbols:map-outline-rounded' },
];

/**
 * Bottom-left map-type switcher — Default (roadmap) / Satellite / Outline
 * (a minimal line-only style, following whichever light/dark theme is
 * active). Vertical-pill shape mirrors ThemeToggleControl (a single-active-
 * of-N selector), not MapControls' stack of one-shot action buttons — this
 * is a persistent selection, not a fire-once action. Deliberately separate
 * from ThemeToggleControl (top-left): this control only switches map TYPE,
 * it is not a second place to change light/dark theme.
 */
export default function MapTypeControl({ mapType, onChange }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;

  const segmentSx = (active) => ({
    width: size,
    height: size,
    borderRadius: 'var(--radius-md, 8px)',
    color: active ? '#fff' : 'var(--color-text-muted)',
    bgcolor: active ? 'var(--nirmala-cyan)' : 'transparent',
    transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard)',
    '&:hover': { bgcolor: active ? 'var(--nirmala-cyan)' : 'var(--nirmala-cyan-dim)' },
    '&.Mui-focusVisible': { outline: '2px solid var(--nirmala-cyan)', outlineOffset: '2px' },
  });

  return (
    <Box
      sx={{
        position: 'absolute', left: 16, bottom: 16, zIndex: 'var(--z-overlay, 100)',
        display: 'flex', flexDirection: 'column', gap: 0.25, p: 0.25,
        border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-lg, 12px)',
        bgcolor: 'var(--nirmala-glass-bg)',
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = mapType === seg.id;
        return (
          <Tooltip key={seg.id} title={seg.label} placement="right">
            <IconButton
              onClick={() => onChange(seg.id)}
              aria-pressed={active}
              aria-label={seg.label}
              disableRipple
              sx={segmentSx(active)}
            >
              <Icon icon={seg.icon} width={isWallTV ? 22 : undefined} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
