'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Drawer, Typography, Divider, Chip, IconButton, Button, Stack, CircularProgress } from '@mui/material';
import { Icon } from '@iconify/react';
import Sparkline, { parseLabel } from '@/components/common/Sparkline';
import SparklineOverviewDialog from '@/components/dashboard/SparklineOverviewDialog';
import SeriesStatsRow from '@/components/dashboard/SeriesStatsRow';
import { nirmalaApiService, normalizeTimeseries } from '@/lib/nirmalaApi';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { statusBucket, SENSOR_STATUS_COLOR } from '@/lib/sensorColor';

const STATUS_META = {
  blacklisted: { label: 'Blacklist', color: SENSOR_STATUS_COLOR.blacklisted },
  inactive: { label: 'Inactive', color: SENSOR_STATUS_COLOR.inactive },
  unavailable: { label: 'Unavailable', color: SENSOR_STATUS_COLOR.unavailable },
  raining: { label: 'Raining', color: SENSOR_STATUS_COLOR.raining },
  active: { label: 'Active', color: SENSOR_STATUS_COLOR.active },
};

function statusMeta(st, now) {
  return STATUS_META[statusBucket(st, now)];
}

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};
function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function Meta({ label, value }) {
  return (
    <Box>
      <Typography sx={eyebrowSx}>{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

// How much history to request from the /latest endpoint — named so a future
// range picker only needs to change this one constant.
const LAST_HOUR_MINUTES = 60;

// Sparkline's default 120 buckets assumes a wide (multi-day) range where
// each bucket spans hours and is almost always populated. Squeezed into a
// 1-hour window, 120 buckets can be far narrower than the sensor's real
// reporting interval — a lone real point per bucket, surrounded by empty
// buckets, breaks a line/area chart into 1-point "segments" that render
// nothing at all (see Sparkline.jsx's segment drawing). Sizing buckets to
// roughly match the real point count keeps neighbouring readings in
// adjacent buckets so the line stays continuous, while genuine connectivity
// gaps still show as an honest break.
function bucketsForWindow(pointCount) {
  return Math.min(120, Math.max(4, pointCount));
}

export default function SensorDetailDrawer({ station, open, onClose }) {
  const { isCompact } = useResponsiveLayout();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open || !station?.id) { setSeries(null); return; }
    const myReq = ++reqId.current;
    setLoading(true);
    setSeries(null);
    nirmalaApiService
      .getLatestTimeseries(station.id, LAST_HOUR_MINUTES)
      .then((resp) => {
        if (myReq !== reqId.current) return; // stale
        setSeries(normalizeTimeseries(resp));
      })
      .catch(() => { if (myReq === reqId.current) setSeries(null); })
      .finally(() => { if (myReq === reqId.current) setLoading(false); });
  }, [open, station?.id]);

  if (!station) return null;
  const sm = statusMeta(station);
  const rain = series?.rain;
  const signal = series?.signal;

  // The /latest endpoint already windows each metric to the requested
  // minutes server-side, so the chart's range is simply the span of
  // whatever points actually came back — rain and signal can still cover
  // slightly different spans (independent reporting cadences), which is
  // fine since the two charts render stacked, not overlaid on one axis.
  const rangeOf = (labels) => {
    const times = labels.map(parseLabel).filter(Boolean).map((d) => d.getTime());
    if (!times.length) return { start: null, end: null };
    return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) };
  };
  const rainWindow = rain || { labels: [], data: [] };
  const signalWindow = signal || { labels: [], data: [] };
  const { start: rainRangeStart, end: rainRangeEnd } = rangeOf(rainWindow.labels);
  const { start: signalRangeStart, end: signalRangeEnd } = rangeOf(signalWindow.labels);

  const rainData = rainWindow.data;
  const signalData = signalWindow.data;
  const rainBuckets = bucketsForWindow(rainWindow.labels.length);
  const signalBuckets = bucketsForWindow(signalWindow.labels.length);
  const rainMax = rainData.length ? Math.max(...rainData) : null;

  return (
    <Drawer
      anchor={isCompact ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      sx={{ zIndex: 'var(--z-modal, 1400)' }}
      slotProps={{
        paper: {
          sx: isCompact
            ? {
                width: '100%',
                maxHeight: '75vh',
                bgcolor: 'var(--nirmala-glass-bg)',
                borderTop: '1px solid var(--nirmala-glass-border)',
                borderTopLeftRadius: 'var(--radius-lg, 12px)',
                borderTopRightRadius: 'var(--radius-lg, 12px)',
                backgroundImage: 'none',
                pb: 'env(safe-area-inset-bottom)',
              }
            : {
                width: 328,
                bgcolor: 'var(--nirmala-glass-bg)',
                borderLeft: '1px solid var(--nirmala-glass-border)',
                backgroundImage: 'none',
              },
        },
      }}
    >
      <Box sx={{ p: 2.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Box>
            <Typography sx={eyebrowSx}>Sensor Station</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {station.id}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <Icon icon="material-symbols:close-rounded" />
          </IconButton>
        </Box>

        <Chip
          size="small"
          label={sm.label}
          icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sm.color, ml: 1 }} />}
          sx={{
            mb: 2, bgcolor: `${sm.color}18`, color: sm.color,
            border: `1px solid ${sm.color}44`, fontWeight: 700,
          }}
        />

        {/* Metadata */}
        <Stack spacing={1.75} sx={{ mb: 2 }}>
          <Meta label="Coordinates" value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Meta label="Currently Raining" value={station.isRaining ? 'Yes' : 'No'} />
            <Meta label="Last Update" value={fmtTime(station.lastUpdate)} />
          </Box>
        </Stack>

        <Divider sx={{ mb: 2, borderColor: 'var(--nirmala-glass-border)' }} />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} sx={{ color: 'var(--nirmala-cyan)' }} />
          </Box>
        )}

        {!loading && series && (
          <Stack spacing={2.5}>
            <Typography sx={eyebrowSx}>Last hour of data</Typography>

            {/* Rain */}
            <Box>
              <Typography sx={{ ...eyebrowSx, mb: 0.75, display: 'block' }}>Rainfall · mm (5 min)</Typography>
              <Sparkline data={rainData} labels={rainWindow.labels} variant="area" color="var(--rain-3)" height={58}
                rangeStart={rainRangeStart} rangeEnd={rainRangeEnd} buckets={rainBuckets}
                ariaLabel={`Rainfall over the last hour, peak ${rainMax ?? 0} mm`} />
              <SeriesStatsRow data={rainData} unit="mm" />
            </Box>

            {/* Signal */}
            <Box>
              <Typography sx={{ ...eyebrowSx, mb: 0.75, display: 'block' }}>Signal{signal?.label ? ` · ${signal.label}` : ''}</Typography>
              <Sparkline data={signalData} labels={signalWindow.labels} variant="area" color="var(--nirmala-cyan)" height={58}
                rangeStart={signalRangeStart} rangeEnd={signalRangeEnd} buckets={signalBuckets}
                ariaLabel="Sensor signal quality, last hour" />
              <SeriesStatsRow data={signalData} />
            </Box>

            <Button
              size="small"
              variant="contained"
              disableElevation
              startIcon={<Icon icon="material-symbols:open-in-full-rounded" />}
              onClick={() => setOverviewOpen(true)}
              sx={{
                alignSelf: 'flex-start', fontSize: '0.72rem', fontWeight: 700,
                bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)',
                boxShadow: 'none',
                '&:hover': { bgcolor: 'var(--nirmala-cyan-dim)', boxShadow: 'none' },
              }}
            >
              Overview
            </Button>
          </Stack>
        )}

        <SparklineOverviewDialog
          open={overviewOpen}
          onClose={() => setOverviewOpen(false)}
          stationId={station.id}
          rain={rain}
          signal={signal}
          rainBuckets={rainBuckets}
          signalBuckets={signalBuckets}
          rainRangeStart={rainRangeStart}
          rainRangeEnd={rainRangeEnd}
          signalRangeStart={signalRangeStart}
          signalRangeEnd={signalRangeEnd}
        />

        {!loading && !series && (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
            Timeseries unavailable.
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}
