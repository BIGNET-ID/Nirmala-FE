'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { makeTheme } from '@/lib/theme';

const ThemeModeContext = createContext({ mode: 'dark', toggle: () => {}, setMode: () => {} });
const STORAGE_KEY = 'nirmala-theme';

export function ThemeModeProvider({ children }) {
  // Dark-first (command center). Read stored preference after mount to avoid
  // SSR/hydration mismatch; the <html data-theme="dark"> default paints first.
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    if (stored === 'light' || stored === 'dark') setMode(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode]);

  const value = useMemo(() => ({
    mode,
    setMode,
    toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
  }), [mode]);

  const theme = useMemo(() => makeTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
