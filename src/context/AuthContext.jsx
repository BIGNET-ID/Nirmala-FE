'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { secureStorage } from '@/lib/crypto';
import { nirmalaApiService, getDefaultMap } from '@/lib/nirmalaApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    const stored = secureStorage.getItem('nirmala_user');
    if (stored) setUser(stored);
    setLoading(false);
  }, []);

  // GET /api/manifest once per session — independent of VIONA login status.
  // Feeds UI-level feature gating (layer toggles) and initial map view, per
  // PRD §6.3. This is NOT a security gate: AuthGuard's login check is untouched.
  useEffect(() => {
    nirmalaApiService
      .getManifest()
      .then(setManifest)
      .catch((err) => console.warn('[AuthContext] Failed to load manifest:', err));
  }, []);

  const permissions = manifest?.account?.permissions ?? null;
  const defaultMap = getDefaultMap(manifest);
  const defaultLayer = manifest?.account?.default_layer ?? null;

  const login = (userData, token) => {
    secureStorage.setItem('nirmala_user', userData);
    if (token) secureStorage.setItem('nirmala_token', token);
    setUser(userData);
  };

  /** Authenticate against the VIONA-4 workflow via the /api/auth/login proxy. */
  const signIn = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
      throw new Error(data?.message || 'Login gagal.');
    }
    login(data.user || { email }, data.token);
    return data;
  };

  const logout = () => {
    secureStorage.removeItem('nirmala_user');
    secureStorage.removeItem('nirmala_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signIn, logout, manifest, permissions, defaultMap, defaultLayer }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}