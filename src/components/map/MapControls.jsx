import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';

const btnSx = {
  width: 38,
  height: 38,
  color: 'text.primary',
  bgcolor: 'var(--nirmala-glass-bg)',
  border: '1px solid var(--nirmala-glass-border)',
  backdropFilter: 'blur(20px)',
  borderRadius: 'var(--radius-md, 8px)',
  transition: 'background var(--duration-fast, 150ms) var(--ease-standard)',
  '&:hover': { bgcolor: 'rgba(0,229,255,0.10)', color: '#00e5ff' },
};

export default function MapControls({ onZoomIn, onZoomOut, onReset }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 16,
        top: 72,
        zIndex: 'var(--z-overlay, 100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Tooltip title="Perbesar" placement="left">
        <IconButton onClick={onZoomIn} sx={btnSx} aria-label="Perbesar">
          <Icon icon="material-symbols:add-rounded" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Perkecil" placement="left">
        <IconButton onClick={onZoomOut} sx={btnSx} aria-label="Perkecil">
          <Icon icon="material-symbols:remove-rounded" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Tampilan Nasional" placement="left">
        <IconButton onClick={onReset} sx={btnSx} aria-label="Reset tampilan">
          <Icon icon="material-symbols:my-location-rounded" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
