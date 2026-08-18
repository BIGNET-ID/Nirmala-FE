'use client';

import { Box, Typography } from '@mui/material';

export default function SensorsPage() {
  return (
    <Box sx={{ p: 4, color: '#fff' }}>
      <Typography variant="h5" fontWeight={700}>Sensor Stations</Typography>
      <Typography color="text.secondary">Halaman manajemen sensor telemetri.</Typography>
    </Box>
  );
}