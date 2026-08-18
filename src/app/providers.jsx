'use client';

import { ThemeModeProvider } from '@/context/ThemeModeContext';
import { AuthProvider } from '@/context/AuthContext';

export default function Providers({ children }) {
  return (
    <ThemeModeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeModeProvider>
  );
}
