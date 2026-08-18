/**
 * Nirmala API Service Layer
 * Integrates with Rainvision Kafka Pipeline Backend (http://172.18.188.154:8000)
 * Based on PRD Section 7: Technical API Contract & Data Schema
 */

'use client';

import { nirmalaApi } from './axios';

/**
 * Fallback mock data for when API is unavailable
 * Used to maintain app functionality during API issues
 */
const getMockSensors = () => [
  { id: 'S00001', latitude: -6.18, longitude: 106.83, status: 'active', is_raining: false, temperature: 29.5, humidity: 65, last_update: new Date().toISOString(), rain_rate: 48 },
  { id: 'S00002', latitude: -6.26, longitude: 106.81, status: 'active', is_raining: true, temperature: 26.8, humidity: 72, last_update: new Date().toISOString(), rain_rate: 92 },
  { id: 'S00003', latitude: -6.16, longitude: 106.75, status: 'active', is_raining: false, temperature: 32.4, humidity: 58, last_update: new Date().toISOString(), rain_rate: 10 },
  { id: 'S00004', latitude: -6.22, longitude: 106.90, status: 'active', is_raining: true, temperature: 28.1, humidity: 68, last_update: new Date().toISOString(), rain_rate: 70 },
  { id: 'S00005', latitude: -6.40, longitude: 106.81, status: 'active', is_raining: true, temperature: 24.9, humidity: 78, last_update: new Date().toISOString(), rain_rate: 110 },
  { id: 'S00006', latitude: -6.17, longitude: 106.63, status: 'active', is_raining: false, temperature: 33.8, humidity: 52, last_update: new Date().toISOString(), rain_rate: 2 },
];

const MOCK_LIGHTNING = () => ({
  content: [
    { lat: -6.20, long: 106.85, cloud: false, signalStrengthKA: -15, time: new Date().toISOString() },
    { lat: -6.25, long: 106.82, cloud: true, signalStrengthKA: -25, time: new Date().toISOString() },
  ],
});

const MOCK_THUNDERSTORM = () => ({
  content: [
    {
      stormId: 'STORM001',
      referenceTime: new Date().toISOString(),
      severe: false,
      centroid: { lat: -6.22, lng: 106.84 },
      polygon: [
        { lat: -6.20, lng: 106.82 },
        { lat: -6.20, lng: 106.86 },
        { lat: -6.24, lng: 106.86 },
        { lat: -6.24, lng: 106.82 },
      ],
    },
  ],
});

