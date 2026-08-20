// Screen-space grid clustering for the Node Sensor map mode. Pure,
// framework-free: takes already-projected screen points and buckets them
// into fixed-size cells. Any cell with >1 point becomes a cluster; single-
// point cells pass through unchanged. Recomputed every paint() since screen
// positions are zoom/pan-dependent — cheap at ~4.5k points per frame.

export function clusterPoints(points, cellSize) {
  const grid = new Map(); // "cx:cy" -> items[]
  for (const p of points) {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = `${cx}:${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }

  const clusters = [];
  const singles = [];
  for (const items of grid.values()) {
    if (items.length === 1) { singles.push(items[0]); continue; }
    let sx = 0, sy = 0, isRaining = false, hasBlacklisted = false, hasInactive = false;
    for (const it of items) {
      sx += it.x; sy += it.y;
      if (it.st.isRaining) isRaining = true;
      if (it.st.blacklisted || it.st.status === 'blacklisted') hasBlacklisted = true;
      if (it.st.inactive || it.st.unavailable || it.st.status === 'inactive') hasInactive = true;
    }
    clusters.push({
      x: sx / items.length,
      y: sy / items.length,
      count: items.length,
      items,
      isRaining,
      hasBlacklisted,
      hasInactive,
    });
  }
  return { clusters, singles };
}
