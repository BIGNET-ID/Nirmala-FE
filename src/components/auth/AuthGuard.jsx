'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '@/hooks/useAuth';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth() || {};
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <Box sx={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', bgcolor: 'var(--nirmala-map-bg)',
      }}>
        <CircularProgress size={26} sx={{ color: 'var(--nirmala-cyan)' }} />
      </Box>
    );
  }
  return <>{children}</>;
}
