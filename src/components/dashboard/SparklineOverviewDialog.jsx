'use client';

import { Box, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import Sparkline from '@/components/common/Sparkline';
import SeriesStatsRow from '@/components/dashboard/SeriesStatsRow';

export default function SparklineOverviewDialog({ open, onClose, stationId, rain, signal, rainBuckets, signalBuckets, rainRangeStart, rainRangeEnd, signalRangeStart, signalRangeEnd }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      // Nests on top of SensorDetailDrawer (--z-modal, 1400) — needs a higher
      // z-index or its own paper renders behind the drawer, making the close
      // button (and everything else) unclickable.
      sx={{ zIndex: 1450 }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'var(--nirmala-glass-bg)',
            border: '1px solid var(--nirmala-glass-border)',
            backgroundImage: 'none',
          },
        },
      }}
    >
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}>
              Overview
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {stationId}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <Icon icon="material-symbols:close-rounded" />
          </IconButton>
        </Box>

        <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', display: 'block', mb: 1.5 }}>
          Last hour of data
        </Typography>

        <Stack spacing={3}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>Rainfall · mm (5 min)</Typography>
            <Sparkline data={rain?.data || []} labels={rain?.labels} variant="area" color="var(--rain-3)" height={220}
              rangeStart={rainRangeStart} rangeEnd={rainRangeEnd} buckets={rainBuckets} />
            <SeriesStatsRow data={rain?.data} unit="mm" />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
              Signal{signal?.label ? ` · ${signal.label}` : ''}
            </Typography>
            <Sparkline data={signal?.data || []} labels={signal?.labels} variant="area" color="var(--nirmala-cyan)" height={220}
              rangeStart={signalRangeStart} rangeEnd={signalRangeEnd} buckets={signalBuckets} />
            <SeriesStatsRow data={signal?.data} />
          </Box>
        </Stack>
      </Box>
    </Dialog>
  );
}
