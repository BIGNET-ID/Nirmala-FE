import { Box, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useThemeMode } from '@/context/ThemeModeContext';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

/**
 * Light/dark mode toggle — floating top-left of the map, mirroring
 * MapControls/MapExtrasCluster's top-right positioning. Kept as its own
 * standalone control (not grouped with fullscreen/search/show-hide) per
 * design direction. Two-segment pill shows both sun and moon at once, with
 * the active mode's segment filled — clicking anywhere toggles.
 */
export default function ThemeToggleControl() {
  const { mode, toggle } = useThemeMode();
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;
  const isDark = mode === 'dark';

  const segmentSx = (active) => ({
    width: size,
    height: size,
    borderRadius: 'var(--radius-md, 8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: active ? '#fff' : 'var(--color-text-muted)',
    bgcolor: active ? 'var(--nirmala-cyan)' : 'transparent',
    transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard)',
  });

  return (
    <Box sx={{ position: 'absolute', left: 16, top: 16, zIndex: 'var(--z-overlay, 1300)' }}>
      <Tooltip title={isDark ? 'Light mode' : 'Dark mode'} placement="right">
        <Box
          component="button"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            p: 0.25,
            border: '1px solid var(--nirmala-glass-border)',
            borderRadius: 'var(--radius-lg, 12px)',
            bgcolor: 'var(--nirmala-glass-bg)',
            cursor: 'pointer',
            appearance: 'none',
            font: 'inherit',
          }}
        >
          <Box sx={segmentSx(!isDark)}>
            <Icon icon="material-symbols:light-mode-rounded" width={size * 0.55} />
          </Box>
          <Box sx={segmentSx(isDark)}>
            <Icon icon="material-symbols:dark-mode-rounded" width={size * 0.5} />
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
}
