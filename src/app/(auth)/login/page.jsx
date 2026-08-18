'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Box, TextField, Button, Typography, InputAdornment, IconButton, Alert, CircularProgress,
} from '@mui/material';
import { Icon } from '@iconify/react';
import { motion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeMode } from '@/context/ThemeModeContext';
import SceneBoundary from '@/components/auth/SceneBoundary';
import LensRain from '@/components/auth/LensRain';

const WeatherScene = dynamic(() => import('@/components/auth/WeatherScene'), { ssr: false });

const eyebrowSx = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.2em', color: 'var(--nirmala-cyan)',
};

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn } = useAuth() || {};
  const { mode } = useThemeMode();
  const dark = mode !== 'light';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const launchingRef = useRef(false); // synchronous guard so the auto-redirect doesn't skip the cinematic

  // Mount the WebGL Canvas only AFTER hydration, into an already-laid-out DOM.
  // On a hard refresh the Canvas otherwise initializes before layout settles and
  // renders blank (it only appeared after a client-side re-nav); deferring here
  // makes every load behave like that stable re-nav.
  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Already authenticated → go to dashboard (but don't cut off the login cinematic).
  useEffect(() => {
    if (!loading && user && !launchingRef.current) router.replace('/');
  }, [loading, user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      launchingRef.current = true;                 // block the auto-redirect effect first
      if (reduced) { router.replace('/'); return; }
      setLaunching(true);                          // dramatic charge through the storm
      setTimeout(() => router.replace('/'), 3100);
    } catch (err) {
      setError(err?.message || 'Login gagal. Periksa email & password.');
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: dark ? '#050811' : '#e6ecf4' }}>
      {/* Static gradient underlay — always present so the bg is never empty
          (also the reduced-motion / pre-mount / WebGL-failure fallback). */}
      <Box sx={{
        position: 'absolute', inset: 0,
        background: dark
          ? 'radial-gradient(ellipse at 50% 30%, #0a1a3a 0%, #050811 60%)'
          : 'radial-gradient(ellipse at 50% 30%, #f4f7fb 0%, #d9e1ec 65%)',
      }} />

      {/* 3D weather backdrop — mounted only after hydration. */}
      {mounted && !reduced && (
        <SceneBoundary>
          <WeatherScene warp={launching} mode={mode} />
        </SceneBoundary>
      )}

      {/* Camera-lens raindrops */}
      {mounted && !reduced && <LensRain />}

      {/* Legibility vignette — subtle; fades away during the fly-through */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: dark
          ? 'radial-gradient(ellipse at 50% 55%, rgba(5,8,17,0.55) 0%, rgba(5,8,17,0.85) 70%)'
          : 'radial-gradient(ellipse at 50% 55%, rgba(230,236,244,0) 0%, rgba(210,220,234,0.5) 75%)',
        opacity: launching ? 0 : 1,
        transition: 'opacity 0.9s var(--ease-out)',
      }} />

      {/* Login card */}
      <Box sx={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Box
          component={motion.form}
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={launching
            ? { scale: 1.7, opacity: 0, filter: 'blur(14px)' }
            : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: launching ? 1.3 : 0.6, ease: launching ? [0.5, 0, 0.75, 0] : 'easeOut' }}
          sx={{
            width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 },
            bgcolor: dark ? 'rgba(10, 16, 36, 0.72)' : 'rgba(255, 255, 255, 0.74)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--nirmala-glass-border)',
            borderRadius: 'var(--radius-xl, 16px)',
            boxShadow: dark
              ? '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,255,0.06)'
              : '0 20px 56px rgba(16,50,95,0.18), 0 0 0 1px rgba(16,50,95,0.05)',
            pointerEvents: launching ? 'none' : 'auto',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box component="img" src={dark ? '/nirmala-brand-dark.png' : '/nirmala-brand.png'} alt="Nirmala" sx={{ height: 56 }} />
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
            disableElevation
            sx={{
              height: 46, fontWeight: 700, color: '#ffffff',
              backgroundColor: '#06b6d4',            // deep cyan — solid, flat (no gradient)
              boxShadow: 'none',
              transition: 'background-color var(--duration-fast, 150ms) var(--ease-standard)',
              '&:hover': { backgroundColor: '#0e7490', boxShadow: 'none' },
              '&:focus-visible': { outline: '3px solid rgba(6,182,212,0.55)', outlineOffset: '2px' },
              '&.Mui-disabled': { backgroundColor: 'rgba(6,182,212,0.4)', color: 'rgba(255,255,255,0.7)' },
            }}
          >
            {submitting ? <CircularProgress size={20} sx={{ color: '#ffffff' }} /> : 'Masuk'}
          </Button>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2.5, color: 'var(--color-text-muted)', ...{ fontFamily: 'var(--font-family-mono)' } }}>
            Nirmala · Auth VIONA-4
          </Typography>
        </Box>
      </Box>

      {/* Blinding white flash at the climax of the fly-through — covers the
          route swap so the dashboard emerges from the light. */}
      <Box
        component={motion.div}
        initial={{ opacity: 0 }}
        animate={{ opacity: launching ? 1 : 0 }}
        transition={{ duration: 0.85, delay: launching ? 2.3 : 0, ease: 'easeIn' }}
        sx={{ position: 'absolute', inset: 0, bgcolor: '#eef5ff', pointerEvents: 'none', zIndex: 5 }}
      />
    </Box>
  );
}
