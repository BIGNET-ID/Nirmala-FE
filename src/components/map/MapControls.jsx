import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// 44×44 meets the WCAG/touch-target minimum on phones/tablets; desktop
// pointers don't need it, so the smaller 38px box stays for lg+ (mouse).
function makeBtnSx(size) {
  return {
    width: size,
    height: size,
    color: 'text.primary',
    bgcolor: 'var(--nirmala-glass-bg)',
    border: '1px solid var(--nirmala-glass-border)',
    borderRadius: 'var(--radius-md, 8px)',
    transition: 'background var(--duration-fast, 150ms) var(--ease-standard)',
    '&:hover': { bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)' },
  };
}

export default function MapControls({ onZoomIn, onZoomOut, onReset }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;
  const btnSx = makeBtnSx(size);
  // Sits below MapExtrasCluster.jsx's horizontal row (also right:16,
  // top:16, same button size), so the two floating clusters never overlap.
  const top = 16 + size + 16;

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        top,
        zIndex: 'var(--z-overlay, 100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Tooltip title="Zoom in" placement="left">
        <IconButton onClick={onZoomIn} sx={btnSx} aria-label="Zoom in">
          <Icon icon="material-symbols:add-rounded" width={isWallTV ? 22 : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom out" placement="left">
        <IconButton onClick={onZoomOut} sx={btnSx} aria-label="Zoom out">
          <Icon icon="material-symbols:remove-rounded" width={isWallTV ? 22 : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip title="National view" placement="left">
        <IconButton onClick={onReset} sx={btnSx} aria-label="Reset view">
          <Icon icon="material-symbols:my-location-rounded" width={isWallTV ? 22 : undefined} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
