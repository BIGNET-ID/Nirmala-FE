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

// A forked lightning bolt: main jagged path + a few branches off it.
function makeBolt() {
  const x0 = (Math.random() - 0.5) * 16;
  const main = [];
  let x = x0, y = 8;
  while (y > -6) {
    main.push([x, y, -2]);
    y -= 0.4 + Math.random() * 0.6;
    x += (Math.random() - 0.5) * 1.7;
  }
  const lines = [main];
  const branches = 1 + Math.floor(Math.random() * 3);
  for (let b = 0; b < branches; b++) {
    const i = 2 + Math.floor(Math.random() * Math.max(1, main.length - 4));
    let [bx, by] = main[i];
    const branch = [[bx, by, -2]];
    const len = 2 + Math.floor(Math.random() * 4);
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let k = 0; k < len; k++) {
      by -= 0.4 + Math.random() * 0.5;
      bx += dir * (0.4 + Math.random() * 1.0);
      branch.push([bx, by, -2]);
    }
    lines.push(branch);
  }
  return { lines, x: x0 };
}

// Fast rise (~20ms) then quick fall (~90ms) — one flicker pulse, dt in seconds.
const pulseShape = (dt) => (dt < 0 ? 0 : dt < 0.02 ? dt / 0.02 : dt < 0.11 ? 1 - (dt - 0.02) / 0.09 : 0);

function Storm() {
  const [bolt, setBolt] = useState(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let timer;
    let raf;
    const strike = () => {
      const distant = Math.random() < 0.3;           // some strikes just light the sky
      setBolt(distant ? null : makeBolt());

      // 2-4 quick flickers per strike (real lightning strobes)
      const n = 2 + Math.floor(Math.random() * 3);
      const pulses = [];
      let tt = 0;
      for (let i = 0; i < n; i++) {
        pulses.push({ t: tt, a: i === 0 ? 1 : 0.35 + Math.random() * 0.55 });
        tt += 0.05 + Math.random() * 0.12;
      }
      const dur = tt + 0.15;
      const start = performance.now();
      const animate = () => {
        const e = (performance.now() - start) / 1000; // seconds
        if (e >= dur) { setFlash(0); setBolt(null); schedule(); return; }
        let v = 0;
        for (const p of pulses) v = Math.max(v, p.a * pulseShape(e - p.t));
        setFlash(distant ? v * 0.5 : v);
        raf = requestAnimationFrame(animate);
      };
      animate();
    };
    const schedule = () => { timer = setTimeout(strike, 600 + Math.random() * 1700); };
    schedule();
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <pointLight position={[bolt?.x ?? 0, 3.5, -2]} color="#eaf6ff" distance={80} decay={1.5} intensity={flash * 340} />
      {/* brief global brighten so the whole sky reacts */}
      <ambientLight intensity={flash * 1.0} color="#cfe8ff" />
      {bolt && bolt.lines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#f2ffff"
          lineWidth={i === 0 ? 2.4 : 1.3}
          transparent
          opacity={Math.min(1, flash * 3.2)}
          toneMapped={false}
        />
      ))}
    </>
  );
}

// Paler, faded blue-grey palette (softer than the dark-mode navy).
const PALE = ['#aebfe0', '#bccbe9', '#9fb2d6', '#c6d2ee', '#93a7cd', '#b2c1e2'];

function CloudField() {
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.04) * 0.16;
      group.current.position.x = Math.sin(t * 0.05) * 0.9;
      group.current.position.y = Math.sin(t * 0.03) * 0.35;
    }
  });

  // Procedurally stack many clouds across several depth layers.
  const clouds = useMemo(() => {
    const arr = [];
    const layers = [-1.5, -4, -6.5, -9, -12, -15];
    let seed = 1;
    layers.forEach((z, li) => {
      const count = 3 + (li % 2 === 0 ? 1 : 0); // 3-4 per layer
      for (let k = 0; k < count; k++) {
        arr.push({
          seed: seed++,
          pos: [
            (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 8,
            z + (Math.random() - 0.5) * 1.6,
          ],
          color: PALE[(seed + k) % PALE.length],
          vol: 7 + Math.random() * 5,
          seg: 28 + Math.round(Math.random() * 8),
          opacity: 0.42 + Math.random() * 0.22, // low per-cloud so they layer softly
        });
      }
    });
    return arr;
  }, []);

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshLambertMaterial} limit={1800}>
        {clouds.map((c) => (
          <Cloud
            key={c.seed}
            seed={c.seed}
            position={c.pos}
            bounds={[12, 3.5, 3.5]}
            segments={c.seg}
            volume={c.vol}
            color={c.color}
            opacity={c.opacity}
            fade={24}
            speed={0.14}
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
