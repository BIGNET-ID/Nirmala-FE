'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Weather-themed 3D login backdrop.
 * - Volumetric drei Clouds using a LIT material (MeshLambert) so they have real
 *   3D form AND are illuminated by the lightning flashes.
 * - Storm: repeating lightning — a jagged bolt + a flash point-light every
 *   ~2-4s (timer-driven, so it keeps striking, not once).
 * - Parallax camera/cloud drift + subtle stars. Rendered client-only.
 */

function makeBolt() {
  const x0 = (Math.random() - 0.5) * 14;
  const pts = [];
  let x = x0, y = 8;
  while (y > -6) {
    pts.push([x, y, -2]);
    y -= 0.5 + Math.random() * 0.7;
    x += (Math.random() - 0.5) * 1.5;
  }
  return { points: pts, x: x0 };
}

function Storm() {
  const [bolt, setBolt] = useState(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let timer;
    let raf;
    const strike = () => {
      setBolt(makeBolt());
      const start = performance.now();
      const dur = 280;
      const animate = () => {
        const e = (performance.now() - start) / dur;
        if (e >= 1) { setFlash(0); setBolt(null); schedule(); return; }
        const tail = 1 - e;
        // quick rise + double flicker
        const f = e < 0.12 ? e / 0.12 : e < 0.28 ? tail * 0.35 : tail;
        setFlash(f);
        raf = requestAnimationFrame(animate);
      };
      animate();
    };
    const schedule = () => { timer = setTimeout(strike, 1800 + Math.random() * 2600); };
    schedule();
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <pointLight position={[bolt?.x ?? 0, 3.5, -2]} color="#dff6ff" distance={70} decay={1.6} intensity={flash * 300} />
      {/* brief global brighten so the whole sky reacts */}
      <ambientLight intensity={flash * 0.9} color="#bfe6ff" />
      {bolt && (
        <Line points={bolt.points} color="#f0ffff" lineWidth={2.2} transparent opacity={Math.min(1, flash * 3)} toneMapped={false} />
      )}
    </>
  );
}

function CloudField() {
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.045) * 0.18;
      group.current.position.x = Math.sin(t * 0.05) * 0.8;
      group.current.position.y = Math.sin(t * 0.03) * 0.3;
    }
  });

  const clouds = useMemo(() => ([
    { seed: 1, pos: [-6, -0.5, -3], color: '#7d96c8', vol: 9, seg: 40, opacity: 0.85 },
    { seed: 2, pos: [6, 1.5, -6], color: '#6a83b6', vol: 10, seg: 40, opacity: 0.8 },
    { seed: 3, pos: [0, -2, -1], color: '#8ea6d6', vol: 8, seg: 36, opacity: 0.85 },
    { seed: 4, pos: [-3, 3, -9], color: '#566f9e', vol: 11, seg: 42, opacity: 0.7 },
    { seed: 5, pos: [4.5, -2.5, -2], color: '#7f98ca', vol: 8, seg: 36, opacity: 0.82 },
    { seed: 6, pos: [-8, 2, -5], color: '#617aad', vol: 9, seg: 38, opacity: 0.75 },
  ]), []);

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshLambertMaterial} limit={600}>
        {clouds.map((c) => (
          <Cloud
            key={c.seed}
            seed={c.seed}
            position={c.pos}
            bounds={[11, 3.5, 3.5]}
            segments={c.seg}
            volume={c.vol}
            color={c.color}
            opacity={c.opacity}
            fade={26}
            speed={0.16}
            growth={6}
          />
        ))}
      </Clouds>
    </group>
  );
}

export default function WeatherScene() {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 12], fov: 58 }}
      gl={{ antialias: true, alpha: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#050811']} />
      <fog attach="fog" args={['#050811', 10, 30]} />
      {/* base lighting so clouds read as 3D even between strikes */}
      <ambientLight intensity={0.45} color="#3a5488" />
      <hemisphereLight intensity={0.35} color="#9fc0ff" groundColor="#0a1220" />
      <directionalLight position={[6, 10, 6]} intensity={0.7} color="#aac4ec" />
      <Stars radius={90} depth={45} count={1400} factor={3.2} saturation={0} fade speed={0.5} />
      <CloudField />
      <Storm />
      <Storm />
    </Canvas>
  );
}
