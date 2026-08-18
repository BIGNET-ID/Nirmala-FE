import { Box } from '@mui/material';

export default function GlassCard({ children, sx = {}, ...props }) {
  return (
    <Box
      sx={{
        backdropFilter: 'blur(16px)',
        background: 'rgba(15, 23, 42, 0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
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