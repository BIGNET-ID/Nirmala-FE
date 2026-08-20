'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Drawer, Typography, Divider, Chip, IconButton, Stack, CircularProgress } from '@mui/material';
import { Icon } from '@iconify/react';
import Sparkline from '@/components/common/Sparkline';
import { nirmalaApiService, normalizeTimeseries } from '@/lib/nirmalaApi';

const STATUS_META = {
  blacklisted: { label: 'Blacklist', color: '#ef4444' },
  inactive: { label: 'Inaktif', color: '#4b5563' },
  active: { label: 'Aktif', color: '#34d399' },
};

function statusMeta(st) {
  if (st.blacklisted || st.status === 'blacklisted') return STATUS_META.blacklisted;
  if (st.inactive || st.unavailable || st.status === 'inactive') return STATUS_META.inactive;
  return STATUS_META.active;
}

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};
const monoSx = { fontFamily: 'var(--font-family-mono)' };

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function Meta({ label, value, mono }) {
  return (
    <Box>
      <Typography sx={eyebrowSx}>{label}</Typography>
      <Typography variant="body2" sx={mono ? monoSx : undefined}>{value}</Typography>
    </Box>
  );
}

function last(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (typeof arr[i] === 'number' && !Number.isNaN(arr[i])) return arr[i];
  }
  return null;
}

export default function SensorDetailDrawer({ station, open, onClose }) {
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open || !station?.id) { setSeries(null); return; }
    const myReq = ++reqId.current;
    setLoading(true);
    setSeries(null);
    nirmalaApiService
      .getTimeseries(station.id)
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
  const rainData = rain?.data || [];
  const signalData = signal?.data || [];
  const rainMax = rainData.length ? Math.max(...rainData) : null;
  const rainLast = last(rainData);
  const signalLast = last(signalData);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: 'var(--z-modal, 1400)' }}
      slotProps={{
        paper: {
          sx: {
            width: 328,
            bgcolor: 'var(--nirmala-glass-bg)',
            backdropFilter: 'blur(20px)',
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
            <Typography sx={eyebrowSx}>Stasiun Sensor</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ ...monoSx, lineHeight: 1.2 }}>
              {station.id}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Tutup">
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
          <Meta label="Koordinat" mono value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Meta label="Sedang Hujan" value={station.isRaining ? 'Ya' : 'Tidak'} />
            <Meta label="Update Terakhir" mono value={fmtTime(station.lastUpdate)} />
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
            {/* Rain */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                <Typography sx={eyebrowSx}>Curah Hujan · mm (5 min)</Typography>
                <Typography variant="caption" sx={{ ...monoSx, color: '#60a5fa', fontWeight: 700 }}>
                  {rainMax != null ? `${rainMax.toFixed(2)} mm` : '—'}
                </Typography>
              </Box>
              <Sparkline data={rainData} variant="bar" color="#60a5fa" height={58}
                ariaLabel={`Curah hujan, puncak ${rainMax ?? 0} mm`} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Terakhir: <Box component="span" sx={monoSx}>{rainLast != null ? `${rainLast.toFixed(2)} mm` : '—'}</Box>
              </Typography>
            </Box>

            {/* Signal */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                <Typography sx={eyebrowSx}>Sinyal{signal?.label ? ` · ${signal.label}` : ''}</Typography>
                <Typography variant="caption" sx={{ ...monoSx, color: 'var(--nirmala-cyan)', fontWeight: 700 }}>
                  {signalLast != null ? signalLast.toFixed(2) : '—'}
                </Typography>
              </Box>
              <Sparkline data={signalData} variant="area" color="#00e5ff" height={58}
                ariaLabel="Kualitas sinyal sensor" />
            </Box>
          </Stack>
        )}

        {!loading && !series && (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
            Timeseries tidak tersedia.
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}