export const nirmalaApiService = {
  /**
   * GET /api/sensors
   * Mengambil data 4.500+ stasiun sensor (koordinat, status, status hujan)
   * Frekuensi Refresh: Every 30s / SSE Stream
   */
  async getSensors(filters = {}) {
    // Always use mock data for now to test the flow
    const MOCK_SENSORS = getMockSensors();
    const mockResponse = {
      scraped_at_utc: new Date().toISOString(),
      bounds: { north: 6.5, south: -11.5, east: 141.5, west: 94.5 },
      filters: { active: true, bignet: true, inactive: false, blacklisted: false },
      total_items: MOCK_SENSORS.length,
      alert: 'Using mock data - Testing Mode',
      sensors: MOCK_SENSORS,
    };
    console.log('[Nirmala API] Returning mock data with', MOCK_SENSORS.length, 'sensors');
    return mockResponse;
  },

  /**
   * GET /api/lightning
   * Real-time events sambaran petir (lat/long, cloud/ground, signalStrengthKA)
   * Frekuensi Refresh: Every 10s
   */
  async getLightning() {
    try {
      const response = await nirmalaApi.get('/api/lightning');
      return response;
    } catch (error) {
      console.warn('[Nirmala API] Lightning data unavailable, using mock data:', error.message);
      return MOCK_LIGHTNING();
    }
  },

  /**
   * GET /api/thunderstorm
   * GeoJSON Poligon sel badai petir & centroid koordinat
   * Frekuensi Refresh: Every 30s
   */
  async getThunderstorm() {
    try {
      const response = await nirmalaApi.get('/api/thunderstorm');
      return response;
    } catch (error) {
      console.warn('[Nirmala API] Thunderstorm data unavailable, using mock data:', error.message);
      return MOCK_THUNDERSTORM();
    }
  },

  /**
   * GET /api/manifest
   * Metadata platform, akun permissions, default koordinat map, & statistik Kafka
   * Frekuensi Refresh: On App Load
   */
  async getManifest() {
    try {
      const response = await nirmalaApi.get('/api/manifest');
      return response;
    } catch (error) {
      console.warn('[Nirmala API] Manifest unavailable:', error.message);
      // Return sensible defaults
      return {
        platform: 'Nirmala',
        version: '1.0.0',
        defaultBounds: { north: 6.5, south: -11.5, east: 141.5, west: 94.5 },
        defaultZoom: 9,
      };
    }
  },

  /**
   * GET /api/health
   * Diagnostik kesehatan pipeline Kafka (uptime, consumed messages, state counts)
   * Frekuensi Refresh: Every 60s
   */
  async getHealth() {
    try {
      const response = await nirmalaApi.get('/api/health');
      return response;
    } catch (error) {
      console.warn('[Nirmala API] Health check failed:', error.message);
      return { connected: false, status: 'unknown' };
    }
  },

  /**
   * GET /api/topics
   * Daftar Kafka topics aktif yang dikonsumsi pipeline
   * Frekuensi Refresh: Developer Panel
   */
  async getTopics() {
    try {
      const response = await nirmalaApi.get('/api/topics');
      return response;
    } catch (error) {
      console.warn('[Nirmala API] Topics unavailable:', error.message);
      return { topics: [] };
    }
  },

  /**
   * GET /api/raw/{topic}
   * Preview pesan Kafka raw mentah
   * Frekuensi Refresh: Developer Panel
   */
  async getRawTopic(topic) {
    try {
      const response = await nirmalaApi.get(`/api/raw/${topic}`);
      return response;
    } catch (error) {
      console.warn(`[Nirmala API] Raw topic ${topic} unavailable:`, error.message);
      return { topic, messages: [] };
    }
  },
};

/**
 * Normalize sensor data from API response to app-compatible format
 */
export function normalizeSensors(apiResponse) {
  if (!apiResponse || !apiResponse.sensors) {
    return [];
  }

  return apiResponse.sensors.map((sensor) => ({
    id: sensor.id,
    name: sensor.id, // Use ID as fallback name if not provided
    lat: sensor.latitude,
    lng: sensor.longitude,
    status: sensor.status, // 'active', 'inactive', 'blacklisted'
    rain: sensor.rain_rate || 0,
    temp: sensor.temperature || 0,
    humidity: sensor.humidity || 0,
    isRaining: sensor.is_raining || false,
    lastUpdate: sensor.last_update,
    scrapedAt: sensor._scraped_at,
  }));
}

/**
 * Normalize lightning data from API response
 */
export function normalizeLightning(apiResponse) {
  if (!apiResponse || !apiResponse.content) {
    return [];
  }

  return apiResponse.content.map((strike) => ({
    id: `${strike.lat}_${strike.lng}_${strike.time}`,
    lat: strike.lat,
    lng: strike.long,
    signalStrength: strike.signalStrengthKA,
    isCloud: strike.cloud,
    time: strike.time,
  }));
}

/**
 * Normalize thunderstorm data from API response
 */
export function normalizeThunderstorm(apiResponse) {
  if (!apiResponse || !apiResponse.content) {
    return [];
  }

  return apiResponse.content.map((storm) => ({
    id: storm.stormId,
    centroid: storm.centroid,
    polygon: storm.polygon,
    severe: storm.severe,
    referenceTime: storm.referenceTime,
  }));
}
