'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { secureStorage } from '@/lib/crypto';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = secureStorage.getItem('nirmala_user');
    if (stored) setUser(stored);
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    secureStorage.setItem('nirmala_user', userData);
    secureStorage.setItem('nirmala_token', token);
    setUser(userData);
  };

  const logout = () => {
    secureStorage.removeItem('nirmala_user');
    secureStorage.removeItem('nirmala_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}