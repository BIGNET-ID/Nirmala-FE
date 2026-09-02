'use client';

import { useState } from 'react';
import { Box, Button, Typography, FormControlLabel, Switch, Tooltip, Chip, IconButton } from '@mui/material';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { METRICS } from '@/constants/metrics';
import { LAYER_STATUS } from '@/constants/layerStatus';

/**
 * Sky/Ground Segment vendor panel (PRD §4.2). Groups every layer control by
 * the vendor that provides it — vendors with no backend integration yet
 * (NASA, Sentinel, BMKG, Maxar) render as disabled cards with a "Segera"
 * badge rather than being hidden, so the full PRD architecture stays
 * visible. See docs/superpowers/specs/2026-08-26-dual-tab-segment-layout-design.md §2
 * for the vendor→layer mapping this panel encodes.
 *
 * Replaces the old flat MetricLayerSelector — same props, regrouped
 * presentation. To add a new control to an active vendor card, follow the
 * same pattern as the existing LayerSwitch/ModeButton usages below.
 */

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

const STATUS_DOT = {
  [LAYER_STATUS.EMPTY]: { color: '#5b6b82', title: 'Tidak ada data untuk ditampilkan saat ini.' },
  [LAYER_STATUS.ERROR]: { color: '#f59e0b', title: 'Gagal memuat data.' },
};

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--nirmala-cyan)' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--nirmala-cyan)', opacity: 0.6 },
};

function LayerSwitch({ checked, onChange, label, count, status, info, sx }) {
  const dot = STATUS_DOT[status];
  return (
    <FormControlLabel
      sx={{ ml: 0, mr: 0, justifyContent: 'space-between', width: '100%', ...sx }}
      labelPlacement="start"
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} size="small" sx={switchSx} />}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <Typography variant="body2" sx={{ fontSize: '0.82rem', color: 'text.primary' }}>
            {label}{typeof count === 'number' ? <Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>· {count}</Box> : null}
          </Typography>
          {info && (
            <Tooltip title={info} placement="top">
              <Icon icon="material-symbols:info-outline-rounded" width={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            </Tooltip>
          )}
          {dot && (
            <Tooltip title={dot.title} placement="top">
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dot.color, flexShrink: 0 }} />
            </Tooltip>
          )}
        </Box>
      }
    />
  );
}

function ModeButton({ active, icon, label, onClick, info }) {
  const button = (
    <Button
      startIcon={<Icon icon={icon} />}
      onClick={onClick}
      fullWidth
      disableRipple
      sx={{
        justifyContent: 'flex-start',
        height: 36,
        borderRadius: 'var(--radius-md, 8px)',
        px: 1.25,
        color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
        fontWeight: 700,
        fontSize: '0.8rem',
        border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
        background: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
        '&:hover': { background: 'var(--nirmala-cyan-dim)' },
      }}
    >
      {label}
    </Button>
  );
  return info ? <Tooltip title={info} placement="right">{button}</Tooltip> : button;
}

function VendorCard({ title, accent, info, active = true, children }) {
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 'var(--radius-md, 8px)',
        borderLeft: `2px solid ${accent}`,
        background: 'rgba(255,255,255,0.02)',
        opacity: active ? 1 : 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>
            {title}
          </Typography>
          {info && (
            <Tooltip title={info} placement="top">
              <Icon icon="material-symbols:info-outline-rounded" width={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            </Tooltip>
          )}
        </Box>
        {!active && (
          <Tooltip title="Menunggu integrasi Backend" placement="top">
            <Chip
              label="Segera"
              size="small"
              sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }}
            />
          </Tooltip>
        )}
      </Box>
      {active && children}
    </Box>
  );
}

function SegmentGroup({ title, hideTitle, children }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {!hideTitle && <Typography sx={eyebrowSx}>{title}</Typography>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {children}
      </Box>
    </Box>
  );
}

const OWM_LAYERS = [
  { id: null, label: 'Nonaktif' },
  { id: 'precipitation_new', label: 'Hujan' },
  { id: 'clouds_new', label: 'Awan' },
];

/**
 * Bare Space segment content — every sky-side control, no positioning/chrome.
 * Shared by the desktop floating panel (below) and the mobile bottom sheet
 * (MobileControlSheet), which supplies its own container.
 */
