'use client';

import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars, Line, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Warm the cloud sprite into drei's texture cache on import, so the first render
// doesn't suspend (which — without a boundary — errored into the static fallback,
// making clouds appear only after a client-side re-nav).
useTexture.preload('/cloud-sprite.png');

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
// Subdivide a jagged polyline into many short segments. drei <Line> puts a round
// join at every vertex; with long segments those joins read as circular "nodes".
// Short segments make the joins overlap into one continuous smooth stroke.
function densify(pts, sub = 5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1, z1] = pts[i];
    const [x2, y2, z2] = pts[i + 1];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

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
  return { lines: lines.map((l) => densify(l)), x: x0 };
}

const pulseShape = (dt) => (dt < 0 ? 0 : dt < 0.02 ? dt / 0.02 : dt < 0.11 ? 1 - (dt - 0.02) / 0.09 : 0);

function Storm({ haloColor = '#bfefff', haloOpacityMax = 0.45 }) {
  const [bolt, setBolt] = useState(null);
  const [flash, setFlash] = useState(0);   // only drives bolt-line opacity; updated only when a bolt is shown
  const lightRef = useRef();
  const ambientRef = useRef();

  useEffect(() => {
    let timer, raf;
    const strike = () => {
      // Most strikes are cloud-glow only (sheet lightning); a visible bolt is rare.
      const b = Math.random() < 0.22 ? makeBolt() : null;
      setBolt(b);
      const fx = b ? b.x : (Math.random() - 0.5) * 16;
      if (lightRef.current) lightRef.current.position.set(fx, 1.5 + Math.random() * 4, -2 - Math.random() * 4);
      const peak = 0.5 + Math.random() * 0.5;          // vary flash brightness for realism
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
        if (e >= dur) {
          if (lightRef.current) lightRef.current.intensity = 0;
          if (ambientRef.current) ambientRef.current.intensity = 0;
          if (b) setFlash(0);
          setBolt(null); schedule(); return;
        }
        let v = 0;
        for (const p of pulses) v = Math.max(v, p.a * pulseShape(e - p.t));
        const val = peak * v;
        // Drive the lights by mutating refs (no React re-render each frame).
        if (lightRef.current) lightRef.current.intensity = val * 560;
        if (ambientRef.current) ambientRef.current.intensity = val * 1.7;
        if (b) setFlash(val);   // only re-render (for the bolt lines) when a bolt is on screen
        raf = requestAnimationFrame(animate);
      };
      animate();
    };
    // frequent cloud-glow flashes
    const schedule = () => { timer = setTimeout(strike, 450 + Math.random() * 1200); };
    timer = setTimeout(strike, 150 + Math.random() * 400);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      {/* broad soft glow illuminating the clouds (sheet lightning) */}
      <pointLight ref={lightRef} color="#eaf4ff" distance={140} decay={1.25} intensity={0} />
      <ambientLight ref={ambientRef} color="#dcefff" intensity={0} />
      {bolt?.lines?.map((pts, i) => (
        <group key={i}>
          {/* soft halo (fakes bloom / dark outline on light) — slim so joins don't dot */}
          <Line points={pts} color={haloColor} lineWidth={i === 0 ? 6 : 3.5}
            transparent opacity={Math.min(haloOpacityMax, flash * 1.2)} toneMapped={false} />
          {/* bright core */}
          <Line points={pts} color="#ffffff" lineWidth={i === 0 ? 2.2 : 1.3}
            transparent opacity={Math.min(1, flash * 3.6)} toneMapped={false} />
        </group>
      ))}
    </>
  );
}

// ---- clouds ---------------------------------------------------------------
// drei Cloud's default sprite lives on the pmndrs CDN (unreachable here);
// we serve the same sprite locally from /public instead.
const CLOUD_SPRITE = '/cloud-sprite.png';

