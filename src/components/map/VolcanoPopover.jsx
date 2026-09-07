'use client';

import { Popover, Box, Typography } from '@mui/material';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

/**
 * Small click popover for a volcano marker (VolcanoLayer.jsx) — just name +
 * coordinates, per the scope this feature actually needs (Overpass tags
 * beyond `name` aren't consistently present across nodes). Anchored at the
 * raw click position (`x`/`y`, viewport coordinates from the marker's click
 * event) rather than a DOM element ref, since the marker itself is a plain
 * div appended outside React's tree by VolcanoLayer's OverlayView.
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
        mb: 1.5, p: 1.5, minWidth: 180,
        bgcolor: 'var(--nirmala-glass-bg)', border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 'var(--radius-md, 8px)',
      } } }}
    >
      {selection && (
        <>
          <Typography sx={eyebrowSx}>Volcano</Typography>
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
