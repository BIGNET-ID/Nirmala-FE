import { Box, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';

export default function MapControls({ onZoomIn, onZoomOut, onReset }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Tooltip title="Zoom In" placement="left">
        <IconButton
          onClick={onZoomIn}
          sx={{
            width: 38,
            height: 38,
            bgcolor: 'rgba(8, 14, 25, 0.84)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            boxShadow: '0 10px 18px rgba(2, 6, 23, 0.24)',
            '&:hover': { bgcolor: 'rgba(10, 18, 34, 0.94)' },
          }}
        >
          <Icon icon="solar:add-circle-bold-duotone" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom Out" placement="left">
        <IconButton
          onClick={onZoomOut}
          sx={{
            width: 38,
            height: 38,
            bgcolor: 'rgba(8, 14, 25, 0.84)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            boxShadow: '0 10px 18px rgba(2, 6, 23, 0.24)',
            '&:hover': { bgcolor: 'rgba(10, 18, 34, 0.94)' },
          }}
        >
          <Icon icon="solar:minus-circle-bold-duotone" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Reset View" placement="left">
        <IconButton
          onClick={onReset}
          sx={{
            width: 38,
            height: 38,
            bgcolor: 'rgba(8, 14, 25, 0.84)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            boxShadow: '0 10px 18px rgba(2, 6, 23, 0.24)',
            '&:hover': { bgcolor: 'rgba(10, 18, 34, 0.94)' },
          }}
        >
          <Icon icon="solar:home-bold-duotone" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}