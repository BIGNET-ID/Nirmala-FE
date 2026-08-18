/**
 * Custom Hook: usePlatformData
 * Integrates real-time telemetry data from Nirmala API with proper refresh intervals
 * Based on PRD Section 7.1: API Endpoint Matrix
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { nirmalaApiService, normalizeSensors, normalizeLightning, normalizeThunderstorm } from '@/lib/nirmalaApi';

export function usePlatformData() {
  const [sensors, setSensors] = useState([]);
  const [lightning, setLightning] = useState([]);
  const [thunderstorm, setThunderstorm] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState('connecting'); // 'connecting', 'connected', 'fallback'

  const intervalsRef = useRef({});

  // Fetch manifest on app load
  useEffect(() => {
    const loadManifest = async () => {
      try {
        const response = await nirmalaApiService.getManifest();
        setManifest(response);
      } catch (err) {
        console.warn('[usePlatformData] Failed to load manifest:', err);
        // Use defaults if manifest fails
      }
    };

    loadManifest();
  }, []);

  // Fetch sensors every 30s (SSE stream or API poll)
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        setLoading(true);
        console.log('[usePlatformData] Fetching sensors...');
        const response = await nirmalaApiService.getSensors();
        console.log('[usePlatformData] Raw API response:', response);
        const normalized = normalizeSensors(response);
        console.log('[usePlatformData] Normalized sensors (count=' + normalized.length + '):', normalized);
        setSensors(normalized);
        setError(null);
        setApiStatus('connected');
      } catch (err) {
        console.error('[usePlatformData] Error fetching sensors:', err);
        setError(err);
        setApiStatus('fallback');
        // Still attempt to set empty state or use cached data
        setSensors([]);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchSensors();

    // Schedule recurring fetches every 30 seconds
    intervalsRef.current.sensors = setInterval(fetchSensors, 30000);

    return () => {
      if (intervalsRef.current.sensors) {
        clearInterval(intervalsRef.current.sensors);
      }
    };
  }, []);

  // Fetch lightning every 10s
  useEffect(() => {
    const fetchLightning = async () => {
      try {
        const response = await nirmalaApiService.getLightning();
        const normalized = normalizeLightning(response);
        setLightning(normalized);
      } catch (err) {
        console.warn('[usePlatformData] Error fetching lightning:', err);
        setLightning([]);
      }
    };

    // Initial fetch
    fetchLightning();

    // Schedule recurring fetches every 10 seconds
    intervalsRef.current.lightning = setInterval(fetchLightning, 10000);

    return () => {
      if (intervalsRef.current.lightning) {
        clearInterval(intervalsRef.current.lightning);
      }
    };
  }, []);

  // Fetch thunderstorm every 30s
  useEffect(() => {
    const fetchThunderstorm = async () => {
      try {
        const response = await nirmalaApiService.getThunderstorm();
        const normalized = normalizeThunderstorm(response);
        setThunderstorm(normalized);
      } catch (err) {
        console.warn('[usePlatformData] Error fetching thunderstorm:', err);
        setThunderstorm([]);
      }
    };

    // Initial fetch
    fetchThunderstorm();

    // Schedule recurring fetches every 30 seconds
    intervalsRef.current.thunderstorm = setInterval(fetchThunderstorm, 30000);

    return () => {
      if (intervalsRef.current.thunderstorm) {
        clearInterval(intervalsRef.current.thunderstorm);
      }
    };
  }, []);

  // Fetch health every 60s
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await nirmalaApiService.getHealth();
        setHealth(response);
      } catch (err) {
        console.warn('[usePlatformData] Error fetching health:', err);
        setHealth(null);
      }
    };

    // Initial fetch
    fetchHealth();

    // Schedule recurring fetches every 60 seconds
    intervalsRef.current.health = setInterval(fetchHealth, 60000);

    return () => {
      if (intervalsRef.current.health) {
        clearInterval(intervalsRef.current.health);
      }
    };
  }, []);

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach((interval) => {
        if (interval) clearInterval(interval);
      });
    };
  }, []);

  return {
    sensors,
    lightning,
    thunderstorm,
    manifest,
    health,
    loading,
    error,
    apiStatus,
  };
}
