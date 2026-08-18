'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Box, TextField, Button, Typography, InputAdornment, IconButton, Alert, CircularProgress,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { useAuth } from '@/hooks/useAuth';
import SceneBoundary from '@/components/auth/SceneBoundary';

const WeatherScene = dynamic(() => import('@/components/auth/WeatherScene'), { ssr: false });

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.2em', color: 'var(--nirmala-cyan)',
};

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn } = useAuth() || {};

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount the WebGL Canvas only AFTER hydration, into an already-laid-out DOM.
  // On a hard refresh the Canvas otherwise initializes before layout settles and
  // renders blank (it only appeared after a client-side re-nav); deferring here
  // makes every load behave like that stable re-nav.
  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Already authenticated → go to dashboard.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err?.message || 'Login gagal. Periksa email & password.');
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: '#050811' }}>
      {/* Static gradient underlay — always present so the bg is never empty
          (also the reduced-motion / pre-mount / WebGL-failure fallback). */}
      <Box sx={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 30%, #0a1a3a 0%, #050811 60%)',
      }} />

      {/* 3D weather backdrop — mounted only after hydration. */}
      {mounted && !reduced && (
        <SceneBoundary>
          <WeatherScene />
        </SceneBoundary>
      )}

      {/* Legibility overlay */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 55%, rgba(5,8,17,0.55) 0%, rgba(5,8,17,0.85) 70%)',
      }} />

      {/* Login card */}
      <Box sx={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 },
            bgcolor: 'rgba(10, 16, 36, 0.72)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--nirmala-glass-border)',
            borderRadius: 'var(--radius-xl, 16px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,255,0.06)',
            animation: reduced ? 'none' : 'fade-in 0.5s var(--ease-out) both',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box component="img" src="/nirmala-brand-dark.png" alt="Nirmala" sx={{ height: 34 }} />
          </Box>
          <Typography sx={{ ...eyebrowSx, textAlign: 'center', display: 'block' }}>
            Platform Telemetri Cuaca
          </Typography>
          <Typography variant="h5" fontWeight={700} sx={{ textAlign: 'center', mt: 0.5, mb: 3, color: 'var(--color-text)' }}>
            Masuk
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(228,108,100,0.12)', color: '#e46c64', border: '1px solid rgba(228,108,100,0.3)' }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth label="Email" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon icon="material-symbols:mail-rounded" width={18} style={{ color: '#7aa2d9' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            fullWidth label="Password" type={showPw ? 'text' : 'password'} value={password} required
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon icon="material-symbols:lock-rounded" width={18} style={{ color: '#7aa2d9' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPw((s) => !s)} edge="end" size="small" aria-label="Tampilkan password">
                      <Icon icon={showPw ? 'material-symbols:visibility-off-rounded' : 'material-symbols:visibility-rounded'} width={18} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            type="submit" fullWidth disabled={submitting}
            sx={{
              height: 46, fontWeight: 700, color: '#04121f',
              background: 'linear-gradient(90deg, #00e5ff, #38bdf8)',
              '&:hover': { background: 'linear-gradient(90deg, #22ecff, #4cc4ff)' },
              '&.Mui-disabled': { background: 'rgba(0,229,255,0.3)', color: 'rgba(4,18,31,0.6)' },
            }}
          >
            {submitting ? <CircularProgress size={20} sx={{ color: '#04121f' }} /> : 'Masuk'}
          </Button>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2.5, color: 'var(--color-text-muted)', ...{ fontFamily: 'var(--font-family-mono)' } }}>
            Nirmala · Auth VIONA-4
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
