import { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'motion/react';
import { METRICS } from '@/constants/metrics';

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'text.secondary',
};

/** Bare legend content — shared by the desktop floating card and the mobile bottom sheet. */
export function ColorRampLegendContent({ activeLayer, showCoverage = false, meshDistanceRange = null }) {
  const metric = METRICS[activeLayer];
  if (!metric) return null;

  // Mesh Map's min/max depend on the actual national sensor layout, so
  // they're computed by MeshLayer and passed down here rather than a fixed
  // label in METRICS — real km numbers, not a static "Dekat"/"Jauh" guess.
  const minLabel = activeLayer === 'mesh' && meshDistanceRange
    ? `${meshDistanceRange.minDistanceKm.toFixed(1)} km`
    : metric.minLabel;
  const maxLabel = activeLayer === 'mesh' && meshDistanceRange
    ? `${meshDistanceRange.maxDistanceKm.toFixed(1)} km`
    : metric.maxLabel;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Typography sx={{ ...eyebrowSx, display: 'block' }}>
          {metric.label}
        </Typography>
        {activeLayer === 'rain' && metric.legendNote && (
          <Tooltip title={metric.legendNote}>
            <Icon icon="material-symbols:info-outline-rounded" width={13} style={{ color: 'var(--nirmala-cyan)', flexShrink: 0 }} />
          </Tooltip>
        )}
      </Box>

      {metric.colorRamp && metric.tickLabels ? (
        // Windy/BMKG-style tick-marked bar: N evenly-spaced qualitative
        // labels instead of two end labels — see AGENTS.md design
        // guardrails for why a full spectrum is used here (not "AI rainbow").
        <>
          <Box sx={{ position: 'relative', height: 12, borderRadius: 999, background: metric.colorRamp, mb: 0.5, border: '1px solid rgba(148,163,184,0.12)' }}>
            {metric.tickLabels.slice(1, -1).map((label, i) => (
              <Box
                key={label}
                sx={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${((i + 1) / (metric.tickLabels.length - 1)) * 100}%`,
                  width: '1px', bgcolor: 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </Box>
          <Box sx={{ position: 'relative', height: 14 }}>
            {metric.tickLabels.map((label, i) => {
              const pct = (i / (metric.tickLabels.length - 1)) * 100;
              const isFirst = i === 0;
              const isLast = i === metric.tickLabels.length - 1;
              return (
                <Typography
                  key={label}
                  variant="caption"
                  sx={{
                    position: 'absolute', left: `${pct}%`,
                    transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                    fontSize: '0.62rem', color: 'text.secondary', whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Typography>
              );
            })}
          </Box>
        </>
      ) : metric.colorRamp ? (
        <>
          <Box sx={{ height: 12, borderRadius: 999, background: metric.colorRamp, mb: 0.75, border: '1px solid rgba(148,163,184,0.12)' }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'text.secondary' }}>
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </Box>
        </>
      ) : null}

      {metric.legendNote && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.4 }}>
          {metric.legendNote}
        </Typography>
      )}

      {activeLayer === 'rain' && showCoverage && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, pt: 1, borderTop: '1px solid var(--nirmala-glass-border)' }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', background: 'linear-gradient(135deg, #14466e, #40b4cd)', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', lineHeight: 1.3 }}>
            Jaringan sensor aktif (tidak hujan)
          </Typography>
        </Box>
      )}
    </Box>
  );
}

const legendCollapseTransition = { duration: 0.28, ease: [0.2, 0, 0, 1] }; // matches --ease-standard

/** Desktop/tablet-landscape floating card — positions ColorRampLegendContent over the map. */
export default function ColorRampLegend(props) {
  const [open, setOpen] = useState(true);
  const metric = METRICS[props.activeLayer];
  if (!metric) return null;

  return (
    <Box
      component={motion.div}
      transition={legendCollapseTransition}
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
        <Tooltip title={open ? 'Sembunyikan legenda' : 'Tampilkan legenda'}>
          <IconButton size="small" disableRipple sx={{ p: 0.25, color: 'text.secondary' }}>
            <Icon icon={open ? 'material-symbols:chevron-right-rounded' : metric.icon} width={18} style={!open ? { color: 'var(--nirmala-cyan)' } : undefined} />
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
            <ColorRampLegendContent {...props} />
          </Box>
        )}
      </AnimatePresence>
    </Box>
  );
}
