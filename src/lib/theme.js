import { createTheme } from '@mui/material';

/**
 * Mode-aware Nirmala theme — BIGNET Web Design System v19.
 * Palette mirrors the CSS tokens in app/globals.css (which switch on
 * :root[data-theme="dark"]). Components should prefer the CSS variables;
 * this exists so MUI internals resolve to brand-correct colours per mode.
 */
export function makeTheme(mode = 'dark') {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#00e5ff' : '#0e7490' }, // cyan accent (deeper on light for contrast)
      secondary: { main: '#0d47a1' },
      success: { main: dark ? '#34d399' : '#29803a' },
      warning: { main: '#f9a825' },
      error: { main: dark ? '#e46c64' : '#d93025' },
      info: { main: '#60a5fa' },
      background: {
        default: dark ? '#050811' : '#e9eef5',
        paper: dark ? 'rgba(10, 16, 36, 0.88)' : 'rgba(255, 255, 255, 0.82)',
      },
      text: {
        primary: dark ? '#e0e0e0' : '#202124',
        secondary: dark ? '#a0a0a0' : '#5f6368',
      },
      divider: dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(16, 50, 95, 0.12)',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: "'Roboto', Arial, Helvetica, sans-serif",
      button: { textTransform: 'none', fontWeight: 700 },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--nirmala-glass-border)',
            borderRadius: 12,
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: 8, textTransform: 'none', fontWeight: 700 } },
      },
    },
  });
}

// Back-compat default (dark).
export const nirmalaTheme = makeTheme('dark');
export default nirmalaTheme;
