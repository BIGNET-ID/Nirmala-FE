'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Weather-themed 3D backdrop for the login page: drifting volumetric clouds over
 * a near-black navy sky, periodic lightning flashes lighting the clouds from
 * within, and a slow parallax camera drift. Rendered client-only.
 */

function LightningFlash({ position = [0, 3, -2], baseHue = '#cdefff' }) {
  const light = useRef();
  const flash = useRef(0);
  const cooldown = useRef(1 + Math.random() * 3);

  useFrame((_, dt) => {
    cooldown.current -= dt;
    if (cooldown.current <= 0) {
      flash.current = 1;
      cooldown.current = 2.5 + Math.random() * 5;
      if (light.current) {
        light.current.position.set(
          (Math.random() - 0.5) * 16,
          2 + Math.random() * 3,
          -3 + Math.random() * 5,
        );
      }
    }
    if (flash.current > 0) {
      flash.current -= dt * 3.2;
      const f = Math.max(0, flash.current);
      // double-blink shape
      const blink = f > 0.65 ? f : f > 0.35 ? f * 0.35 : f;
      if (light.current) light.current.intensity = blink * 220;
    } else if (light.current) {
      light.current.intensity = 0;
    }
  });

  return <pointLight ref={light} position={position} color={baseHue} distance={45} decay={2} intensity={0} />;
}

function CloudField() {
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.04) * 0.15;
      group.current.position.x = Math.sin(t * 0.05) * 0.6;
    }
  });

  const clouds = useMemo(() => ([
    { seed: 1, pos: [-6, -1, -4], color: '#3a5680', vol: 7, seg: 34, opacity: 0.7 },
    { seed: 2, pos: [6, 1.5, -6], color: '#2c4166', vol: 8, seg: 34, opacity: 0.65 },
    { seed: 3, pos: [0, -2, -2], color: '#4a648f', vol: 6, seg: 30, opacity: 0.6 },
    { seed: 4, pos: [-3, 3, -8], color: '#1f3050', vol: 9, seg: 36, opacity: 0.55 },
    { seed: 5, pos: [4, -3, -3], color: '#42597f', vol: 6, seg: 30, opacity: 0.6 },
  ]), []);

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshBasicMaterial} limit={500}>
        {clouds.map((c) => (
          <Cloud
            key={c.seed}
            seed={c.seed}
            position={c.pos}
            bounds={[10, 3, 3]}
            segments={c.seg}
            volume={c.vol}
            color={c.color}
            opacity={c.opacity}
            fade={30}
            speed={0.14}
            growth={5}
          />
        ))}
      </Clouds>
    </group>
  );
}

export default function WeatherScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 12], fov: 55 }}
      gl={{ antialias: true, alpha: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#050811']} />
      <fog attach="fog" args={['#050811', 9, 28]} />
      <ambientLight intensity={0.18} color="#25406a" />
      <hemisphereLight intensity={0.12} color="#8fb4ff" groundColor="#050811" />
      <Stars radius={80} depth={40} count={1200} factor={3} saturation={0} fade speed={0.4} />
      <CloudField />
      <LightningFlash position={[-4, 3, -3]} baseHue="#00e5ff" />
      <LightningFlash position={[5, 2, -4]} baseHue="#cdefff" />
    </Canvas>
  );
}
