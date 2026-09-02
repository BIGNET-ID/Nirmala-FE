'use client';

import { Box, IconButton, Slider, Tooltip, Typography, CircularProgress, Autocomplete, TextField } from '@mui/material';
import { Icon } from '@iconify/react';

function fmt(date) {
  if (!date) return '—';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function dayLabel(date) {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
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
  const currentIndex = live ? ticks.length - 1 : index;
  const current = ticks[currentIndex]?.date;

  // Only group the jump-to-time dropdown by day when the range actually spans
  // more than one calendar day. Both time-travel modes can trigger this:
  // rain history (many days), and Himawari's ~24h rolling window, which
  // itself usually spans two calendar days (it crosses a UTC midnight).
  const spansMultipleDays = ticks.length > 1 && dayLabel(ticks[0].date) !== dayLabel(ticks[ticks.length - 1].date);
  const tickOptions = ticks.map((t, i) => ({ i, date: t.date }));
  const currentOption = tickOptions[currentIndex] ?? null;

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
        width: 'min(720px, calc(100vw - 32px))',
        p: 1.25,
        pl: 1.5,
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-full, 9999px)',
      }}
    >
      <Tooltip title={isPlaying ? 'Pause' : 'Play'} placement="top">
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

      <Autocomplete
        size="small"
        disablePortal
        disableClearable
        disabled={disabled}
        options={tickOptions}
        value={currentOption}
        groupBy={spansMultipleDays ? (o) => dayLabel(o.date) : undefined}
        getOptionLabel={(o) => fmt(o.date)}
        isOptionEqualToValue={(o, v) => o.i === v.i}
        onChange={(_, newValue) => { if (newValue) onScrub(newValue.i); }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            placeholder="Jump to a time..."
            slotProps={{ ...params.slotProps, input: { ...params.slotProps?.input, disableUnderline: true } }}
          />
        )}
        sx={{
          width: 176,
          '& .MuiInputBase-input': { fontSize: '0.75rem', color: 'text.secondary', textAlign: 'right' },
        }}
      />

      <Tooltip title="Back to Live" placement="top">
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
