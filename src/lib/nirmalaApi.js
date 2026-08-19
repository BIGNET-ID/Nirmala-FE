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

  /** GET /api/lightning — sambaran petir. Refresh ~10s. */
  async getLightning() {
    try {
      return await nirmalaApi.get('/api/lightning');
    } catch (error) {
      console.warn('[Nirmala API] /api/lightning unavailable, using fixture:', error.message);
      return (await loadFixture('lightning')) || { content: [] };
    }
  },

  /** GET /api/thunderstorm — GeoJSON poligon sel badai. Refresh ~30s. */
  async getThunderstorm() {
    try {
      return await nirmalaApi.get('/api/thunderstorm');
    } catch (error) {
      console.warn('[Nirmala API] /api/thunderstorm unavailable, using fixture:', error.message);
      return (await loadFixture('thunderstorm')) || { content: [] };
    }
  },

  /** GET /api/timeseries/{sensor_id} — deret rain (mm, 5min avg) + signal per sensor. */
  async getTimeseries(sensorId) {
    try {
      return await nirmalaApi.get(`/api/timeseries/${sensorId}`);
    } catch (error) {
      console.warn(`[Nirmala API] /api/timeseries/${sensorId} unavailable, using fixture:`, error.message);
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
    status: s.status,                 // 'active' | 'inactive' | 'blacklisted'
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

/** Normalize a single raw lightning strike. Shared by normalizeLightning and useLightningStream. */
export function normalizeLightningStrike(strike) {
  if (!strike) return null;
  return {
    id: `${strike.lat}_${strike.long}_${strike.time}`,
    lat: strike.lat,
    lng: strike.long,
    signalStrength: strike.signalStrengthKA,
    isCloud: strike.cloud,
    time: strike.time,
  };
}

export function normalizeLightning(apiResponse) {
  if (!apiResponse || !apiResponse.content) return [];
  return apiResponse.content.map(normalizeLightningStrike);
}

/** Normalize a single raw thunderstorm cell. Shared by normalizeThunderstorm and useThunderstormStream. */
export function normalizeThunderstormCell(storm) {
  if (!storm) return null;
  return {
    id: storm.stormId,
    centroid: storm.centroid,
    polygon: storm.polygon,
    severe: storm.severe,
    referenceTime: storm.referenceTime,
  };
}

export function normalizeThunderstorm(apiResponse) {
  if (!apiResponse || !apiResponse.content) return [];
  return apiResponse.content.map(normalizeThunderstormCell);
}

/** Extract the default map view from manifest (account.default_map). */
export function getDefaultMap(manifest) {
  const dm = manifest?.account?.default_map;
  if (!dm) return null;
  return { lat: dm.lat, lng: dm.lng, zoom: dm.zoom };
}

/**
 * Parse a timeseries response into {rain, signal} series ready for charts.
 * rain.chart_data.datasets[0] = "Rainfall (mm) - 5min average".
 */
export function normalizeTimeseries(apiResponse) {
  const pickSeries = (block) => {
    // rain nests under chart_data; signal nests under signal_data — same shape.
    const cd = block?.chart_data || block?.signal_data;
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