// Distinct, separated cloud clumps at varied depths & sizes — dramatic billows,
// not a uniform smoky haze. Same geometry for both themes; only colours differ.
// DARK: pale clouds on near-black. LIGHT: darker storm-grey clouds on a pale sky.
const GEO = [
  { pos: [-7.0, 1.8, -3], scale: 1.5, op: 0.96, seg: 46, vol: 6.5 },
  { pos: [6.6, 2.6, -5], scale: 1.9, op: 0.92, seg: 48, vol: 7.5 },
  { pos: [-1.6, -1.9, -2], scale: 1.25, op: 0.98, seg: 42, vol: 5.5 },
  { pos: [4.0, -1.4, -4], scale: 1.2, op: 0.9, seg: 42, vol: 5.5 },
  { pos: [-9.6, -2.8, -7], scale: 2.2, op: 0.74, seg: 50, vol: 8.5 },
  { pos: [9.6, -2.4, -8], scale: 2.0, op: 0.7, seg: 50, vol: 8.5 },
  { pos: [0.6, 4.3, -6], scale: 1.7, op: 0.8, seg: 46, vol: 7.5 },
  { pos: [-4.6, 4.0, -10], scale: 2.5, op: 0.62, seg: 52, vol: 9.5 },
  { pos: [0, -5.6, -9], scale: 2.7, op: 0.64, seg: 52, vol: 10 }, // low bank
];
const DARK_COLORS = ['#dbe4f5', '#c6d3ea', '#e8effc', '#bccbe6', '#a1b2d2', '#93a5c6', '#b0c1e2', '#7f92b6', '#98aacb'];
const LIGHT_COLORS = ['#7a8598', '#6b7688', '#828da0', '#606b7e', '#525b6d', '#5c6779', '#727d92', '#4b5367', '#69738a'];
const CLUMPS_DARK = GEO.map((g, i) => ({ ...g, color: DARK_COLORS[i] }));
const CLUMPS_LIGHT = GEO.map((g, i) => ({ ...g, color: LIGHT_COLORS[i], op: Math.min(1, g.op + 0.04) }));

function CloudField({ clumps = CLUMPS_DARK }) {
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.03) * 0.1;
      group.current.position.x = Math.sin(t * 0.04) * 0.7;
      group.current.position.y = Math.sin(t * 0.025) * 0.25;
    }
  });

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshLambertMaterial} limit={2800}>
        {clumps.map((c, i) => (
          <Cloud
            key={i}
            seed={i + 1}
            texture={CLOUD_SPRITE}
            position={c.pos}
            scale={c.scale}
            bounds={[5, 4, 4]}
            segments={c.seg}
            volume={c.vol}
            color={c.color}
            opacity={c.op}
            fade={18}
            speed={0.11}
            growth={4}
          />
        ))}
      </Clouds>
    </group>
  );
}

// ---- rain (drizzle streaks) ----------------------------------------------
function Rain({ count = 400, warp = false, color = '#c3d8ff', opacity = 0.32 }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 6); // 2 verts per streak
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 46;
      const y = Math.random() * 34 - 6;
      const z = (Math.random() - 0.5) * 22 - 3;
      const len = 0.45 + Math.random() * 0.6;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  const speeds = useMemo(() => Array.from({ length: count }, () => 8 + Math.random() * 12), [count]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const mult = warp ? 4 : 1; // rain rushes past when charging through
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const dy = speeds[i] * step * mult;
      p[i * 6 + 1] -= dy; p[i * 6 + 4] -= dy;
      if (p[i * 6 + 1] < -14) {
        const ny = 22 + Math.random() * 8;
        const x = (Math.random() - 0.5) * 46;
        const z = (Math.random() - 0.5) * 22 - 3;
        const len = 0.45 + Math.random() * 0.6;
        p[i * 6] = x; p[i * 6 + 1] = ny; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x; p[i * 6 + 4] = ny - len; p[i * 6 + 5] = z;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}

// ---- camera charge through the storm on successful login ------------------
function CameraRig({ warp }) {
  const start = useRef(null);
  useFrame((state) => {
    if (!warp) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const T = 2.9;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / T);
    const accel = t * t;                       // charging acceleration
    const clk = state.clock.elapsedTime;
    state.camera.position.z = 12 - accel * 40; // dive deep through the clouds
    // building shake + roll — "menerjang"
    const shake = t * 0.15;
    state.camera.position.x = Math.sin(clk * 43) * shake;
    state.camera.position.y = Math.cos(clk * 37) * shake * 0.8;
    state.camera.rotation.z = Math.sin(clk * 26) * t * 0.05;
    state.camera.fov = 58 + accel * 34;        // widen hard for the rush
    state.camera.updateProjectionMatrix();
  });
  return null;
}

