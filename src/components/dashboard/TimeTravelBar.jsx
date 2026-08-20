'use client';

import { Box, IconButton, Slider, Tooltip, Typography, CircularProgress } from '@mui/material';
import { Icon } from '@iconify/react';

const monoSx = { fontFamily: 'var(--font-family-mono)' };

function fmt(date) {
  if (!date) return '—';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Global time-travel control (bottom-center glass panel): Play/Pause + a
 * tick-index slider. Presentational only — the parent owns `ticks`/index
 * state and what each tick actually drives (historical rain heatmap vs
 * Himawari frames).
 */
export default function TimeTravelBar({
  ticks, index, isPlaying, onScrub, onPlayPause, onGoLive, loading, caveat,
}) {
  const live = index == null;
  const disabled = ticks.length < 2;
  const current = !live ? ticks[index]?.date : ticks[ticks.length - 1]?.date;

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-overlay, 100)',
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 1.25,
        width: 'min(640px, calc(100vw - 32px))',
        p: 1.25,
        pl: 1.5,
        backdropFilter: 'blur(20px)',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Tooltip title={isPlaying ? 'Pause' : 'Putar'} placement="top">
        <span>
          <IconButton
            onClick={onPlayPause}
            disabled={disabled || loading}
            size="small"
            sx={{ color: 'var(--nirmala-cyan)', bgcolor: 'var(--nirmala-cyan-dim)' }}
          >
            <Icon icon={isPlaying ? 'material-symbols:pause-rounded' : 'material-symbols:play-arrow-rounded'} />
          </IconButton>
        </span>
      </Tooltip>

      {loading ? (
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={16} sx={{ color: 'var(--nirmala-cyan)' }} />
        </Box>
      ) : (
        <Slider
          size="small"
          value={live ? ticks.length - 1 : index}
          min={0}
          max={Math.max(0, ticks.length - 1)}
          disabled={disabled}
          onChange={(_, v) => onScrub(v)}
          sx={{ flex: 1, color: 'var(--nirmala-cyan)' }}
        />
      )}

      <Typography variant="caption" sx={{ ...monoSx, minWidth: 108, textAlign: 'right', color: 'text.secondary' }}>
        {fmt(current)}
      </Typography>

      <Tooltip title="Kembali ke Live" placement="top">
        <span>
          <IconButton
            onClick={onGoLive}
            disabled={live}
            size="small"
            sx={{
              color: live ? 'var(--nirmala-cyan)' : 'text.secondary',
              border: '1px solid var(--nirmala-glass-border)',
            }}
          >
            <Icon icon="material-symbols:sensors-rounded" />
          </IconButton>
        </span>
      </Tooltip>

      {caveat && (
        <Typography
          variant="caption"
          sx={{ position: 'absolute', top: -20, left: 16, fontSize: 10, color: 'text.secondary' }}
        >
          {caveat}
        </Typography>
      )}
    </Box>
  );
}
