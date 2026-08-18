'use client';

/**
 * Shared instantaneous lightning brightness (0..~1).
 *
 * The WebGL <WeatherScene> writes it from every flash source (sheet Storm,
 * forked bolt, warp strobe); the 2D <LensRain> canvas overlay — which lives
 * outside the Canvas and can't see the scene's lights — reads it so the lens
 * droplets glint in sync with each strike, as if catching its light.
 *
 * A plain module singleton is shared across imports in the client bundle, so
 * no context/prop plumbing crosses the Canvas boundary.
 */
export const FLASH = { storm: 0, bolt: 0, warp: 0 };
export const flashLevel = () => Math.max(FLASH.storm, FLASH.bolt, FLASH.warp);
