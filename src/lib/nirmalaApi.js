/**
 * Nirmala API Service Layer
 * Integrates with Rainvision Kafka Pipeline Backend (NEXT_PUBLIC_API_BASE_URL).
 * Based on PRD Section 7: Technical API Contract & Data Schema.
 *
 * Dev fallback: when the real backend is unreachable (private IP, no VPN), each
 * method falls back to a CAPTURED REAL RESPONSE fixture served from /public/fixtures
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
  /** GET /api/sensors — 4.500+ stasiun (koordinat, status, is_raining). Refresh ~30s. */
  async getSensors() {
    try {
      return await nirmalaApi.get('/api/sensors');
    } catch (error) {
      console.warn('[Nirmala API] /api/sensors unavailable, using real-response fixture:', error.message);
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
 * Normalize sensors to app shape. Real /api/sensors is BINARY: is_raining + status,
 * no numeric rain/temp — so no numeric intensity/temperature is derived here.
 * Numeric rain (mm) comes from /api/timeseries per-sensor (see SensorDetailDrawer).
 */
export function normalizeSensors(apiResponse) {
  if (!apiResponse || !apiResponse.sensors) return [];

  return apiResponse.sensors.map((s) => ({
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
  }));
}

export function normalizeLightning(apiResponse) {
  if (!apiResponse || !apiResponse.content) return [];
  return apiResponse.content.map((strike) => ({
    id: `${strike.lat}_${strike.long}_${strike.time}`,
    lat: strike.lat,
    lng: strike.long,
    signalStrength: strike.signalStrengthKA,
    isCloud: strike.cloud,
    time: strike.time,
  }));
}

export function normalizeThunderstorm(apiResponse) {
  if (!apiResponse || !apiResponse.content) return [];
  return apiResponse.content.map((storm) => ({
    id: storm.stormId,
    centroid: storm.centroid,
    polygon: storm.polygon,
    severe: storm.severe,
    referenceTime: storm.referenceTime,
  }));
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
    const cd = block?.chart_data;
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
