'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Realistic weather-themed 3D login backdrop (no post-processing — kept robust).
 *   material/shading : lit MeshLambert volumetric clouds; strong key light so
 *                      the puffy texture reads even between strikes
 *   light            : bright ambient/hemi/directional + dynamic lightning
 *   geography        : depth layers with atmospheric perspective (far = paler,
 *                      cooler, larger, more transparent) + a low horizon bank
 *   math             : exponential fog (fogExp2); multi-flicker lightning; forked
 *                      bolt geometry; a fat additive-looking halo fakes bloom glow
 *   post             : ACES filmic tone-mapping on the renderer
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
    // fire the first strike quickly — no long wait after load
    timer = setTimeout(strike, 150 + Math.random() * 450);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <pointLight position={[bolt?.x ?? 0, 3.5, -2]} color="#f2faff" distance={100} decay={1.4} intensity={flash * 620} />
      <ambientLight intensity={flash * 1.5} color="#dcefff" />
      {bolt?.lines?.map((pts, i) => (
        <group key={i}>
          {/* fat soft halo (fakes bloom) */}
          <Line points={pts} color="#bfefff" lineWidth={i === 0 ? 11 : 6}
            transparent opacity={Math.min(0.55, flash * 1.3)} toneMapped={false} />
          {/* bright core */}
          <Line points={pts} color="#ffffff" lineWidth={i === 0 ? 3.4 : 1.9}
            transparent opacity={Math.min(1, flash * 3.6)} toneMapped={false} />
        </group>
      ))}
    </>
  );
}

// ---- clouds ---------------------------------------------------------------
const LAYERS = [
  { z: -1.5, tint: '#e2eafb', op: 0.74, vol: 8 },
  { z: -4.0, tint: '#d2ddf4', op: 0.66, vol: 9 },
  { z: -7.0, tint: '#bccce9', op: 0.58, vol: 10 },
  { z: -10.0, tint: '#a4b7db', op: 0.50, vol: 11 },
  { z: -13.0, tint: '#8b9ec3', op: 0.42, vol: 12 },
  { z: -16.0, tint: '#7688a8', op: 0.34, vol: 13 },
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
    arr.push({ seed: seed++, pos: [0, -5.6, -9], color: '#a4b7db', vol: 16, seg: 46, opacity: 0.44 });
    return arr;
  }, []);

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshLambertMaterial} limit={2200}>
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
        toneMappingExposure: 1.2,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#050811']} />
      <fogExp2 attach="fog" args={['#050811', 0.038]} />

      {/* bright base lighting so cloud texture reads even between strikes */}
      <ambientLight intensity={0.55} color="#48659a" />
      <hemisphereLight intensity={0.6} color="#bcd2ff" groundColor="#0a1220" />
      <directionalLight position={[5, 9, 4]} intensity={1.1} color="#c8daf4" />
      <directionalLight position={[-6, 4, 2]} intensity={0.4} color="#7fa0d8" />

      <Stars radius={90} depth={45} count={1400} factor={3.2} saturation={0} fade speed={0.5} />
      <CloudField />
      <Storm />
      <Storm />
    </Canvas>
  );
}
