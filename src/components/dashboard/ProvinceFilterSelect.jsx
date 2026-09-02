'use client';

import { useState } from 'react';
import { Box, Autocomplete, TextField, IconButton, Tooltip, Typography, Popover, Chip } from '@mui/material';
import { Icon } from '@iconify/react';
import { PROVINCES } from '@/constants/provinces';

/**
 * Provincial Boundary Filter (PRD §4.3). Selecting a province pans/zooms the
 * map to its bounding box (handled by the parent's onSelectCode) and shows
 * an approximate sensor count for that box — see provinceFilter.js for why
 * "approximate" (no real province_code from the backend yet).
 *
 * A single icon button grouped with fullscreen/show-hide-all in
 * MapExtrasCluster — clicking it opens a small popover with the search
 * field, instead of a persistent full-width bar taking up screen space.
 * `btnSx`/`iconWidth` are handed down by MapExtrasCluster so this button
 * matches its siblings exactly.
 */
export default function ProvinceFilterSelect({ selectedCode, onSelectCode, matched, btnSx, iconWidth }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const selected = PROVINCES.find((p) => p.code === selectedCode) || null;
  const open = Boolean(anchorEl);

  const handlePick = (_, option) => {
    onSelectCode(option ? option.code : null);
    setAnchorEl(null);
  };

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
        <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', mb: 1 }}>
          Province
        </Typography>

        <Autocomplete
          autoFocus
          openOnFocus
          size="small"
          // No disablePortal: this lives inside a small fixed-width Popover
          // paper, which would clip the suggestions list if it rendered
          // nested in the DOM instead of portaled to document.body.
          options={PROVINCES}
          value={selected}
          getOptionLabel={(p) => p.name}
          isOptionEqualToValue={(a, b) => a.code === b.code}
          onChange={handlePick}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder="Search a region..."
              slotProps={{ ...params.slotProps, input: { ...params.slotProps?.input, disableUnderline: true } }}
            />
          )}
          sx={{ '& .MuiInputBase-input': { fontSize: '0.82rem', color: 'text.primary' } }}
        />

        {selected && (
          <Chip
            label={selected.name}
            onDelete={() => onSelectCode(null)}
            size="small"
            sx={{ mt: 1.5, bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)', fontWeight: 600 }}
          />
        )}

        {selected && matched && (
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
        )}
      </Popover>
    </>
  );
}
