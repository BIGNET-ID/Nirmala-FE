import { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import ProvinceFilterSelect from '@/components/dashboard/ProvinceFilterSelect';

// Same square-glass-icon-button styling as MapControls.jsx — kept as its
// own copy (not imported) since the two clusters are intentionally
// independent: this one must stay visible even when the user hides
// MapControls via the show/hide-all toggle below.
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

/**
 * Floating icon-button cluster above the map: province search (opens a
 * small popover instead of a persistent bar — see ProvinceFilterSelect),
 * fullscreen, and the show/hide-all-controls master toggle. Horizontal row,
 * square buttons. Deliberately separate from MapControls (zoom/reset) and
 * from ThemeToggleControl (top-left) — this cluster is never hidden by its
 * own show/hide-all toggle, so the operator always has a way back to a
 * full UI, and province search always stays reachable.
 */
export default function MapExtrasCluster({
  fullscreenTargetRef, controlsVisible, onToggleControlsVisible,
  selectedProvinceCode, onSelectProvinceCode, matchedProvinceStations,
}) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const size = isCompact ? 44 : isWallTV ? 44 : 38;
  const btnSx = makeBtnSx(size);
  const iconWidth = isWallTV ? 22 : undefined;

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleFullscreenToggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      fullscreenTargetRef?.current?.requestFullscreen?.();
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        top: 16,
        zIndex: 'var(--z-overlay, 1300)',
        display: 'flex',
        flexDirection: 'row',
        gap: 1,
      }}
    >
      <ProvinceFilterSelect
        selectedCode={selectedProvinceCode}
        onSelectCode={onSelectProvinceCode}
        matched={matchedProvinceStations}
        btnSx={btnSx}
        iconWidth={iconWidth}
      />

      <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} placement="bottom">
        <IconButton onClick={handleFullscreenToggle} sx={btnSx} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          <Icon icon={isFullscreen ? 'material-symbols:fullscreen-exit-rounded' : 'material-symbols:fullscreen-rounded'} width={iconWidth} />
        </IconButton>
      </Tooltip>
      <Tooltip title={controlsVisible ? 'Hide controls & legend' : 'Show controls & legend'} placement="bottom">
        <IconButton onClick={onToggleControlsVisible} sx={btnSx} aria-label={controlsVisible ? 'Hide controls and legend' : 'Show controls and legend'}>
          <Icon icon={controlsVisible ? 'material-symbols:visibility-off-rounded' : 'material-symbols:visibility-rounded'} width={iconWidth} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
