'use client';

import { useState } from 'react';
import { Box, Autocomplete, TextField, IconButton, Tooltip, Typography, Popover, Chip } from '@mui/material';
import { Icon } from '@iconify/react';
import { PROVINCES } from '@/constants/provinces';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

function MatchedCaption({ matched }) {
  if (!matched) return null;
  return (
    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
      {matched.total === 0 ? (
        'No sensor data detected in this region yet'
      ) : (
        <>
          <Box component="span" sx={{ color: 'var(--nirmala-cyan)' }}>{matched.total}</Box>
          {' '}sensors{' · '}<Box component="span">{matched.raining}</Box> reporting rain
        </>
      )}
    </Typography>
  );
}

function ProvinceAutocomplete({ selected, onSelectCode }) {
  const handlePick = (_, option) => onSelectCode(option ? option.code : null);
  return (
    <Autocomplete
      autoFocus
      openOnFocus
      size="small"
      // No disablePortal: the suggestions list needs to escape whatever
      // small fixed-width container this is mounted in (a Popover paper on
      // compact, a persistent card on desktop).
      options={PROVINCES}
      value={selected}
      getOptionLabel={(p) => p.name}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      onChange={handlePick}
      popupIcon={<Icon icon="material-symbols:keyboard-arrow-down-rounded" width={18} style={{ color: 'var(--color-text-muted)' }} />}
      clearIcon={<Icon icon="material-symbols:close-rounded" width={16} style={{ color: 'var(--color-text-muted)' }} />}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="Search a region..."
          fullWidth
          slotProps={{ ...params.slotProps, input: { ...params.slotProps?.input, disableUnderline: true } }}
        />
      )}
      sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem', color: 'text.primary' } }}
    />
  );
}

/**
 * Provincial Boundary Filter (PRD §4.3). Selecting a province pans/zooms the
 * map to its bounding box (handled by the parent's onSelectCode) and shows
 * an approximate sensor count for that box — see provinceFilter.js for why
 * "approximate" (no real province_code from the backend yet).
 *
 * Desktop/tablet-landscape: an always-visible search card (matches the
 * product reference: rounded card, "Province" eyebrow, "Search a
 * region..." input, chevron). Compact/mobile: keeps the original icon-
 * button + Popover interaction — a persistent 300px+ bar would crowd a
 * phone's top bar.
 */
export default function ProvinceFilterSelect({ selectedCode, onSelectCode, matched, btnSx, iconWidth }) {
  const { isCompact, isWallTV } = useResponsiveLayout();
  const [anchorEl, setAnchorEl] = useState(null);
  const selected = PROVINCES.find((p) => p.code === selectedCode) || null;
  const open = Boolean(anchorEl);

  if (!isCompact) {
    return (
      <Box
        sx={{
          width: isWallTV ? 340 : 300,
          display: 'flex', flexDirection: 'column', gap: 0.5, px: 1.5, py: 1.25,
          bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-lg, 8px)',
          transition: 'border-color var(--duration-fast, 150ms) var(--ease-standard)',
          '&:hover': { borderColor: 'var(--nirmala-cyan-dim)' },
        }}
      >
        <Typography sx={eyebrowSx}>Province</Typography>
        <ProvinceAutocomplete selected={selected} onSelectCode={onSelectCode} />
        <MatchedCaption matched={selected ? matched : null} />
      </Box>
    );
  }

  return (
    <>
      <Tooltip title={selected ? `Province: ${selected.name}` : 'Search province'} placement="bottom">
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Search province" sx={{ ...btnSx, position: 'relative' }}>
          <Icon icon="material-symbols:location-on-rounded" width={iconWidth} />
          {selected && (
            <Box sx={{
              position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%',
              bgcolor: 'var(--nirmala-cyan)', border: '1.5px solid var(--nirmala-glass-bg)',
            }} />
          )}
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: {
          mt: 1, p: 1.5, width: 260,
          bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
          borderRadius: 'var(--radius-md, 8px)',
        } } }}
      >
        <Typography sx={{ ...eyebrowSx, mb: 1 }}>Province</Typography>
        <ProvinceAutocomplete selected={selected} onSelectCode={(code) => { onSelectCode(code); setAnchorEl(null); }} />
        {selected && (
          <Chip
            label={selected.name}
            onDelete={() => onSelectCode(null)}
            size="small"
            sx={{ mt: 1.5, bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)', fontWeight: 600 }}
          />
        )}
        <MatchedCaption matched={selected ? matched : null} />
      </Popover>
    </>
  );
}
