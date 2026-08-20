'use client';

import { Box, Typography } from '@mui/material';

/**
 * Lightweight dependency-free SVG sparkline (BIGNET DS v19 dark-glass).
 * variant 'bar' (rain mm) or 'line'/'area' (signal). Long series are
 * downsampled to keep the DOM small: 'max' per bucket for bars (preserves
 * rain spikes), 'avg' for lines. Strokes use non-scaling-stroke so the
 * non-uniform viewBox scale never distorts them.
 */

const W = 300;

function downsample(data, buckets, mode) {
  if (data.length <= buckets) return data.slice();
  const size = data.length / buckets;
  const out = [];
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size);
    const end = Math.min(data.length, Math.floor((i + 1) * size));
    let acc = mode === 'max' ? -Infinity : 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      const v = data[j] ?? 0;
      if (mode === 'max') acc = Math.max(acc, v);
      else { acc += v; n++; }
    }
    out.push(mode === 'max' ? (acc === -Infinity ? 0 : acc) : (n ? acc / n : 0));
  }
  return out;
}

/** Pick a representative label at a 0..1 position along the label array. */
function pickLabel(labels, ratio) {
  if (!labels || !labels.length) return null;
  const idx = Math.round(ratio * (labels.length - 1));
  return labels[idx] ?? null;
}

/**
 * Render API time labels as "18 Agu, 04.45" (date + time, not just HH:mm —
 * a bare hour:minute is ambiguous once a series spans more than one day,
 * which the rain/signal timeseries usually does).
 */
function formatTimeLabel(raw) {
  if (raw == null || raw === '') return '';
  // Nirmala timeseries labels have no year ("08-18 04:45") — resolve against
  // the current year, same approach as lib/timeTravelRange's sensor parser.
  const compact = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(raw));
  const d = compact
    ? new Date(new Date().getFullYear(), +compact[1] - 1, +compact[2], +compact[3], +compact[4])
    : new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return String(raw);
}

export default function Sparkline({
  data = [],
  labels = [],
  variant = 'line',
  color = '#00e5ff',
  height = 56,
  buckets = 120,
  ariaLabel,
}) {
  const clean = (data || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'text.secondary', fontSize: '0.75rem', border: '1px dashed rgba(255,255,255,0.1)',
        borderRadius: 1 }}>
        Tidak ada data
      </Box>
    );
  }

  const pts = downsample(clean, buckets, variant === 'bar' ? 'max' : 'avg');
  const n = pts.length;
  const max = Math.max(...pts, variant === 'bar' ? 0.0001 : Math.max(...pts));
  const min = variant === 'bar' ? 0 : Math.min(...pts);
  const range = max - min || 1;
  const H = height;
  const y = (v) => H - ((v - min) / range) * (H - 4) - 2;
  const uid = `sl-${Math.round(min)}-${Math.round(max)}-${n}`;

  const hasLabels = labels && labels.length > 0;

  return (
    <Box>
    <Box
      component="svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel || `chart (${n} points, max ${max.toFixed(2)})`}
      sx={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {variant === 'bar' &&
        pts.map((v, i) => {
          const bw = W / n;
          const h = H - y(v) - 2;
          return (
            <rect key={i} x={i * bw + bw * 0.15} y={y(v)} width={bw * 0.7}
              height={Math.max(0, h)} fill={color} opacity={v > 0 ? 0.9 : 0.15} rx="0.5" />
          );
        })}

      {(variant === 'line' || variant === 'area') && (() => {
        const step = W / (n - 1 || 1);
        const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
        const area = `${line} L${W},${H} L0,${H} Z`;
        return (
          <>
            {variant === 'area' && <path d={area} fill={`url(#${uid})`} />}
            <path d={line} fill="none" stroke={color} strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </>
        );
      })()}
    </Box>
    {hasLabels && (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary',
          fontFamily: 'var(--font-family-mono)' }}>
          {formatTimeLabel(pickLabel(labels, 0))}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary',
          fontFamily: 'var(--font-family-mono)' }}>
          {formatTimeLabel(pickLabel(labels, 0.5))}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary',
          fontFamily: 'var(--font-family-mono)' }}>
          {formatTimeLabel(pickLabel(labels, 1))}
        </Typography>
      </Box>
    )}
    </Box>
  );
}
