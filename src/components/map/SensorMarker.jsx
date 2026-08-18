import { Box, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

const getRainColor = (val) => {
  if (val < 5) return '#94a3b8';
  if (val < 25) return '#00e5ff';
  if (val < 50) return '#00e676';
  if (val < 75) return '#ffeb3b';
  if (val < 100) return '#ff9800';
  return '#f44336';
};

export default function SensorMarker({ station, activeLayer, onClick }) {
  const value = activeLayer === 'rain' ? station.rain : station.temp;
  const color = activeLayer === 'rain' ? getRainColor(station.rain) : '#00e5ff';
  const unit = activeLayer === 'rain' ? 'mm/j' : '°C';

  return (
    <Tooltip title={station.name} placement="top">
      <Box
        onClick={() => onClick?.(station)}
        sx={{
          position: 'absolute',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          transform: 'translate(-50%, -50%)',
          '&:hover': { zIndex: 200 },
        }}
      >
        <Box
          sx={{
            width: 36, height: 36, borderRadius: '50%',
            border: `2px solid ${color}`,
            bgcolor: `${color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 12px ${color}88`,
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': { boxShadow: `0 0 0 0 ${color}44` },
              '70%': { boxShadow: `0 0 0 10px ${color}00` },
              '100%': { boxShadow: `0 0 0 0 ${color}00` },
            },
          }}
        >
          <Icon icon="solar:radar-bold" color={color} width="18" />
        </Box>
        <Box sx={{ bgcolor: 'rgba(5,8,23,0.85)', border: `1px solid ${color}44`, borderRadius: 1, px: 0.75, py: 0.25, mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.65rem', color, fontWeight: 700 }}>
            {value} {unit}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
}