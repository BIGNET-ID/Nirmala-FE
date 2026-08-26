'use client';

import { Box, Button } from '@mui/material';
import { Icon } from '@iconify/react';

const TABS = [
  { key: 'current', label: 'Current', icon: 'material-symbols:radar-rounded' },
  { key: 'timeline', label: 'Timeline', icon: 'material-symbols:schedule-rounded' },
];

/**
 * Dual-Tab navigation (PRD §4.1) — switches the dashboard between the
 * static live snapshot (Current) and the 24-hour playback roadmap
 * placeholder (Timeline). Presentational only; page.jsx owns the state.
 */
export default function TabSwitcher({ activeTab, onChange }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.25,
        p: 0.25,
        borderRadius: 'var(--radius-full, 9999px)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--nirmala-glass-border)',
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            disableRipple
            startIcon={<Icon icon={tab.icon} width={15} />}
            sx={{
              px: 1.5,
              height: 32,
              gap: 0.75,
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              color: active ? '#04141a' : 'var(--color-text-muted)',
              background: active ? 'var(--nirmala-cyan)' : 'transparent',
              transition: 'color var(--duration-fast,150ms) var(--ease-standard), background var(--duration-fast,150ms) var(--ease-standard)',
              '&:hover': { background: active ? 'var(--nirmala-cyan)' : 'rgba(255,255,255,0.06)' },
            }}
          >
            {tab.label}
          </Button>
        );
      })}
    </Box>
  );
}
