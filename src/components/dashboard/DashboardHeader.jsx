'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, IconButton, Menu, MenuItem, Divider, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { label: 'Peta Radar', href: '/', icon: 'material-symbols:radar-rounded', exact: true },
  { label: 'Sensor', href: '/sensors', icon: 'material-symbols:sensors-rounded' },
  { label: 'Pengaturan', href: '/settings', icon: 'material-symbols:settings-rounded', soon: true },
];

const monoSx = { fontFamily: 'var(--font-family-mono)' };

function isActive(pathname, item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function DashboardHeader({ stats }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, logout } = useAuth() || {};

  const [now, setNow] = useState(null); // set after mount → no hydration mismatch
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const [anchor, setAnchor] = useState(null);
  const initials = (user?.name || user?.username || 'OP').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    setAnchor(null);
    logout?.();
    router.push('/login');
  };

  return (
    <Box
      component="header"
      sx={{
        height: 56,
        flexShrink: 0,
        background: 'var(--nirmala-glass-bg-header)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--nirmala-glass-border)',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        gap: 1.5,
        zIndex: 'var(--z-header, 1200)',
      }}
    >
      {/* Brand */}
      <Box
        component="img"
        src="/nirmala-brand-dark.png"
        alt="Nirmala"
        sx={{ height: 'var(--size-logo-header, 28px)', width: 'auto', display: 'block', flexShrink: 0 }}
      />

      <Box sx={{ width: '1px', height: 20, background: 'var(--nirmala-glass-border)', flexShrink: 0 }} />

      {/* Nav tabs */}
      <Box sx={{ display: 'flex', gap: 0.25, minWidth: 0 }}>
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          const common = {
            disableRipple: true,
            startIcon: <Icon icon={item.icon} width={15} />,
            sx: {
              px: 1.5,
              py: 0.75,
              height: 40,
              gap: 0.75,
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderRadius: '4px 4px 0 0',
              color: active ? 'var(--nirmala-cyan)' : 'var(--color-text-muted)',
              background: active ? 'rgba(0,229,255,0.10)' : 'transparent',
              borderBottom: active ? '2px solid var(--nirmala-cyan)' : '2px solid transparent',
              transition: 'color var(--duration-fast,150ms) var(--ease-standard), background var(--duration-fast,150ms) var(--ease-standard)',
              '&:hover': { background: active ? 'rgba(0,229,255,0.14)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--nirmala-cyan)' : 'var(--color-text)' },
            },
          };
          if (item.soon) {
            return (
              <Button key={item.href} {...common} disabled
                sx={{ ...common.sx, opacity: 0.5, '&.Mui-disabled': { color: 'var(--color-text-muted)' } }}>
                {item.label}
              </Button>
            );
          }
          return (
            <Button key={item.href} component={Link} href={item.href} {...common}>
              {item.label}
            </Button>
          );
        })}
      </Box>

      {/* Right group — pinned right, never shrinks */}
      <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* LIVE */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
          background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 999,
        }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-active, #34d399)',
            animation: 'live-pulse 2s ease-in-out infinite' }} />
          <Box sx={{ ...monoSx, fontSize: '0.65rem', color: 'var(--status-active, #34d399)', fontWeight: 700 }}>
            LIVE · {stats.active}/{stats.total}
          </Box>
        </Box>

        {/* Rain alert */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5,
          background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 999,
        }}>
          <Icon icon="material-symbols:rainy-rounded" width={14} style={{ color: '#60a5fa' }} />
          <Box sx={{ ...monoSx, fontSize: '0.65rem', color: '#60a5fa', fontWeight: 700 }}>
            {stats.raining} Hujan
          </Box>
        </Box>

        {/* Datetime (mono, hydration-safe) */}
        <Box sx={{ ...monoSx, fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', minWidth: 92, textAlign: 'right' }}>
          {now
            ? `${now.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB`
            : '—'}
        </Box>

        {/* Avatar + dropdown */}
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Menu akun"
          sx={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--color-brand-solid, #0d47a1)', color: '#fff',
            fontSize: '0.7rem', fontWeight: 700,
            '&:hover': { background: '#1565c0' },
          }}
        >
          {initials}
        </IconButton>
        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: {
            mt: 1, minWidth: 180, bgcolor: 'var(--color-surface, #1e1e1e)',
            border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-md,8px)',
          } } }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user?.name || 'Operator'}</Typography>
            <Typography variant="caption" sx={{ color: 'var(--color-text-muted)', ...monoSx }}>
              {user?.username || user?.email || 'operator'}
            </Typography>
          </Box>
          <Divider sx={{ borderColor: 'var(--nirmala-glass-border)' }} />
          <MenuItem onClick={handleLogout} sx={{ color: '#e46c64', gap: 1, fontSize: '0.85rem' }}>
            <Icon icon="material-symbols:logout-rounded" width={18} /> Keluar
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
