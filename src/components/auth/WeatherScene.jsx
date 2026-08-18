'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars, Line, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/**
 * Realistic weather-themed 3D login backdrop.
 *   shading/material : PBR MeshStandardMaterial on drei volumetric Clouds
 *   light            : Environment IBL (softbox Lightformers) + key/hemi/ambient
 *                      + dynamic lightning flash lights
 *   geometry/geo     : clouds distributed over depth layers with atmospheric
 *                      perspective (far = cooler, paler, larger, more transparent)
 *   math             : exponential fog (fogExp2) for real distance haze;
 *                      multi-flicker lightning envelope; forked bolt geometry
 *   post             : ACES filmic tone-mapping + Bloom (glow) + Vignette
 */

// ---- lightning ------------------------------------------------------------
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

const pulseShape = (dt) => (dt < 0 ? 0 : dt < 0.02 ? dt / 0.02 : dt < 0.11 ? 1 - (dt - 0.02) / 0.09 : 0);

function Storm() {
  const [bolt, setBolt] = useState(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let timer, raf;
    const strike = () => {
      const distant = Math.random() < 0.3;
      setBolt(distant ? null : makeBolt());
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
        const e = (performance.now() - start) / 1000;
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
      <pointLight position={[bolt?.x ?? 0, 3.5, -2]} color="#eaf6ff" distance={80} decay={1.5} intensity={flash * 380} />
      <ambientLight intensity={flash * 1.1} color="#cfe8ff" />
      {bolt?.lines?.map((pts, i) => (
        <Line key={i} points={pts} color="#f4ffff" lineWidth={i === 0 ? 2.6 : 1.4}
          transparent opacity={Math.min(1, flash * 3.2)} toneMapped={false} />
      ))}
    </>
  );
}

// ---- clouds ---------------------------------------------------------------
// Depth layers: far layers are paler, cooler, larger, more transparent
// (atmospheric perspective).
const LAYERS = [
  { z: -1.5, tint: '#cdd8f0', op: 0.62, vol: 8 },
  { z: -4.0, tint: '#bccbe8', op: 0.55, vol: 9 },
  { z: -7.0, tint: '#a6b8dc', op: 0.47, vol: 10 },
  { z: -10.0, tint: '#8ea3c8', op: 0.40, vol: 11 },
  { z: -13.0, tint: '#7889ab', op: 0.33, vol: 12 },
  { z: -16.0, tint: '#63758f', op: 0.27, vol: 13 },
];

function CloudField() {
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.035) * 0.14;
      group.current.position.x = Math.sin(t * 0.045) * 0.9;
      group.current.position.y = Math.sin(t * 0.028) * 0.35;
    }
  });

  const clouds = useMemo(() => {
    const arr = [];
    let seed = 1;
    LAYERS.forEach((d, li) => {
      const n = 3 + (li % 2);
      for (let k = 0; k < n; k++) {
        arr.push({
          seed: seed++,
          pos: [
            (Math.random() - 0.5) * (18 + li * 2.5),
            (Math.random() - 0.5) * 8,
            d.z + (Math.random() - 0.5) * 1.4,
          ],
          color: d.tint,
          vol: d.vol + Math.random() * 3,
          seg: 26 + Math.round(Math.random() * 10),
          opacity: d.op * (0.85 + Math.random() * 0.35),
        });
      }
    });
    // low horizon cloud bank
    arr.push({ seed: seed++, pos: [0, -5.6, -9], color: '#8ea3c8', vol: 16, seg: 46, opacity: 0.42 });
    return arr;
  }, []);

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshStandardMaterial} limit={2200}>
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
            fade={22}
            speed={0.13}
            growth={6}
          />
        ))}
      </Clouds>
    </group>
  );
}

// ---- scene ----------------------------------------------------------------
export default function WeatherScene() {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 12], fov: 58 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#050811']} />
      <fogExp2 attach="fog" args={['#050811', 0.04]} />

      {/* base + image-based lighting */}
      <ambientLight intensity={0.32} color="#3a5488" />
      <hemisphereLight intensity={0.35} color="#9fc0ff" groundColor="#0a1220" />
      <directionalLight position={[5, 9, 4]} intensity={0.55} color="#aac4ec" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={0.9} color="#a9c6ff" position={[0, 7, -3]} scale={[14, 7, 1]} />
        <Lightformer form="rect" intensity={0.25} color="#22344f" position={[0, -7, -3]} scale={[14, 7, 1]} />
        <Lightformer form="circle" intensity={0.5} color="#dfe9ff" position={[-6, 3, 2]} scale={[4, 4, 1]} />
      </Environment>

      <Stars radius={90} depth={45} count={1400} factor={3.2} saturation={0} fade speed={0.5} />
      <CloudField />
      <Storm />
      <Storm />

      <EffectComposer disableNormalPass>
        <Bloom mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.25} intensity={0.95} radius={0.7} />
        <Vignette eskil={false} offset={0.25} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
