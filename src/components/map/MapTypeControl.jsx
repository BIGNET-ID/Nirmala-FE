'use client';

import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// Each swatch's colors are pulled from (or stylized after) this app's own
// map styling — GoogleMapWrapper.jsx's MAP_STYLE_LIGHT land/water tones for
// Default, a stylized dark green/navy pairing standing in for real
// satellite imagery (which can't be reproduced in CSS) for Satellite. The
// hard 2-tone split (not a soft blend) reads as a tiny map preview — land +
// water — rather than a decorative gradient.
//
// "Outline" mode's button is hidden here (not removed from
// GoogleMapWrapper.jsx, which still supports mapType='outline') — its
// coastlines can't be stroked via Google's declarative styling (see
// project memory: overlayview-onadd-never-fired / the coastline-overlay
// deferral), so land/water were only distinguishable by flat fill
// contrast, and the user asked to hide the button until that's revisited.
const SEGMENTS = [
  {
    id: 'roadmap', label: 'Default map', icon: 'material-symbols:map-rounded',
    swatch: 'linear-gradient(135deg, #eef2f7 62%, #cdd9e8 62%)', iconColor: '#3f4a58',
  },
  {
    id: 'satellite', label: 'Satellite', icon: 'material-symbols:satellite-alt-rounded',
    swatch: 'linear-gradient(135deg, #1b2e1f 55%, #0c1b2e 55%)', iconColor: '#eef2f7',
  },
];

/**
 * Bottom-left map-type switcher — Default (roadmap) / Satellite (Outline
 * hidden for now, see comment on SEGMENTS above). Horizontal row of themed
 * swatch chips (each tinted toward what that map type actually looks like,
 * per the comment above), following whichever light/dark theme is active
 * for the chrome around them. Deliberately separate from
 * ThemeToggleControl (top-left): this control only switches map TYPE, it
 * is not a second place to change light/dark theme.
 *
 * Kept deliberately short (a single row, not the earlier 3-segment vertical
 * stack) — its height feeds directly into how much vertical room the
 * Space/Ground segment panel gets above it (see MAP_TYPE_CONTROL_HEIGHT and
 * page.jsx's panel bottom-inset) — a taller control here previously caused
 * that panel to run out of room and visually overlap it when its own
 * content grew tall (e.g. Himawari + Wind mode active together).
 */
export function MAP_TYPE_CONTROL_HEIGHT(isWallTV) {
  const size = isWallTV ? 44 : 38;
  return size + 6; // + 0.25 (2px) padding top/bottom + 1px border top/bottom
}

export default function MapTypeControl({ mapType, onChange }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;
  const width = Math.round(size * 1.6);

  const segmentSx = (active, swatch) => ({
    width, height: size,
    borderRadius: 'var(--radius-md, 8px)',
    background: swatch,
    color: 'inherit',
    border: `2px solid ${active ? 'var(--nirmala-cyan)' : 'transparent'}`,
    boxSizing: 'border-box',
    opacity: active ? 1 : 0.75,
    transition: 'opacity var(--duration-fast, 150ms) var(--ease-standard), border-color var(--duration-fast, 150ms) var(--ease-standard)',
    '&:hover': { opacity: 1 },
    '&.Mui-focusVisible': { outline: '2px solid var(--nirmala-cyan)', outlineOffset: '2px' },
  });

  return (
    <Box
      role="group"
      aria-label="Map type"
      sx={{
        position: 'absolute', left: 16, bottom: 16, zIndex: 'var(--z-overlay, 100)',
        display: 'flex', flexDirection: 'row', gap: 0.5, p: 0.25,
        border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-lg, 12px)',
        bgcolor: 'var(--nirmala-glass-bg)',
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = mapType === seg.id;
        return (
          <Tooltip key={seg.id} title={seg.label} placement="top">
            <IconButton
              onClick={() => onChange(seg.id)}
              aria-pressed={active}
              aria-label={seg.label}
              disableRipple
              sx={segmentSx(active, seg.swatch)}
            >
              <Icon icon={seg.icon} width={isWallTV ? 20 : 17} style={{ color: seg.iconColor }} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
