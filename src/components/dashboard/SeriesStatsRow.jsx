'use client';

import { Box, Typography } from '@mui/material';

/** Min/Max/Average/Last stats for one chart's data points. */
function computeStats(data) {
  const clean = (data || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!clean.length) return null;
  const sum = clean.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...clean),
    max: Math.max(...clean),
    avg: sum / clean.length,
    last: clean[clean.length - 1],
  };
}

const cellSx = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 0.25,
};

function Cell({ label, value, unit }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={cellSx}>{label}</Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>
        {value != null ? `${value.toFixed(2)}${unit ? ` ${unit}` : ''}` : '—'}
      </Typography>
    </Box>
  );
}

/** Compact 4-cell stats row (Min/Max/Average/Last) below a chart. */
export default function SeriesStatsRow({ data, unit }) {
  const stats = computeStats(data);
  return (
    <Box sx={{
      display: 'flex', mt: 1, pt: 1,
      borderTop: '1px solid var(--nirmala-glass-border)',
    }}>
      <Cell label="Min" value={stats?.min} unit={unit} />
      <Cell label="Max" value={stats?.max} unit={unit} />
      <Cell label="Average" value={stats?.avg} unit={unit} />
      <Cell label="Last" value={stats?.last} unit={unit} />
    </Box>
  );
}