export function SkySegmentContent({
  activeLayer, onToggleHimawari,
  showWind, onToggleWind, windStatus,
  owmLayer, onOwmChange,
  hideTitle,
}) {
  const himawariActive = activeLayer === 'himawari';

  return (
    <SegmentGroup title="Space segment" hideTitle={hideTitle}>
      <VendorCard title="JMA Himawari-9" accent="var(--nirmala-cyan)">
        <LayerSwitch
          checked={himawariActive}
          onChange={onToggleHimawari}
          label={METRICS.himawari.label}
          info={METRICS.himawari.legendNote}
        />
      </VendorCard>

      <VendorCard
        title="OpenWeather"
        accent="var(--nirmala-cyan)"
        info="Lapisan curah hujan dari penyedia data cuaca global OpenWeather."
      >
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {OWM_LAYERS.map((o) => {
            const active = owmLayer === o.id;
            return (
              <Button
                key={o.label}
                onClick={() => onOwmChange(o.id)}
                disableRipple
                sx={{
                  flex: 1, minWidth: 0, px: 0.5, py: 0.5, fontSize: '0.68rem', fontWeight: 700,
                  borderRadius: 'var(--radius-sm, 4px)',
                  color: active ? 'var(--nirmala-cyan)' : 'text.secondary',
                  border: `1px solid ${active ? 'var(--nirmala-cyan-dim)' : 'transparent'}`,
                  background: active ? 'var(--nirmala-cyan-dim)' : 'rgba(255,255,255,0.03)',
                  '&:hover': { background: 'var(--nirmala-cyan-dim)' },
                }}
              >
                {o.label}
              </Button>
            );
          })}
        </Box>
        {/* Both Himawari (cloud-top IR) and this tile depict cloud/weather
            cover over the same area — layering them at full strength makes
            them hard to tell apart. OpenWeather's tile opacity is lowered
            automatically (see page.jsx) while Himawari is active; this note
            is the only way the user learns why the overlay looks fainter,
            since color alone can't communicate it (OpenWeather's tile
            colors are fixed server-side, not something we can restyle). */}
        {himawariActive && owmLayer && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
            Opacity diturunkan otomatis karena Himawari aktif
          </Typography>
        )}
        {onToggleWind && (
          <LayerSwitch checked={showWind} onChange={onToggleWind} label="Angin (partikel)" status={windStatus} />
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
          Data diperbarui otomatis setiap ±10 menit.
        </Typography>
        <Typography
          variant="caption"
          component="a"
          href="https://openweathermap.org"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'text.secondary', fontSize: 10, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          Data cuaca oleh OpenWeather
        </Typography>
      </VendorCard>

      <VendorCard title="NASA (FIRMS & GIBS)" accent="var(--nirmala-cyan)" active={false} />
      <VendorCard title="Sentinel (ESA Copernicus)" accent="var(--nirmala-cyan)" active={false} />
    </SegmentGroup>
  );
}

/**
 * Bare Ground Segment content — every ground-side control, no
 * positioning/chrome. Shared the same way as SkySegmentContent above.
 */
export function GroundSegmentContent({
  activeLayer, onLayerChange, showMarkers, onToggleMarkers, showCoverage, onToggleCoverage,
  permissions,
  hideTitle,
}) {
  // Fail-open: a control is only hidden when the manifest explicitly says
  // `false`. Undefined/null (manifest not loaded yet, or flag absent) keeps
  // it visible — same rule MetricLayerSelector used.
  const canViewSensor = permissions?.can_view_sensor !== false;
  const showSensorToggles = activeLayer === 'rain' || activeLayer === 'himawari';

  return (
    <SegmentGroup title="Ground Segment" hideTitle={hideTitle}>
      <VendorCard title="Nirmala Data" accent="var(--status-active, #34d399)">
        <ModeButton active={activeLayer === 'rain'} icon={METRICS.rain.icon} label={METRICS.rain.label} onClick={() => onLayerChange('rain')} />
        <ModeButton active={activeLayer === 'mesh'} icon={METRICS.mesh.icon} label={METRICS.mesh.label} onClick={() => onLayerChange('mesh')} info={METRICS.mesh.legendNote} />

        {canViewSensor && showSensorToggles && (
          <>
            <LayerSwitch checked={showCoverage} onChange={onToggleCoverage} label="Cakupan Sensor" />
            <LayerSwitch checked={showMarkers} onChange={onToggleMarkers} label="Titik Sensor" />
          </>
        )}
      </VendorCard>

      <VendorCard title="BMKG" accent="var(--status-active, #34d399)" active={false} />
      <VendorCard title="Maxar" accent="var(--status-active, #34d399)" active={false} />
    </SegmentGroup>
  );
}

const EXPANDED_WIDTH = 280;
const COLLAPSED_SIZE = 44;
const collapseTransition = { duration: 0.28, ease: [0.2, 0, 0, 1] }; // matches --ease-standard

/**
 * Desktop/tablet-landscape floating panel chrome — expanded shows an icon +
 * title header (click to collapse) above the scrollable content; collapsed
 * shrinks to a single icon-only square matching MapControls' button style,
 * freeing map real estate. Sky and Ground each hold their own independent
 * collapse state, animated with motion/react for a smooth width/fade
 * transition rather than an instant show/hide.
 *
 * `resetActive`/`onResetToggle` (optional): a master switch next to the
 * title that turns every boolean control in this panel on/off at once —
 * see handleResetFilters in page.jsx for what "default" means per segment.
 */
function CollapsiblePanel({ icon, title, children, resetActive, onResetToggle }) {
  const [open, setOpen] = useState(true);

  return (
    <Box
      component={motion.div}
      transition={collapseTransition}
      animate={{ width: open ? EXPANDED_WIDTH : COLLAPSED_SIZE }}
      onClick={() => !open && setOpen(true)}
      sx={{
        zIndex: 'var(--z-overlay, 100)',
        overflow: 'hidden',
        // display:flex + minHeight:0 here (not just on the scrollable child)
        // is what lets this panel actually shrink when the sidebar column
        // runs out of room — without it, overflow:hidden alone gives this
        // box an implicit min-height of 0 that the flex PARENT can shrink
        // past, silently clipping content instead of letting the child's
        // own overflowY:auto take over.
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--nirmala-glass-bg)',
        border: '1px solid var(--nirmala-glass-border)',
        borderRadius: open ? 'var(--radius-lg, 12px)' : 'var(--radius-md, 8px)',
        cursor: open ? 'default' : 'pointer',
      }}
    >
      <Box
        onClick={(e) => { if (open) { e.stopPropagation(); setOpen(false); } }}
        sx={{
          display: 'flex', alignItems: 'center',
          justifyContent: open ? 'space-between' : 'center',
          gap: 1, height: COLLAPSED_SIZE, px: open ? 1.75 : 0,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Icon icon={icon} width={20} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
          <AnimatePresence>
            {open && (
              <Box
                component={motion.span}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                sx={{ ...eyebrowSx, whiteSpace: 'nowrap', overflow: 'hidden' }}
              >
                {title}
              </Box>
            )}
          </AnimatePresence>
        </Box>
        {open && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            {onResetToggle && (
              <Tooltip title={resetActive ? 'Matikan semua filter' : 'Aktifkan semua filter'}>
                <Switch
                  checked={resetActive}
                  onChange={(e) => { e.stopPropagation(); onResetToggle(e.target.checked); }}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                  sx={switchSx}
                />
              </Tooltip>
            )}
            <Tooltip title="Sembunyikan panel">
              <IconButton size="small" disableRipple sx={{ p: 0.25, color: 'text.secondary', flexShrink: 0 }}>
                <Icon icon="material-symbols:chevron-left-rounded" width={18} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      <AnimatePresence>
        {open && (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            sx={{ width: EXPANDED_WIDTH, display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}
          >
            <Box sx={{ px: 1.75, pb: 1.75, maxHeight: 'min(320px, 38vh)', flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              {children}
            </Box>
          </Box>
        )}
      </AnimatePresence>
    </Box>
  );
}

/** Desktop/tablet-landscape floating panel — collapsible chrome around SkySegmentContent. */
export function SkySegmentPanel({ skyFilterActive, onSkyFilterToggle, ...props }) {
  return (
    <CollapsiblePanel icon="material-symbols:satellite-alt-rounded" title="Space segment" resetActive={skyFilterActive} onResetToggle={onSkyFilterToggle}>
      <SkySegmentContent {...props} hideTitle />
    </CollapsiblePanel>
  );
}

/** Desktop/tablet-landscape floating panel — collapsible chrome around GroundSegmentContent. */
export function GroundSegmentPanel({ groundFilterActive, onGroundFilterToggle, ...props }) {
  return (
    <CollapsiblePanel icon="material-symbols:sensors-rounded" title="Ground Segment" resetActive={groundFilterActive} onResetToggle={onGroundFilterToggle}>
      <GroundSegmentContent {...props} hideTitle />
    </CollapsiblePanel>
  );
}
