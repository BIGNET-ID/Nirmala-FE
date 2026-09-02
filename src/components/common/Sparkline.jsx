'use client';

import { useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Lightweight dependency-free SVG sparkline (BIGNET DS v19 dark-glass).
 * variant 'bar' (rain mm) or 'line'/'area' (signal). Long series are
 * downsampled to keep the DOM small: 'max' per bucket for bars (preserves
 * rain spikes), 'avg' for lines. Strokes use non-scaling-stroke so the
 * non-uniform viewBox scale never distorts them.
 *
 * Axis + hover: a baseline and min/max scale labels are rendered outside
 * the SVG (as HTML), not as SVG <text> — the viewBox uses
 * preserveAspectRatio="none" with a fixed 300-unit width, so text drawn
 * inside it would stretch/squash whenever the rendered width isn't 300px.
 * The horizontal baseline itself is safe inside the SVG (a horizontal line
 * stays horizontal regardless of x-scale). Hover/touch crosshair uses
 * Pointer Events so mouse hover and touch-drag share one code path.
 *
 * Shared time axis (rangeStart/rangeEnd): two Sparklines showing different
 * metrics for the same sensor (e.g. rain + signal) can have wildly
 * different point counts and gaps — rain may only have 880 records over
 * 12 days (sensor connectivity gaps) while signal has a gapless 3489.
 * Plotting each by INDEX position (as if evenly spaced) makes the same
 * horizontal position mean a different real time in each chart, which is
 * misleading when they're shown stacked for comparison. Passing the same
 * rangeStart/rangeEnd to both instances makes both plot against real
 * elapsed time instead: matching x-positions are now genuinely the same
 * moment, and connectivity gaps show as honest blank space rather than
 * being smoothed away. Without these props, a Sparkline falls back to its
 * own index-based layout (unchanged, for standalone usage).
 */

const W = 300;

function downsampleByIndex(data, buckets, mode) {
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

/**
 * Bucket {v, label} points into `buckets` equal-width slices of real time
 * across [rangeStartMs, rangeEndMs]. A slice nothing falls into is `null`
 * (a genuine gap), not 0 — 0 mm of rain is real data, "no reading at all"
 * is not the same thing and must not be drawn as if it were.
 */
function downsampleByTime(points, rangeStartMs, rangeEndMs, buckets, mode) {
  const span = (rangeEndMs - rangeStartMs) || 1;
  const sliceWidth = span / buckets;
  const acc = new Array(buckets).fill(mode === 'max' ? -Infinity : 0);
  const counts = new Array(buckets).fill(0);
  for (const { v, label } of points) {
    const d = parseLabel(label);
    if (!d) continue;
    let b = Math.floor((d.getTime() - rangeStartMs) / sliceWidth);
    if (b < 0) b = 0; else if (b > buckets - 1) b = buckets - 1;
    if (mode === 'max') acc[b] = Math.max(acc[b], v);
    else acc[b] += v;
    counts[b] += 1;
  }
  return acc.map((val, i) => (counts[i] === 0 ? null : (mode === 'max' ? val : val / counts[i])));
}

/** Pick a representative label at a 0..1 position along the label array. */
function pickLabel(labels, ratio) {
  if (!labels || !labels.length) return null;
  const idx = Math.round(ratio * (labels.length - 1));
  return labels[idx] ?? null;
}

/**
 * Parse a Nirmala timeseries label ("18 Agu, 04.45"-style API value, e.g.
 * "08-18 04:45" with no year, or a full ISO string) into a Date. Exported
 * so callers can compute a shared rangeStart/rangeEnd across two series
 * without duplicating this parsing logic.
 */
export function parseLabel(raw) {
  if (raw == null || raw === '') return null;
  // Nirmala timeseries labels have no year ("08-18 04:45") — resolve against
  // the current year, same approach as lib/timeTravelRange's sensor parser.
  const compact = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(raw));
  const d = compact
    ? new Date(new Date().getFullYear(), +compact[1] - 1, +compact[2], +compact[3], +compact[4])
    : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d) {
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Render API time labels as "18 Agu, 04.45" (date + time, not just HH:mm —
 * a bare hour:minute is ambiguous once a series spans more than one day,
 * which the rain/signal timeseries usually does).
 */
function formatTimeLabel(raw) {
  const d = parseLabel(raw);
  return d ? formatDate(d) : (raw == null ? '' : String(raw));
}

export default function Sparkline({
  data = [],
  labels = [],
  variant = 'line',
  color = '#00e5ff',
  height = 56,
  buckets = 120,
  ariaLabel,
  rangeStart,
  rangeEnd,
}) {
  const wrapRef = useRef(null);
  // { index, xRatio } of the hovered/touched point, or null when idle.
  // xRatio (0..1) is measured straight from the pointer event so the
  // tooltip can be positioned in real pixels without re-deriving it from
  // the SVG's own (non-uniformly scaled) coordinate system.
  const [hover, setHover] = useState(null);

  const rangeStartMs = rangeStart != null ? +rangeStart : null;
  const rangeEndMs = rangeEnd != null ? +rangeEnd : null;
  const useTimeRange = rangeStartMs != null && rangeEndMs != null && rangeEndMs > rangeStartMs;
  const mode = variant === 'bar' ? 'max' : 'avg';

  let pts;
  if (useTimeRange) {
    const points = (data || [])
      .map((v, i) => ({ v, label: labels?.[i] }))
      .filter((p) => typeof p.v === 'number' && !Number.isNaN(p.v));
    pts = downsampleByTime(points, rangeStartMs, rangeEndMs, buckets, mode);
  } else {
    const clean = (data || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    pts = clean.length ? downsampleByIndex(clean, buckets, mode) : [];
  }
  const n = pts.length;
  const hasAnyValue = pts.some((v) => typeof v === 'number' && !Number.isNaN(v));

  if (!hasAnyValue) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'text.secondary', fontSize: '0.75rem', border: '1px dashed rgba(255,255,255,0.1)',
        borderRadius: 1 }}>
        Tidak ada data
      </Box>
    );
  }

  const numericPts = pts.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const max = variant === 'bar' ? Math.max(...numericPts, 0.0001) : Math.max(...numericPts);
  const min = variant === 'bar' ? 0 : Math.min(...numericPts);
  const range = max - min || 1;
  const H = height;
  const y = (v) => H - ((v - min) / range) * (H - 4) - 2;
  const baselineY = H - 2;
  const uid = `sl-${Math.round(min)}-${Math.round(max)}-${n}`;

  const hasLabels = useTimeRange || (labels && labels.length > 0);

  // x position (in the 0..300 SVG user-space) of data point i, matching
  // however that variant actually plots it.
  const bw = W / n;
  const step = W / (n - 1 || 1);
  const xOf = (i) => (variant === 'bar' ? i * bw + bw * 0.5 : i * step);

  const updateHoverFromClientX = (clientX) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.round(xRatio * (n - 1));
    setHover({ index, xRatio });
  };

  const hoveredValue = hover ? pts[hover.index] : null;
  const hoveredHasValue = hover && typeof hoveredValue === 'number' && !Number.isNaN(hoveredValue);
  const hoveredLabel = hover
    ? (useTimeRange
        ? formatDate(new Date(rangeStartMs + (hover.index + 0.5) * ((rangeEndMs - rangeStartMs) / n)))
        : (labels && labels.length ? formatTimeLabel(pickLabel(labels, hover.index / (n - 1 || 1))) : null))
    : null;

  // Start/mid/end axis labels: from the shared range when present (so both
  // charts show identical text), otherwise from this series' own labels.
  const axisLabels = useTimeRange
    ? [formatDate(new Date(rangeStartMs)), formatDate(new Date((rangeStartMs + rangeEndMs) / 2)), formatDate(new Date(rangeEndMs))]
    : [formatTimeLabel(pickLabel(labels, 0)), formatTimeLabel(pickLabel(labels, 0.5)), formatTimeLabel(pickLabel(labels, 1))];

  // Contiguous (non-null) runs of points, for line/area — a gap breaks the
  // line instead of interpolating across it.
  const segments = [];
  let current = [];
  pts.forEach((v, i) => {
    if (typeof v === 'number' && !Number.isNaN(v)) current.push([i, v]);
    else if (current.length) { segments.push(current); current = []; }
  });
  if (current.length) segments.push(current);

  return (
    <Box
      ref={wrapRef}
      sx={{ position: 'relative' }}
      onPointerDown={(e) => updateHoverFromClientX(e.clientX)}
      onPointerMove={(e) => { if (e.pressure > 0 || e.pointerType === 'mouse') updateHoverFromClientX(e.clientX); }}
      onPointerUp={() => setHover(null)}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
    {/* Min/max scale labels — plain HTML, not SVG text (see file doc comment). */}
    <Typography sx={{ position: 'absolute', top: 0, left: 2, fontSize: 9, lineHeight: 1, color: 'text.secondary', pointerEvents: 'none' }}>
      {max.toFixed(1)}
    </Typography>
    <Typography sx={{ position: 'absolute', top: baselineY - 9, left: 2, fontSize: 9, lineHeight: 1, color: 'text.secondary', pointerEvents: 'none' }}>
      {min.toFixed(1)}
    </Typography>

    <Box
      component="svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel || `chart (${n} points, max ${max.toFixed(2)})`}
      sx={{ width: '100%', height, display: 'block', touchAction: 'none' }}
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Baseline (x-axis) — a horizontal line stays horizontal regardless
          of the viewBox's non-uniform x-scale, so it's safe to draw here
          (unlike text, see file doc comment). */}
      <line x1="0" y1={baselineY} x2={W} y2={baselineY} stroke="var(--nirmala-glass-border)"
        strokeWidth="1" vectorEffect="non-scaling-stroke" />

      {variant === 'bar' &&
        pts.map((v, i) => {
          if (v == null) return null; // real gap — draw nothing, not a zero-height bar
          const h = H - y(v) - 2;
          return (
            <rect key={i} x={i * bw + bw * 0.15} y={y(v)} width={bw * 0.7}
              height={Math.max(0, h)} fill={color} opacity={v > 0 ? 0.9 : 0.15} rx="0.5" />
          );
        })}

      {(variant === 'line' || variant === 'area') && segments.map((seg, si) => {
        const line = seg.map(([i, v], k) => `${k === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
        const firstX = (seg[0][0] * step).toFixed(2);
        const lastX = (seg[seg.length - 1][0] * step).toFixed(2);
        const area = `${line} L${lastX},${H} L${firstX},${H} Z`;
        return (
          <g key={si}>
            {variant === 'area' && <path d={area} fill={`url(#${uid})`} />}
            <path d={line} fill="none" stroke={color} strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}

      {hover && (
        <>
          <line x1={xOf(hover.index)} y1="0" x2={xOf(hover.index)} y2={H}
            stroke="var(--nirmala-glass-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {hoveredHasValue && (
            <circle cx={xOf(hover.index)} cy={y(hoveredValue)} r="2.5" fill={color}
              vectorEffect="non-scaling-stroke" />
          )}
        </>
      )}
    </Box>

    {hover && (
      <Box
        sx={{
          position: 'absolute',
          top: 2,
          left: `${hover.xRatio * 100}%`,
          transform: hover.xRatio > 0.7 ? 'translateX(-100%)' : hover.xRatio < 0.3 ? 'none' : 'translateX(-50%)',
          px: 0.75, py: 0.4,
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'var(--nirmala-glass-bg)',
          border: '1px solid var(--nirmala-glass-border)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
          {hoveredHasValue ? hoveredValue.toFixed(2) : 'Tidak ada data'}
        </Typography>
        {hoveredLabel && (
          <Typography sx={{ fontSize: 9, color: 'text.secondary', lineHeight: 1.3 }}>
            {hoveredLabel}
          </Typography>
        )}
      </Box>
    )}

    {hasLabels && (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        {axisLabels.map((text, i) => (
          <Typography key={i} variant="caption" sx={{ fontSize: 10, lineHeight: 1.4, color: 'text.secondary' }}>
            {text}
          </Typography>
        ))}
      </Box>
    )}
    </Box>
  );
}
