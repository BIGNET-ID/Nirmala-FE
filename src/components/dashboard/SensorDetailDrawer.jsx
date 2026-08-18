import { Box, Drawer, Typography, Divider, Chip, IconButton, Stack } from '@mui/material';
import { Icon } from '@iconify/react';

export default function SensorDetailDrawer({ station, open, onClose, activeLayer }) {
  if (!station) return null;

  const value = activeLayer === 'rain' ? station.rain : station.temp;
  const unit = activeLayer === 'rain' ? 'mm/jam' : '°C';

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{
        sx: {
          width: 320, bgcolor: 'rgba(10, 18, 36, 0.95)',
          backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.08)',
        },
      }}
    >
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>{station.name}</Typography>
          <IconButton onClick={onClose} size="small">
            <Icon icon="solar:close-circle-bold-duotone" />
          </IconButton>
        </Box>
        <Chip label={`ID: ${station.id}`} size="small" sx={{ mb: 2 }} />
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">KOORDINAT</Typography>
            <Typography variant="body2">{station.lat.toFixed(4)}, {station.lng.toFixed(4)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">INTENSITAS HUJAN</Typography>
            <Typography variant="body1" color="primary.main" fontWeight={700}>{station.rain} mm/jam</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">SUHU UDARA</Typography>
            <Typography variant="body1" fontWeight={700}>{station.temp} °C</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">NILAI AKTIF ({activeLayer.toUpperCase()})</Typography>
            <Typography variant="h5" color="secondary.main" fontWeight={800}>{value} {unit}</Typography>
          </Box>
        </Stack>
      </Box>
    </Drawer>
  );
}