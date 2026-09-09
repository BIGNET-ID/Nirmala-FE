'use client';

import { Box, Typography } from '@mui/material';

/** Min/Max/Average/Last stats for one chart's data points. */
function computeStats(data) {
  const clean = (data || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!clean.length) return null;
  const sum = clean.reduce((a, b) => a + b, 0);
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const avg = sum / clean.length;
  return {
    min, max, avg,
    last: clean[clean.length - 1],
    // Sum of Min+Max+Avg, not a real physical "total rainfall" figure (that
    // would be the sum of the whole raw series) — labeled and titled below
    // to make clear what this number actually is, per the requested
    // definition.
    accumulated: min + max + avg,
  };
}

const cellSx = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 0.25,
  whiteSpace: 'nowrap',
};

// Unit isn't repeated per-cell (was crowding out the label at narrow
// widths, e.g. inside SensorDetailDrawer's ~288px content area) — the
// section title above this row already states it once ("Rainfall · mm
// (5 min)"), so a bare number here isn't ambiguous.
function Cell({ label, value, title }) {
  return (
    <Box sx={{ minWidth: 0 }} title={title}>
      <Typography sx={cellSx}>{label}</Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
        {value != null ? value.toFixed(2) : '—'}
      </Typography>
    </Box>
  );
}

/**
 * Compact stats row (Min/Max/Avg/Last, +Accum. when `showAccumulated`)
 * below a chart. Accumulated only makes sense for rainfall (the metric
 * users actually want a running total for) — pass `showAccumulated` at
 * the rainfall call sites only, not for signal/other series.
 *
 * Grid with `auto-fit` (not a fixed flex row) so cells wrap into a 3+2
 * layout at narrow widths (e.g. SensorDetailDrawer's ~288px content area)
 * instead of 5 equal-width columns squeezing "Average"'s label into its
 * neighbors — while still laying out as a single row wherever there's
 * enough width (e.g. SparklineOverviewDialog).
 */
export default function SeriesStatsRow({ data, showAccumulated }) {
  const stats = computeStats(data);
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(52px, 1fr))',
      columnGap: 1.25, rowGap: 0.75, mt: 1, pt: 1,
      borderTop: '1px solid var(--nirmala-glass-border)',
    }}>
      <Cell label="Min" value={stats?.min} />
      <Cell label="Max" value={stats?.max} />
      <Cell label="Avg" value={stats?.avg} />
      <Cell label="Last" value={stats?.last} />
      {showAccumulated && (
        <Cell
          label="Accum."
          value={stats?.accumulated}
          title="Sum of Min + Max + Avg — not a measured total rainfall figure"
        />
      )}
    </Box>
  );
}
