/**
 * Custom Hook: usePlatformData
 * Loads the initial REST snapshot (PRD §4.1 step 1: GET /api/sensors,
 * /api/lightning, /api/thunderstorm on app load) plus manifest and health.
 * Live incremental updates for sensors/lightning/thunderstorm come from the
 * dedicated SSE hooks (useSensorStream/useLightningStream/useThunderstormStream,
 * see PRD §5.4) instead of polling — this hook only fetches each once.
 * Health has no SSE channel per PRD's Kategori grouping, so it keeps polling.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { nirmalaApiService, normalizeSensors, normalizeLightning, normalizeThunderstorm, getDefaultMap } from '@/lib/nirmalaApi';

export function usePlatformData() {
  const [sensors, setSensors] = useState([]);
  const [lightning, setLightning] = useState([]);
  const [thunderstorm, setThunderstorm] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [defaultMap, setDefaultMap] = useState(null);
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
        setDefaultMap(getDefaultMap(response));
      } catch (err) {
        console.warn('[usePlatformData] Failed to load manifest:', err);
        // Use defaults if manifest fails
      }
    };

    loadManifest();
  }, []);

  // Fetch sensors once — the initial REST snapshot. Live updates come from useSensorStream (SSE).
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        setLoading(true);
        const response = await nirmalaApiService.getSensors();
        const normalized = normalizeSensors(response);
        setSensors(normalized);
        setError(null);
        setApiStatus('connected');
      } catch (err) {
        console.error('[usePlatformData] Error fetching sensors:', err);
        setError(err);
        setApiStatus('fallback');
        setSensors([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSensors();
  }, []);

  // Fetch lightning once — the initial REST snapshot. Live updates come from useLightningStream (SSE).
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

    fetchLightning();
  }, []);

  // Fetch thunderstorm once — the initial REST snapshot. Live updates come from useThunderstormStream (SSE).
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

    fetchThunderstorm();
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
    defaultMap,
    health,
    loading,
    error,
    apiStatus,
  };
}
