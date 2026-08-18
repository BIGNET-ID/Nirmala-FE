import { createTheme } from '@mui/material';

/**
 * Canonical Nirmala theme — BIGNET Web Design System v19 (dark command center).
 * Palette values mirror the CSS tokens in app/globals.css. Components should
 * prefer the CSS variables (var(--...)) for styling; MUI palette here exists so
 * MUI internals (contrast, focus, ripple) resolve to brand-correct colors.
 */
export const nirmalaTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00e5ff' },          // --nirmala-cyan (interaction/highlight)
    secondary: { main: '#0d47a1' },         // --blue-primary (brand solid)
    success: { main: '#34d399' },
    warning: { main: '#f9a825' },           // yellow accent — use sparingly (<=15%)
    error: { main: '#e46c64' },
    info: { main: '#60a5fa' },
    background: {
      default: '#050811',                   // --nirmala-map-bg
      paper: 'rgba(10, 16, 36, 0.88)',      // --nirmala-glass-bg
    },
    text: { primary: '#e0e0e0', secondary: '#a0a0a0' },
    divider: 'rgba(255, 255, 255, 0.07)',
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
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 12,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, textTransform: 'none', fontWeight: 700 },
      },
    },
  },
});

export default nirmalaTheme;
