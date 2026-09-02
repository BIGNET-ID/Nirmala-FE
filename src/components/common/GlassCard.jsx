import { Box } from '@mui/material';

export default function GlassCard({ children, sx = {}, ...props }) {
  return (
    <Box
      sx={{
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: 4,
        p: 2,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}