'use client';

import { useState } from 'react';
import { Box, Button, Typography, FormControlLabel, Switch, Slider, Tooltip, Chip, IconButton } from '@mui/material';
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
  [LAYER_STATUS.EMPTY]: { color: '#5b6b82', title: 'No data to display right now.' },
  [LAYER_STATUS.ERROR]: { color: '#f59e0b', title: 'Failed to load data.' },
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
          <Tooltip title="Awaiting backend integration" placement="top">
            <Chip
              label="Coming soon"
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
  { id: null, label: 'Off' },
  { id: 'precipitation_new', label: 'Rain' },
  { id: 'clouds_new', label: 'Clouds' },
];

/**
 * Bare Space segment content — every sky-side control, no positioning/chrome.
 * Shared by the desktop floating panel (below) and the mobile bottom sheet
 * (MobileControlSheet), which supplies its own container.
 */
export function SkySegmentContent({
  activeLayer, onToggleHimawari,
  showWind, onToggleWind, windStatus,
  avgWindSpeedKmh, windSpeedMultiplier, onWindSpeedMultiplierChange,
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
        info="Rain and cloud cover layers from the OpenWeather global weather data provider."
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
            Opacity automatically reduced while Himawari is active
          </Typography>
        )}
        {onToggleWind && (
          <LayerSwitch checked={showWind} onChange={onToggleWind} label="Wind (particles)" status={windStatus} />
        )}
        {onToggleWind && showWind && (
          <>
            {avgWindSpeedKmh != null && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                ~{avgWindSpeedKmh.toFixed(1)} km/h avg
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem', flexShrink: 0 }}>
                Particle speed
              </Typography>
              <Slider
                size="small"
                min={0.5}
                max={2.5}
                step={0.1}
                value={windSpeedMultiplier}
                onChange={(_, v) => onWindSpeedMultiplierChange(v)}
                sx={{ color: 'var(--nirmala-cyan)' }}
                aria-label="Particle speed multiplier"
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v.toFixed(1)}×`}
              />
            </Box>
          </>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
          Data refreshes automatically every ~10 minutes.
        </Typography>
        <Typography
          variant="caption"
          component="a"
          href="https://openweathermap.org"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'text.secondary', fontSize: 10, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          Weather data by OpenWeather
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
            <LayerSwitch checked={showCoverage} onChange={onToggleCoverage} label="Sensor Coverage" />
            <LayerSwitch checked={showMarkers} onChange={onToggleMarkers} label="Sensor Points" />
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
function CollapsiblePanel({ icon, title, titleContent, children, resetActive, onResetToggle }) {
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
          {/* When titleContent (the tab switcher) is shown, its own per-tab
              icon already identifies the segment — a second leading icon
              here just stacked/cluttered against it. Only show this one
              when collapsed (titleContent is unmounted then) or in plain
              title mode. */}
          {(!titleContent || !open) && (
            <Icon icon={icon} width={20} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
          )}
          <AnimatePresence>
            {open && (
              <Box
                component={motion.span}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                sx={titleContent ? { overflow: 'hidden' } : { ...eyebrowSx, whiteSpace: 'nowrap', overflow: 'hidden' }}
              >
                {titleContent ?? title}
              </Box>
            )}
          </AnimatePresence>
        </Box>
        {open && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            {onResetToggle && (
              <Tooltip title={resetActive ? 'Turn off all filters' : 'Turn on all filters'}>
                <Switch
                  checked={resetActive}
                  onChange={(e) => { e.stopPropagation(); onResetToggle(e.target.checked); }}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                  sx={switchSx}
                />
              </Tooltip>
            )}
            <Tooltip title="Hide panel">
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

const SEGMENT_TABS = [
  { key: 'sky', label: 'Space', icon: 'material-symbols:satellite-alt-rounded' },
  { key: 'ground', label: 'Ground', icon: 'material-symbols:sensors-rounded' },
];

// Pill switcher filling CollapsiblePanel's 44px-tall header row — same
// visual language as TabSwitcher.jsx (Current/Timeline). Sized larger now
// that it no longer shares the row with a separate leading panel icon (see
// CollapsiblePanel above), so it reads as the header's main content.
function SegmentTabSwitcher({ activeTab, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.25, p: 0.25, borderRadius: 'var(--radius-full, 9999px)', background: 'rgba(255,255,255,0.03)' }}>
      {SEGMENT_TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Button
            key={tab.key}
            onClick={(e) => { e.stopPropagation(); onChange(tab.key); }}
            disableRipple
            startIcon={<Icon icon={tab.icon} width={17} />}
            sx={{
              px: 1.5, height: 36, gap: 0.75, minWidth: 0,
              fontSize: '0.8rem', fontWeight: 700, textTransform: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              color: active ? 'var(--nirmala-cyan)' : 'var(--color-text-muted)',
              background: active ? 'var(--nirmala-cyan-dim)' : 'transparent',
              transition: 'color var(--duration-fast,150ms) var(--ease-standard), background var(--duration-fast,150ms) var(--ease-standard)',
              '&:hover': { background: active ? 'var(--nirmala-cyan-dim)' : 'rgba(255,255,255,0.06)' },
            }}
          >
            {tab.label}
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * Desktop/tablet-landscape floating panel — Space and Ground segment
 * content merged into a single collapsible panel, switched by tab instead
 * of being two separate panels. Each tab keeps its own independent
 * reset/show-hide master toggle (skyFilterActive/groundFilterActive) — see
 * handleSkyFilterToggle/handleGroundFilterToggle in page.jsx — so no
 * control is lost by merging the chrome.
 */
export function SegmentPanel({ skyFilterActive, onSkyFilterToggle, groundFilterActive, onGroundFilterToggle, ...contentProps }) {
  const [activeSegment, setActiveSegment] = useState('sky');
  const isSky = activeSegment === 'sky';

  return (
    <CollapsiblePanel
      icon={isSky ? 'material-symbols:satellite-alt-rounded' : 'material-symbols:sensors-rounded'}
      title={isSky ? 'Space segment' : 'Ground Segment'}
      titleContent={<SegmentTabSwitcher activeTab={activeSegment} onChange={setActiveSegment} />}
      resetActive={isSky ? skyFilterActive : groundFilterActive}
      onResetToggle={isSky ? onSkyFilterToggle : onGroundFilterToggle}
    >
      {isSky ? <SkySegmentContent {...contentProps} hideTitle /> : <GroundSegmentContent {...contentProps} hideTitle />}
    </CollapsiblePanel>
  );
}
