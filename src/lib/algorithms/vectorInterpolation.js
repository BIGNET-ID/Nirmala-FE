/**
 * Bilinear & IDW vector interpolation untuk data angin.
 */

/**
 * Interpolasi IDW sederhana untuk nilai skalar pada titik (px, py)
 * dari daftar stasiun [{px, py, val}]
 */
export function idwScalar(stations, px, py, power = 2) {
  let weightSum = 0;
  let valueSum = 0;

  for (const st of stations) {
    const dx = px - st.px;
    const dy = py - st.py;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1.0) return st.val; // Exact match
    const w = 1 / Math.pow(distSq, power / 2);
    weightSum += w;
    valueSum += w * st.val;
  }

  return weightSum === 0 ? 0 : valueSum / weightSum;
}

/**
 * Interpolasi vektor angin (u, v) menggunakan IDW
 */
export function idwVector(stations, px, py, power = 2) {
  let weightSum = 0;
  let uSum = 0;
  let vSum = 0;

  for (const st of stations) {
    const dx = px - st.px;
    const dy = py - st.py;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1.0) return { u: st.u, v: st.v };
    const w = 1 / Math.pow(distSq, power / 2);
    weightSum += w;
    uSum += w * st.u;
    vSum += w * st.v;
  }

  if (weightSum === 0) return { u: 0, v: 0 };
  return { u: uSum / weightSum, v: vSum / weightSum };
}