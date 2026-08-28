'use client';

import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

/**
 * Single source of truth for the dashboard's two layout switches:
 *
 * - `isCompact` (< theme.breakpoints.values.lg, 1200px): phones and
 *   portrait tablets (iPad Pro portrait ≈1024px lands here, landscape
 *   ≈1366px does not) — floating side panels collapse into the bottom
 *   sheet, the header collapses to logo + tabs + avatar.
 * - `isWallTV` (>=1920px): desktop layout stays, but type/spacing scale up
 *   ~15% for command-center screens viewed from a distance.
 */
export function useResponsiveLayout() {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('lg'));
  const isWallTV = useMediaQuery('(min-width:1920px)');
  return { isCompact, isWallTV };
}

export default useResponsiveLayout;
