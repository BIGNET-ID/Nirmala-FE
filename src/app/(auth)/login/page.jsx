'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  TextField,
  Button,
  Typography,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Icon } from '@iconify/react';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00d2ff' },
    background: { default: '#020d1c', paper: 'rgba(8, 21, 38, 0.5)' },
    text: { primary: '#e9f7ff', secondary: '#9bc0d4' },
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", sans-serif',
  },
  components: {
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            background: 'rgba(2, 10, 20, 0.12)',
            borderRadius: 0,
            height: 34,
            '& fieldset': {
              borderColor: 'rgba(167, 201, 255, 0.38)',
              borderWidth: '1px',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(167, 201, 255, 0.55)',
            },
            '&.Mui-focused fieldset': {
              borderColor: 'rgba(0, 229, 255, 0.8)',
              boxShadow: '0 0 0 1px rgba(0, 229, 255, 0.14)',
            },
            '& input': {
              color: '#dfefff',
              fontSize: '0.72rem',
              letterSpacing: '0.02em',
              padding: '7px 12px 7px 10px',
            },
          },
          '& .MuiInputLabel-root': {
            display: 'none',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 700,
        },
      },
    },
  },
});

const starDots = [
  { left: '18%', top: '16%', size: 3 },
  { left: '29%', top: '62%', size: 4 },
  { left: '46%', top: '8%', size: 3 },
  { left: '59%', top: '74%', size: 4 },
  { left: '83%', top: '12%', size: 3 },
  { left: '76%', top: '68%', size: 4 },
  { left: '14%', top: '78%', size: 3 },
  { left: '91%', top: '51%', size: 3 },
  { left: '52%', top: '90%', size: 4 },
  { left: '68%', top: '23%', size: 3 },
  { left: '36%', top: '86%', size: 3 },
  { left: '10%', top: '52%', size: 3 },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('operator@nirmala.id');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setLoading(false);
    router.push('/');
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'radial-gradient(circle at center, rgba(24, 180, 255, 0.12), transparent 20%), #020d1c',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(100, 170, 255, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(100, 170, 255, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            opacity: 0.9,
            pointerEvents: 'none',
          }}
        />

        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at center, rgba(0, 229, 255, 0.08), transparent 28%)',
            pointerEvents: 'none',
          }}
        />

        <Box
          sx={{
            position: 'absolute',
            width: 480,
            height: 480,
            borderRadius: '50%',
            border: '1px solid rgba(94, 186, 255, 0.16)',
            pointerEvents: 'none',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        <Box
          sx={{
            position: 'absolute',
            width: 236,
            height: 236,
            borderRadius: '50%',
            border: '1px solid rgba(94, 186, 255, 0.18)',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />

        <Box
          sx={{
            position: 'absolute',
            width: 380,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.8), transparent)',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%) rotate(20deg)',
            pointerEvents: 'none',
          }}
        />

        {starDots.map((dot, index) => (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              left: dot.left,
              top: dot.top,
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              background: '#b5e7ff',
              boxShadow: '0 0 8px rgba(130, 220, 255, 0.9)',
              opacity: 0.9,
              pointerEvents: 'none',
            }}
          />
        ))}

        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            width: 386,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              background: 'rgba(10, 18, 31, 0.32)',
              backdropFilter: 'blur(8px)',
              py: 1.3,
              px: 2,
              mb: 3.2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 1,
                  color: '#7dd3fc',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  border: '1px solid rgba(125, 211, 252, 0.3)',
                  background: 'rgba(125, 211, 252, 0.08)',
                }}
              >
                N
              </Box>
              <Typography sx={{ fontSize: '0.96rem', letterSpacing: '0.24em', fontWeight: 700, color: '#dfefff' }}>
                NIRMALA
              </Typography>
            </Box>
          </Box>

          <Box component="form" onSubmit={handleLogin} sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography
              sx={{
                fontSize: '0.62rem',
                letterSpacing: '0.18em',
                color: '#8fa8c2',
                textTransform: 'uppercase',
                mb: 2.2,
                textAlign: 'center',
              }}
            >
              Platform pemantauan cuaca &amp; telemetri
            </Typography>

            <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1.6 }}>
              <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.14em', color: '#9ab5cb', textTransform: 'uppercase' }}>
                Email / Username
              </Typography>
              <TextField
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon icon="solar:user-circle-bold-duotone" width="14" color="#7dd3fc" />
                    </InputAdornment>
                  ),
                }}
              />

              <Typography sx={{ mt: 0.2, fontSize: '0.6rem', letterSpacing: '0.14em', color: '#9ab5cb', textTransform: 'uppercase' }}>
                Kata Sandi
              </Typography>
              <TextField
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon icon="solar:lock-password-bold-duotone" width="14" color="#7dd3fc" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => setShowPassword((prev) => !prev)}
                        sx={{ color: '#7dd3fc', p: 0.3 }}
                      >
                        <Icon icon={showPassword ? 'solar:eye-closed-bold' : 'solar:eye-bold'} width="14" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{
                mt: 2.3,
                height: 40,
                background: 'linear-gradient(90deg, rgba(10, 130, 210, 0.9), rgba(0, 229, 255, 0.9))',
                boxShadow: '0 0 18px rgba(0, 229, 255, 0.22)',
                fontSize: '0.84rem',
                letterSpacing: '0.02em',
                '&:hover': {
                  background: 'linear-gradient(90deg, rgba(22, 142, 223, 0.95), rgba(0, 229, 255, 0.95))',
                },
              }}
            >
              {loading ? <CircularProgress size={16} color="inherit" /> : 'Masuk ke Platform'}
            </Button>

            <Typography
              sx={{
                mt: 1.8,
                fontSize: '0.62rem',
                color: '#7b8ea6',
                textAlign: 'center',
              }}
            >
              Akses terbatas untuk operator resmi. Hubungi admin.
            </Typography>

            <Box
              sx={{
                mt: 3,
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                color: '#7a90a8',
                fontSize: '0.56rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <Typography sx={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: '#7a90a8' }}>NIRMALA v1.0.0</Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: '#00d5ff' }} />
              <Typography sx={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: '#7a90a8' }}>Rainvision Kafka Pipeline</Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: '#00d5ff' }} />
              <Typography sx={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: '#7a90a8' }}>Build 2026.08</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}