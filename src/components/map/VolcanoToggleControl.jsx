'use client';

import { IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { MAP_CONTROLS_HEIGHT } from '@/components/map/MapControls';

/**
 * Standalone volcano-layer toggle — top-right, stacked directly below
 * MapControls' zoom/reset column (right:16, same button size), rather than
 * bottom-right where it used to visually collide with the Rain Density
 * legend/sensor-stats cards there. Independent of Sky/Ground segment
 * state (like Wind particles), since volcanoes aren't sky- or ground-
 * segment-specific data — a standalone control fits better than a new
 * SegmentTogglePanel vendor card.
 *
 * Same square-button chrome as MapControls (size/radius/glass bg+border),
 * but since this is a persistent on/off state rather than a momentary
 * action, it gets MapTypeControl's active-state treatment: solid cyan fill
 * when on, muted icon on glass when off — reusing that existing visual
 * pattern rather than inventing a new one.
 */
export default function VolcanoToggleControl({ active, onChange }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;
  // MapExtrasCluster's row (top:16, height `size`) + its own top gap, then
  // MapControls' own stack height (imported so this never drifts out of
  // sync with that component's internal layout), then one more gap before
  // this button.
  const top = 16 + size + 16 + MAP_CONTROLS_HEIGHT(isCompact, isWallTV) + 16;

  return (
    <Tooltip title={active ? 'Hide volcanoes' : 'Show volcanoes'} placement="left">
      <IconButton
        onClick={() => onChange(!active)}
        aria-pressed={active}
        aria-label={active ? 'Hide volcanoes' : 'Show volcanoes'}
        disableRipple
        sx={{
          position: 'absolute', right: 16, top, zIndex: 'var(--z-overlay, 100)',
          width: size, height: size,
          borderRadius: 'var(--radius-md, 8px)',
          color: active ? '#fff' : 'text.primary',
          bgcolor: active ? 'var(--nirmala-cyan)' : 'var(--nirmala-glass-bg)',
          border: `1px solid ${active ? 'var(--nirmala-cyan)' : 'var(--nirmala-glass-border)'}`,
          transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard), border-color var(--duration-fast, 150ms) var(--ease-standard)',
          '&:hover': { bgcolor: active ? 'var(--nirmala-cyan)' : 'var(--nirmala-cyan-dim)', color: active ? '#fff' : 'var(--nirmala-cyan)' },
          '&.Mui-focusVisible': { outline: '2px solid var(--nirmala-cyan)', outlineOffset: '2px' },
        }}
      >
        <Icon icon="fa6-solid:volcano" width={isWallTV ? 20 : 17} />
      </IconButton>
    </Tooltip>
  );
}
