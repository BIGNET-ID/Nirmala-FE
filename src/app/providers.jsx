'use client';

import { ThemeProvider, CssBaseline } from '@mui/material';
import { AuthProvider } from '@/context/AuthContext';
import { nirmalaTheme } from '@/lib/theme';

export default function Providers({ children }) {
  return (
    <ThemeProvider theme={nirmalaTheme}>
      <CssBaseline />
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
