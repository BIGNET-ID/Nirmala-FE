'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ScreenQuad, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Full-frame turbulent storm sky for the login backdrop — a fullscreen FBM cloud
 * shader (like the reference photo) rather than discrete billboard puffs.
 *   math      : value-noise FBM (5 octaves) + two-stage DOMAIN WARP → the wavy,
 *               billowing folds; scrolled over time so the cloud stack drifts.
 *   shading   : light offset-sample difference shades the folds (bright crests,
 *               dark troughs); vertical gradient for a moody lower glow.
 *   lighting  : a uFlash uniform brightens the whole cloud field during a strike.
 *   textures  : the procedural noise IS the texture.
 * Lightning bolts (forked, multi-flicker) render on top and drive uFlash.
 */

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFlash;
  uniform vec2  uRes;

  float hash(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.5); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 3.2;
    float t = uTime * 0.045;

    // two-stage domain warp -> billowing turbulent folds
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.7));
    vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.5),
                  fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.4));
    float f = fbm(p + 3.4 * r);

    float d  = clamp(f * 1.7 - 0.12, 0.0, 1.0);              // cloud density
    float ls = fbm(p + 3.4 * r + vec2(0.0, -0.22));          // sample toward light
    float shade = clamp((f - ls) * 3.2 + 0.5, 0.0, 1.0);     // fold shading

    vec3 dark = vec3(0.20, 0.23, 0.28);
    vec3 lite = vec3(0.82, 0.85, 0.90);
    vec3 col = mix(dark, lite, clamp(shade * d + f * 0.35, 0.0, 1.0));
    col *= (0.80 + 0.34 * (1.0 - uv.y));                     // brighter lower area

    vec3 sky = vec3(0.05, 0.07, 0.11);
    col = mix(sky, col, clamp(d * 1.5, 0.0, 1.0));           // thin edges fade to sky

    col += uFlash * vec3(0.55, 0.62, 0.72) * (0.35 + d);     // lightning illuminates clouds
    gl_FragColor = vec4(col, 1.0);
  }
`;

function CloudShader({ flashRef }) {
  const mat = useRef();
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  }), []);
  useFrame((s) => {
    if (!mat.current) return;
    const u = mat.current.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uFlash.value = flashRef.current || 0;
    u.uRes.value.set(s.size.width, s.size.height);
  });
  return (
    <ScreenQuad renderOrder={-10}>
      <shaderMaterial
        ref={mat}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </ScreenQuad>
  );
}

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

function Storm({ flashRef }) {
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
        if (e >= dur) { setFlash(0); flashRef.current = 0; setBolt(null); schedule(); return; }
        let v = 0;
        for (const p of pulses) v = Math.max(v, p.a * pulseShape(e - p.t));
        const val = distant ? v * 0.6 : v;
        setFlash(val);
        flashRef.current = val;
        raf = requestAnimationFrame(animate);
      };
      animate();
    };
    const schedule = () => { timer = setTimeout(strike, 600 + Math.random() * 1700); };
    timer = setTimeout(strike, 150 + Math.random() * 450);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); flashRef.current = 0; };
  }, [flashRef]);

  return (
    <>
      {bolt?.lines?.map((pts, i) => (
        <group key={i}>
          <Line points={pts} color="#bfefff" lineWidth={i === 0 ? 11 : 6}
            transparent opacity={Math.min(0.55, flash * 1.3)} toneMapped={false} />
          <Line points={pts} color="#ffffff" lineWidth={i === 0 ? 3.4 : 1.9}
            transparent opacity={Math.min(1, flash * 3.6)} toneMapped={false} />
        </group>
      ))}
    </>
  );
}

// ---- scene ----------------------------------------------------------------
export default function WeatherScene() {
  const flashRef = useRef(0);
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 12], fov: 58 }}
      gl={{ antialias: true, alpha: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <CloudShader flashRef={flashRef} />
      <Storm flashRef={flashRef} />
    </Canvas>
  );
}
