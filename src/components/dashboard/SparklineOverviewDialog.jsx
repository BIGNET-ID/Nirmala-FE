'use client';

import { Box, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import Sparkline from '@/components/common/Sparkline';

export default function SparklineOverviewDialog({ open, onClose, stationId, rain, signal, rainMax, signalLast }) {
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
            backdropFilter: 'blur(20px)',
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
          <IconButton onClick={onClose} size="small" aria-label="Tutup">
            <Icon icon="material-symbols:close-rounded" />
          </IconButton>
        </Box>

        <Stack spacing={3}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Curah Hujan · mm (5 min)</Typography>
              <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 700 }}>
                {rainMax != null ? `${rainMax.toFixed(2)} mm` : '—'}
              </Typography>
            </Box>
            <Sparkline data={rain?.data || []} labels={rain?.labels} variant="bar" color="#60a5fa" height={220} />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Sinyal{signal?.label ? ` · ${signal.label}` : ''}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--nirmala-cyan)', fontWeight: 700 }}>
                {signalLast != null ? signalLast.toFixed(2) : '—'}
              </Typography>
            </Box>
            <Sparkline data={signal?.data || []} labels={signal?.labels} variant="area" color="#00e5ff" height={220} />
          </Box>
        </Stack>
      </Box>
    </Dialog>
  );
}
