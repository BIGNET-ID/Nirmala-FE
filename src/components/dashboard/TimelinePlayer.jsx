import { Box, IconButton, Slider, Typography } from '@mui/material';
import { Icon } from '@iconify/react';

export default function TimelinePlayer({ timeStep, isPlaying, onTogglePlay, onTimeChange }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        px: 2.4,
        py: 1.25,
        width: 'min(820px, calc(100% - 36px))',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        backdropFilter: 'blur(18px)',
        background: 'linear-gradient(180deg, rgba(8, 14, 25, 0.88), rgba(9, 16, 29, 0.78))',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        borderRadius: 3.5,
        boxShadow: '0 12px 20px rgba(2, 6, 23, 0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <IconButton
        color="primary"
        onClick={onTogglePlay}
        sx={{
          bgcolor: 'rgba(0, 229, 255, 0.12)',
          border: '1px solid rgba(0, 229, 255, 0.28)',
          width: 38,
          height: 38,
          '&:hover': { bgcolor: 'rgba(0, 229, 255, 0.18)' },
        }}
      >
        <Icon icon={isPlaying ? 'solar:pause-bold' : 'solar:play-bold'} width="22" />
      </IconButton>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.05em' }}>
            Simulasi Forecast Telemetri
          </Typography>
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.08em' }}>
            {String(timeStep).padStart(2, '0')}:00 WIB
          </Typography>
        </Box>
        <Slider
          value={timeStep}
          min={0}
          max={24}
          step={1}
          onChange={(_, val) => onTimeChange(val)}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}:00`}
          sx={{
            color: '#00e5ff',
            '& .MuiSlider-thumb': {
              width: 14,
              height: 14,
              border: '2px solid rgba(0,229,255,0.7)',
            },
            '& .MuiSlider-track': { height: 4 },
            '& .MuiSlider-rail': { opacity: 0.35 },
          }}
        />
      </Box>
    </Box>
  );
}