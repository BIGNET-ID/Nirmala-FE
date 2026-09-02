import { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'motion/react';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

// Row is clickable only when it maps to a statusBucket the map can filter
// (active/raining/blacklisted) — Total is a plain count, not a toggle.
function Row({ icon, color, label, value, bucket, hidden, onToggle }) {
  const clickable = Boolean(bucket);
  const content = (
    <Box
      onClick={clickable ? () => onToggle(bucket) : undefined}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        cursor: clickable ? 'pointer' : 'default',
        opacity: hidden ? 0.4 : 1,
        borderRadius: 'var(--radius-sm, 4px)',
        mx: -0.5, px: 0.5, py: 0.25,
        transition: 'background 0.15s ease, opacity 0.15s ease',
        '&:hover': clickable ? { background: 'rgba(255,255,255,0.04)' } : undefined,
      }}
    >
      <Icon icon={icon} width={16} style={{ color }} />
      <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, fontSize: '0.8rem' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, color, fontSize: '0.85rem' }}>
        {value.toLocaleString('id-ID')}
      </Typography>
    </Box>
  );
  if (!clickable) return content;
  return (
    <Tooltip title={hidden ? `Show ${label} sensors on the map` : `Hide ${label} sensors from the map`}>
      {content}
    </Tooltip>
  );
}

/** Bare stats content — shared by the desktop floating card and the mobile bottom sheet. */
export function SensorStatsCardContent({ stats, hiddenStatuses, onToggleStatus }) {
  const isHidden = (bucket) => hiddenStatuses?.has(bucket) ?? false;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ ...eyebrowSx, mb: 0.25 }}>Sensor Statistics</Typography>
      <Row icon="material-symbols:sensors-rounded" color="var(--color-text)" label="Total" value={stats.total} />
      <Row icon="material-symbols:check-circle-rounded" color="var(--status-active)" label="Active" value={stats.active}
        bucket="active" hidden={isHidden('active')} onToggle={onToggleStatus} />
      <Row icon="material-symbols:rainy-rounded" color="var(--status-raining)" label="Raining" value={stats.raining}
        bucket="raining" hidden={isHidden('raining')} onToggle={onToggleStatus} />
      <Row icon="material-symbols:wifi-off-rounded" color="var(--status-unavailable)" label="Unavailable" value={stats.unavailable}
        bucket="unavailable" hidden={isHidden('unavailable')} onToggle={onToggleStatus} />
      <Row icon="material-symbols:do-not-disturb-on-rounded" color="var(--status-inactive)" label="Inactive" value={stats.inactive}
        bucket="inactive" hidden={isHidden('inactive')} onToggle={onToggleStatus} />
      <Row icon="material-symbols:block-rounded" color="var(--status-blacklisted)" label="Blacklist" value={stats.blacklist}
        bucket="blacklisted" hidden={isHidden('blacklisted')} onToggle={onToggleStatus} />
    </Box>
  );
}

const statsCollapseTransition = { duration: 0.28, ease: [0.2, 0, 0, 1] }; // matches --ease-standard

/** Desktop/tablet-landscape floating card (no self-positioning — the parent controls placement). */
export default function SensorStatsCard({ stats, hiddenStatuses, onToggleStatus }) {
  const [open, setOpen] = useState(true);

  return (
    <Box
      component={motion.div}
      transition={statsCollapseTransition}
      animate={{ width: open ? 218 : 36 }}
      onClick={() => !open && setOpen(true)}
      sx={{
        overflow: 'hidden',
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: open ? 'var(--radius-lg, 12px)' : 'var(--radius-md, 8px)',
        cursor: open ? 'default' : 'pointer',
      }}
    >
      <Box
        onClick={(e) => { if (open) { e.stopPropagation(); setOpen(false); } }}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: open ? 'flex-end' : 'center',
          height: 32, px: open ? 0.5 : 0, cursor: 'pointer',
        }}
      >
        <Tooltip title={open ? 'Hide statistics' : 'Show statistics'}>
          <IconButton size="small" disableRipple sx={{ p: 0.25, color: 'text.secondary' }}>
            <Icon icon={open ? 'material-symbols:chevron-right-rounded' : 'material-symbols:sensors-rounded'} width={18} style={!open ? { color: 'var(--nirmala-cyan)' } : undefined} />
          </IconButton>
        </Tooltip>
      </Box>

      <AnimatePresence>
        {open && (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            sx={{ width: 218, px: 1.75, pb: 1.75 }}
          >
            <SensorStatsCardContent stats={stats} hiddenStatuses={hiddenStatuses} onToggleStatus={onToggleStatus} />
          </Box>
        )}
      </AnimatePresence>
    </Box>
  );
}
