'use client';

import { Popover, Box, Typography, IconButton } from '@mui/material';
import { Icon } from '@iconify/react';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

/**
 * Small click popover for a volcano marker (VolcanoLayer.jsx) — just name +
 * coordinates, per the scope this feature actually needs (Overpass tags
 * beyond `name` aren't consistently present across nodes). Anchored at the
 * raw click position (`x`/`y`, viewport coordinates from the marker's click
 * event) rather than a DOM element ref, since the marker is a plain
 * `<Marker>` from @vis.gl/react-google-maps, not a React-tree-attached DOM
 * node this component could anchor to directly.
 */
export default function VolcanoPopover({ selection, onClose }) {
  return (
    <Popover
      open={Boolean(selection)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={selection ? { top: selection.y, left: selection.x } : undefined}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slotProps={{ paper: { sx: {
        mb: 1.5, p: 1.5, minWidth: 200,
        bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-md, 8px)',
      } } }}
    >
      {selection && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={eyebrowSx}>Volcano</Typography>
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="Close"
              sx={{
                m: -0.5, p: 0.5, color: 'text.secondary',
                transition: 'background var(--duration-fast, 150ms) var(--ease-standard), color var(--duration-fast, 150ms) var(--ease-standard)',
                '&:hover': { bgcolor: 'var(--nirmala-cyan-dim)', color: 'var(--nirmala-cyan)' },
                '&.Mui-focusVisible': { outline: '2px solid var(--nirmala-cyan)', outlineOffset: '2px' },
              }}
            >
              <Icon icon="material-symbols:close-rounded" width={16} />
            </IconButton>
          </Box>
          <Typography variant="body2" fontWeight={700} sx={{ mt: 0.25 }}>
            {selection.volcano.name || 'Unnamed volcano'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            {selection.volcano.lat.toFixed(4)}, {selection.volcano.lng.toFixed(4)}
          </Typography>
        </>
      )}
    </Popover>
  );
}