// Strobing lightning while charging through the storm.
function WarpFX({ warp }) {
  const amb = useRef();
  useFrame((state) => {
    if (!amb.current) return;
    if (!warp) { amb.current.intensity = 0; return; }
    const s = Math.pow(Math.abs(Math.sin(state.clock.elapsedTime * 15)), 1.5);
    amb.current.intensity = (0.3 + 0.9 * s) * 2.6;
  });
  return <ambientLight ref={amb} color="#eaf4ff" intensity={0} />;
}

// ---- theme palettes -------------------------------------------------------
const PALETTE = {
  dark: {
    bg: '#050811', fogDensity: 0.038,
    clouds: CLUMPS_DARK,
    rain: '#c3d8ff', rainOpacity: 0.32,
    boltHalo: '#bfefff', boltHaloOpacity: 0.45,
    stars: true,
    lights: { amb: 0.28, ambC: '#3a5488', hemi: 0.4, hemiC: '#a9c4ff', hemiG: '#0a1220',
      dir1: 1.9, dir1C: '#dce8fb', dir2: 0.35, dir2C: '#5f7ba8' },
  },
  light: {
    // pale daytime sky; darker storm-grey clouds stay very visible
    bg: '#e6ecf4', fogDensity: 0.028,
    clouds: CLUMPS_LIGHT,
    rain: '#5a6b8a', rainOpacity: 0.42,
    boltHalo: '#33507f', boltHaloOpacity: 0.6, // dark-blue outline reads on light
    stars: false,
    lights: { amb: 0.6, ambC: '#cdd9ec', hemi: 0.6, hemiC: '#eef4fd', hemiG: '#b6c2d4',
      dir1: 1.55, dir1C: '#ffffff', dir2: 0.3, dir2C: '#9fb0c8' },
  },
};

// ---- scene ----------------------------------------------------------------
export default function WeatherScene({ warp = false, mode = 'dark' }) {
  const P = PALETTE[mode] || PALETTE.dark;
  const L = P.lights;
  return (
    <Canvas
      dpr={1}
      camera={{ position: [0, 0, 12], fov: 58 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[P.bg]} />
      <fogExp2 attach="fog" args={[P.bg, P.fogDensity]} />

      {/* high-contrast lighting → bright tops, dark undersides = 3D billows */}
      <ambientLight intensity={L.amb} color={L.ambC} />
      <hemisphereLight intensity={L.hemi} color={L.hemiC} groundColor={L.hemiG} />
      <directionalLight position={[6, 11, 5]} intensity={L.dir1} color={L.dir1C} />
      <directionalLight position={[-7, 2, -3]} intensity={L.dir2} color={L.dir2C} />

      {P.stars && (
        <Stars radius={90} depth={45} count={800} factor={3.2} saturation={0} fade speed={0.5} />
      )}
      <Suspense fallback={null}>
        <CloudField clumps={P.clouds} />
      </Suspense>
      <Rain warp={warp} color={P.rain} opacity={P.rainOpacity} />
      <Storm haloColor={P.boltHalo} haloOpacityMax={P.boltHaloOpacity} />
      <Storm haloColor={P.boltHalo} haloOpacityMax={P.boltHaloOpacity} />
      <WarpFX warp={warp} />
      <CameraRig warp={warp} />
    </Canvas>
  );
}
