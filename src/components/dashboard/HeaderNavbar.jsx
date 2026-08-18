import { Box, Typography, Chip, IconButton, Avatar } from '@mui/material';
import { Icon } from '@iconify/react';

export default function HeaderNavbar({ stationCount = 0 }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2.25,
        py: 1.2,
        minHeight: 66,
        backdropFilter: 'blur(18px)',
        background: 'linear-gradient(180deg, rgba(9, 17, 30, 0.86), rgba(8, 13, 26, 0.78))',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        borderRadius: 3.5,
        boxShadow: '0 12px 24px rgba(2, 6, 23, 0.34), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          sx={{
            bgcolor: 'rgba(0, 229, 255, 0.18)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            color: '#7dd3fc',
            width: 34,
            height: 34,
            boxShadow: '0 0 12px rgba(0, 229, 255, 0.18)',
          }}
        >
          <Icon icon="solar:cloud-waterdrops-bold-duotone" width="20" />
        </Avatar>
        <Box>
          <Typography variant="h6" fontWeight={800} lineHeight={1} letterSpacing={0.5}>NIRMALA</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.02em' }}>
            Geospatial Weather & Telemetry Radar
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Chip
          icon={<Icon icon="solar:radar-bold" color="#00e5ff" />}
          label={`Active Sensor Nodes (${stationCount})`}
          variant="outlined"
          size="small"
          sx={{
            borderColor: 'rgba(0, 229, 255, 0.35)',
            background: 'rgba(15, 23, 42, 0.4)',
            color: '#e2f8ff',
            height: 32,
            '& .MuiChip-label': { px: 1.1, fontWeight: 600 },
          }}
        />
        <IconButton color="inherit" sx={{ bgcolor: 'rgba(15, 23, 42, 0.32)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Icon icon="solar:bell-bing-bold-duotone" width="20" />
        </IconButton>
        <IconButton color="inherit" sx={{ bgcolor: 'rgba(15, 23, 42, 0.32)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Icon icon="solar:user-circle-bold-duotone" width="22" />
        </IconButton>
      </Box>
    </Box>
  );
}