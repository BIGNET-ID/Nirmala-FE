/**
 * Nirmala API Service Layer
 * Integrates with the official Nirmala backend (c4c-nirmala.api.bignet.host),
 * proxied through /api/* (see app/api/[...path]/route.js). Based on PRD
 * Section 7: Technical API Contract & Data Schema.
 *
 * Resilience fallback: if the backend has a transient hiccup, each method
 * falls back to a CAPTURED REAL RESPONSE fixture served from /public/fixtures
 * — NOT fabricated data. Fixtures carry the true field shape (binary is_raining +
 * status for /api/sensors; numeric rain+signal for /api/timeseries).
 */

'use client';

import { nirmalaApi } from './axios';

/** Fetch a captured real-response fixture from /public/fixtures. */
async function loadFixture(name) {
  try {
    const res = await fetch(`/fixtures/${name}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fixture ${name} HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[Nirmala API] Fixture "${name}" unavailable:`, err.message);
    return null;
  }
}

export const nirmalaApiService = {
  /** GET /api/sensors — snapshot 4.500+ stasiun sensor. Refresh on load. */
  async getSensors() {
    try {
      return await nirmalaApi.get('/api/sensors');
    } catch (error) {
      console.warn('[Nirmala API] sensor source unavailable, using real-response fixture:', error.message);
      return (await loadFixture('sensors')) || { sensors: [] };
    }
  },

  /**
   * GET /api/timeseries/{sensor_id}/latest?minutes={minutes} — rain (mm,
   * 5min avg) + signal for just the last N minutes, already windowed
   * server-side (confirmed against the live API: returns the flat
   * `{ points: [{ ts, value }] }` shape, `ts` already carrying the
   * account's local offset). Used instead of the plain (unwindowed,
   * full-history) `/api/timeseries/{id}` endpoint since the dashboard only
   * ever shows the last hour — see SensorDetailDrawer.
   */
  async getLatestTimeseries(sensorId, minutes) {
    try {
      return await nirmalaApi.get(`/api/timeseries/${sensorId}/latest?minutes=${minutes}`);
    } catch (error) {
      console.warn(`[Nirmala API] /api/timeseries/${sensorId}/latest unavailable, using fixture:`, error.message);
      return await loadFixture('timeseries');
    }
  },

  /** GET /api/manifest — metadata platform, permissions, default map, statistik Kafka. */
  async getManifest() {
    try {
      return await nirmalaApi.get('/api/manifest');
    } catch (error) {
      console.warn('[Nirmala API] /api/manifest unavailable, using fixture:', error.message);
      return await loadFixture('manifest');
    }
  },

  /** GET /api/health — diagnostik pipeline Kafka. Refresh ~60s. */
  async getHealth() {
    try {
      return await nirmalaApi.get('/api/health');
    } catch (error) {
      console.warn('[Nirmala API] /api/health unavailable, using fixture:', error.message);
      return (await loadFixture('health')) || { connected: false, status: 'unknown' };
    }
  },

  /** GET /api/topics — daftar Kafka topics aktif. Developer panel. */
  async getTopics() {
    try {
      return await nirmalaApi.get('/api/topics');
    } catch (error) {
      console.warn('[Nirmala API] /api/topics unavailable, using fixture:', error.message);
      return (await loadFixture('topics')) || { topics: [] };
    }
  },
};

/**
 * Normalize a single raw sensor record to app shape. Shared by normalizeSensors
 * (REST snapshot array) and useSensorStream (per-event SSE payload), since the
 * live stream is expected to carry the same raw per-sensor shape as /api/sensors.
 */
export function normalizeSensor(s) {
  if (!s) return null;
  return {
    id: s.id,
    name: s.id,
    lat: s.latitude,
    lng: s.longitude,
    status: s.status,                 // 'active' | 'blacklisted' (raw, legacy — see category)
    category: s.category,             // 'active' | 'raining' | 'unavailable' | 'inactive' — the backend's authoritative classification, see statusBucket()
    isRaining: Boolean(s.is_raining),
    blacklisted: Boolean(s.blacklisted),
    manualBlacklisted: Boolean(s.manual_blacklisted),
    inactive: Boolean(s.inactive),
    unavailable: Boolean(s.unavailable),
    lastUpdate: s.last_update,
    scrapedAt: s._scraped_at,
  };
}

/**
 * Normalize sensors to app shape. Real /api/sensors is BINARY: is_raining + status,
 * no numeric rain/temp — so no numeric intensity/temperature is derived here.
 * Numeric rain (mm) comes from /api/timeseries per-sensor (see SensorDetailDrawer).
 */
export function normalizeSensors(apiResponse) {
  if (!apiResponse || !apiResponse.sensors) return [];
  return apiResponse.sensors.map(normalizeSensor);
}

/**
 * Extract the aggregate sensor category counts + human-readable alert line
 * the backend now computes itself (active/raining/unavailable/inactive),
 * so the frontend no longer has to re-tally these from the sensor list —
 * see the `stats` memo in the dashboard page. `blacklisted` has no count
 * here (it's a per-sensor flag, not one of the backend's categories), so
 * that count is still derived client-side via statusBucket().
 */
export function extractSensorMeta(apiResponse) {
  return {
    categories: apiResponse?.categories ?? null,
    alert: apiResponse?.alert ?? null,
  };
}

/** Extract the default map view from manifest (account.default_map). */
export function getDefaultMap(manifest) {
  const dm = manifest?.account?.default_map;
  if (!dm) return null;
  return { lat: dm.lat, lng: dm.lng, zoom: dm.zoom };
}

/**
 * Parse a timeseries response into {rain, signal} series ready for charts.
 *
 * The backend has been observed returning TWO different shapes for the same
 * endpoint depending on query params (see docs/api/nirmala-rainvision-api-analysis.md):
 *   - no from/to: wrapped `{ chart_data: { labels, datasets: [{ label, data }] } }`
 *     (rain) / `{ signal_data: {...} }` (signal) — dataset label is
 *     "Rainfall (mm) - 5min average" etc.
 *   - explicit from/to: flat `{ points: [{ ts, value }], total_records }`,
 *     with `ts` already carrying the account's local offset (e.g. WIB
 *     +07:00) instead of the labels' compact "MM-DD HH:mm" strings.
 * Both are handled explicitly here rather than assuming one — see the doc's
 * note on confirming the contract with backend before trusting either shape
 * silently.
 */
export function normalizeTimeseries(apiResponse) {
  const pickSeries = (block) => {
    if (!block) return null;
    if (Array.isArray(block.points)) {
      return {
        label: block.label || '',
        labels: block.points.map((p) => p.ts),
        data: block.points.map((p) => p.value),
      };
    }
    // rain nests under chart_data; signal nests under signal_data — same shape.
    const cd = block.chart_data || block.signal_data;
    if (!cd || !Array.isArray(cd.datasets) || cd.datasets.length === 0) return null;
    const ds = cd.datasets[0];
    return {
      label: ds.label || '',
      labels: cd.labels || [],
      data: Array.isArray(ds.data) ? ds.data : [],
    };
  };
  return {
    sensorId: apiResponse?.sensor_id ?? null,
    rain: pickSeries(apiResponse?.rain),
    signal: pickSeries(apiResponse?.signal),
  };
}
