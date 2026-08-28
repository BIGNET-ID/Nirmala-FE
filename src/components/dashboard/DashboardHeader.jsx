'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, IconButton, Menu, MenuItem, Divider, Typography, Tooltip, Badge } from '@mui/material';
import { Icon } from '@iconify/react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeMode } from '@/context/ThemeModeContext';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import TabSwitcher from '@/components/dashboard/TabSwitcher';

const NAV = [
  { label: 'Peta Radar', href: '/', icon: 'material-symbols:radar-rounded', exact: true },
  { label: 'Pengaturan', href: '/settings', icon: 'material-symbols:settings-rounded', soon: true },
];

function isActive(pathname, item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Status chips (Kafka health — only when down, LIVE, SSE stream — only when
 * not nominal) plus datetime — the same content is shown inline on desktop
 * (>=lg) and stacked inside the compact overflow menu (<lg). `stack`
 * switches the flex direction/width between those two contexts; `scale`
 * bumps type size for the wall-mounted-TV breakpoint (>=1920px) without
 * touching layout.
 */
function formatLongDateTime(now) {
  const weekday = now.toLocaleDateString('id-ID', { weekday: 'long' });
  const day = now.toLocaleDateString('id-ID', { day: '2-digit' });
  const month = now.toLocaleDateString('id-ID', { month: 'long' });
  const year = now.getFullYear();
  // id-ID's default time separator is '.' (e.g. "15.42") — force ':' to
  // match the requested "14:06" format instead of relying on locale output.
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${weekday}, ${day} ${month} ${year}, ${time} WIB`;
}

function StatusChips({ health, streamStatus, now, stack, scale = 1 }) {
  const chipSx = {
    display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
    borderRadius: 999, width: stack ? '100%' : 'auto',
  };
  const textSx = { fontSize: `${0.65 * scale}rem`, fontWeight: 700 };

  return (
    <>
      {/* Backend/Kafka health — GET /api/health (PRD §7.1 Kategori A). Only
          shown when something needs attention: a permanent green chip is
          clutter, but a down pipeline still needs a visible signal
          somewhere — same pattern as the SSE stream chip below. */}
      {health && !health.connected && (
        <Tooltip title="Kafka pipeline tidak terhubung" placement={stack ? 'left' : 'bottom'}>
          <Box sx={{ ...chipSx, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <Box sx={{ ...textSx, color: '#ef4444' }}>BACKEND DOWN</Box>
          </Box>
        </Tooltip>
      )}

      {/* LIVE — active/total count lives on the Sensor Stats card now, so
          this is purely a connectivity signal, not a duplicate readout. */}
      <Box sx={{ ...chipSx, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-active, #34d399)',
          animation: 'live-pulse 2s ease-in-out infinite', flexShrink: 0 }} />
        <Box sx={{ ...textSx, color: 'var(--status-active, #34d399)' }}>
          LIVE
        </Box>
      </Box>

      {/* SSE connection status — only surfaced when not nominal, to avoid clutter */}
      {streamStatus && streamStatus !== 'live' && (
        <Tooltip title={`Koneksi stream sensor: ${streamStatus}`} placement={stack ? 'left' : 'bottom'}>
          <Box sx={{ ...chipSx, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
            <Box sx={{ ...textSx, color: '#fbbf24' }}>
              {streamStatus === 'reconnecting' ? 'STREAM RECONNECT' : 'STREAM CONNECTING'}
            </Box>
          </Box>
        </Tooltip>
      )}

      {/* Datetime — full Indonesian weekday/date/time, hydration-safe */}
      <Box sx={{
        fontSize: `${0.65 * scale}rem`, color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
        textAlign: stack ? 'left' : 'right', px: stack ? 1.5 : 0,
      }}>
        {now ? formatLongDateTime(now) : '—'}
      </Box>
    </>
  );
}

export default function DashboardHeader({ health, streamStatus, activeTab, onTabChange }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, logout } = useAuth() || {};
  const { mode, toggle } = useThemeMode();
  const { isCompact, isWallTV } = useResponsiveLayout();
  const scale = isWallTV ? 1.15 : 1;

  const [now, setNow] = useState(null); // set after mount → no hydration mismatch
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const [anchor, setAnchor] = useState(null);
  const [statusAnchor, setStatusAnchor] = useState(null);
  const initials = (user?.name || user?.username || 'OP').slice(0, 2).toUpperCase();

  // Aggregate dot on the compact status icon — red/amber only when something
  // actually needs attention, so a glance at the closed icon still tells the
  // operator whether it's safe to ignore.
  const hasAlert = (health && !health.connected) || (streamStatus && streamStatus !== 'live');

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
        pt: 'env(safe-area-inset-top)',
        pl: 'max(16px, env(safe-area-inset-left))',
        pr: 'max(16px, env(safe-area-inset-right))',
        background: 'var(--nirmala-glass-bg-header)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--nirmala-glass-border)',
        display: 'flex',
        alignItems: 'center',
        gap: isCompact ? 1 : 1.5,
        zIndex: 'var(--z-header, 1200)',
      }}
    >
      {/* Brand */}
      <Box
        component="img"
        src={mode === 'dark' ? '/nirmala-brand-dark.png' : '/nirmala-brand.png'}
        alt="Nirmala"
        sx={{ height: 48 * scale, width: 'auto', display: 'block', flexShrink: 0 }}
      />

      {!isCompact && (
        <>
          <Box sx={{ width: '1px', height: 20, background: 'var(--nirmala-glass-border)', flexShrink: 0 }} />

          {/* Nav tabs */}
          <Box sx={{ display: 'flex', gap: 0.25, minWidth: 0 }}>
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const common = {
                disableRipple: true,
                startIcon: <Icon icon={item.icon} width={15 * scale} />,
                sx: {
                  px: 1.5,
                  py: 0.75,
                  height: 40 * scale,
                  gap: 0.75,
                  fontSize: `${0.75 * scale}rem`,
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

          <Box sx={{ width: '1px', height: 20, background: 'var(--nirmala-glass-border)', flexShrink: 0 }} />
        </>
      )}

      <TabSwitcher activeTab={activeTab} onChange={onTabChange} />

      {/* Right group — pinned right, never shrinks */}
      <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: isCompact ? 0.75 : 1.5 }}>
        {isCompact ? (
          <>
            {/* Status & settings — collapses nav links, all status chips, and
                the theme toggle behind one icon so the header never wraps or
                overflows on a phone-width screen. */}
            <Tooltip title="Status & pengaturan">
              <IconButton
                onClick={(e) => setStatusAnchor(e.currentTarget)}
                aria-label="Status & pengaturan"
                sx={{
                  width: 40, height: 40, color: 'var(--color-text-muted)',
                  border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-md,8px)',
                }}
              >
                <Badge
                  variant="dot"
                  overlap="circular"
                  invisible={!hasAlert}
                  sx={{ '& .MuiBadge-badge': { bgcolor: '#f59e0b' } }}
                >
                  <Icon icon="material-symbols:tune-rounded" width={20} />
                </Badge>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={statusAnchor}
              open={Boolean(statusAnchor)}
              onClose={() => setStatusAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: {
                mt: 1, width: 240, bgcolor: 'var(--color-surface, #1e1e1e)',
                border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-md,8px)',
              } } }}
            >
              {NAV.map((item) => {
                const active = isActive(pathname, item);
                if (item.soon) {
                  return (
                    <MenuItem key={item.href} disabled sx={{ gap: 1, fontSize: '0.85rem' }}>
                      <Icon icon={item.icon} width={17} /> {item.label}
                      <Box component="span" sx={{ ml: 'auto', fontSize: '0.62rem', color: 'text.secondary' }}>Segera</Box>
                    </MenuItem>
                  );
                }
                return (
                  <MenuItem
                    key={item.href}
                    component={Link}
                    href={item.href}
                    onClick={() => setStatusAnchor(null)}
                    sx={{ gap: 1, fontSize: '0.85rem', color: active ? 'var(--nirmala-cyan)' : 'inherit' }}
                  >
                    <Icon icon={item.icon} width={17} /> {item.label}
                  </MenuItem>
                );
              })}
              <Divider sx={{ borderColor: 'var(--nirmala-glass-border)' }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
                <StatusChips health={health} streamStatus={streamStatus} now={now} stack />
              </Box>
              <Divider sx={{ borderColor: 'var(--nirmala-glass-border)' }} />
              <MenuItem onClick={toggle} sx={{ gap: 1, fontSize: '0.85rem' }}>
                <Icon icon={mode === 'dark' ? 'material-symbols:light-mode-rounded' : 'material-symbols:dark-mode-rounded'} width={17} />
                {mode === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
              </MenuItem>
            </Menu>
          </>
        ) : (
          <>
            <StatusChips health={health} streamStatus={streamStatus} now={now} scale={scale} />

            {/* Theme toggle */}
            <Tooltip title={mode === 'dark' ? 'Mode Terang' : 'Mode Gelap'} placement="bottom">
              <IconButton
                onClick={toggle}
                aria-label={mode === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
                sx={{
                  width: 34 * scale, height: 34 * scale, color: 'var(--color-text-muted)',
                  border: '1px solid var(--nirmala-glass-border)', borderRadius: 'var(--radius-md,8px)',
                  transition: 'color var(--duration-fast,150ms) var(--ease-standard)',
                  '&:hover': { color: 'var(--nirmala-cyan)' },
                }}
              >
                <Icon icon={mode === 'dark' ? 'material-symbols:light-mode-rounded' : 'material-symbols:dark-mode-rounded'} width={18 * scale} />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* Avatar + dropdown */}
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Menu akun"
          sx={{
            width: (isCompact ? 40 : 34 * scale), height: (isCompact ? 40 : 34 * scale), borderRadius: '50%',
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
            <Typography variant="caption" sx={{ color: 'var(--color-text-muted)' }}>
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
