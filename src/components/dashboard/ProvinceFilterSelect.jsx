'use client';

import { Box, Select, MenuItem, IconButton, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { PROVINCES } from '@/constants/provinces';

/**
 * Provincial Boundary Filter (PRD §4.3). Selecting a province pans/zooms the
 * map to its bounding box (handled by the parent's onSelectCode) and shows
 * an approximate sensor count for that box — see provinceFilter.js for why
 * "approximate" (no real province_code from the backend yet).
 */
export default function ProvinceFilterSelect({ selectedCode, onSelectCode, matched }) {
  const selected = PROVINCES.find((p) => p.code === selectedCode) || null;

  return (
    <Box
      sx={{
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5 },
        px: { xs: 1.25, sm: 2 },
        background: 'var(--nirmala-glass-bg-header)',
        borderBottom: '1px solid var(--nirmala-glass-border)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <Icon icon="material-symbols:location-on-rounded" width={16} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />

      <Select
        value={selectedCode || ''}
        onChange={(e) => onSelectCode(e.target.value || null)}
        displayEmpty
        variant="standard"
        disableUnderline
        size="small"
        sx={{ fontSize: '0.78rem', fontWeight: 600, minWidth: { xs: 110, sm: 180 }, maxWidth: { xs: 140, sm: 'none' }, color: 'text.primary' }}
      >
        <MenuItem value="">Semua Provinsi</MenuItem>
        {PROVINCES.map((p) => (
          <MenuItem key={p.code} value={p.code}>{p.name}</MenuItem>
        ))}
      </Select>

      {selected && (
        <Tooltip title="Reset ke tampilan nasional" placement="bottom">
          <IconButton size="small" onClick={() => onSelectCode(null)} sx={{ color: 'text.secondary' }}>
            <Icon icon="material-symbols:close-rounded" width={16} />
          </IconButton>
        </Tooltip>
      )}

      {selected && matched && (
        <Typography
          variant="caption"
          sx={{
            ml: 'auto', color: 'text.secondary', fontSize: '0.72rem',
            minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {matched.total === 0 ? (
            'Belum ada data sensor terdeteksi di wilayah ini'
          ) : (
            <>
              <Box component="span" sx={{ color: 'var(--nirmala-cyan)' }}>{matched.total}</Box>
              {' '}sensor di {selected.name}
              {' · '}
              <Box component="span">{matched.raining}</Box> melapor hujan
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}
