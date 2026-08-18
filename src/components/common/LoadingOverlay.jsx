import { Box, CircularProgress, Typography } from '@mui/material';

export default function LoadingOverlay({ message = 'Memuat...' }) {
  return (
    <Box
      sx={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#050811',
      }}
    >
      <CircularProgress color="primary" size={56} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{message}</Typography>
    </Box>
  );
}