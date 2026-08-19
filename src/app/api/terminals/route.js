/**
 * DEPRECATED / unused: VIONA RTGS terminals sensor source.
 *
 * This was a temporary stand-in for sensor data while the real Nirmala
 * sensor API was unreachable. `nirmalaApiService.getSensors()` now calls
 * the official `/api/sensors` (see src/lib/nirmalaApi.js) — this route is
 * no longer called from the service layer. Left in place, unused, in case
 * VIONA terminal data is needed again later.
 *
 * Fetches VIONA's `/api/v1/terminal/latlong` from the 3 gateways (jyp=g1g,
 * mnk=g1k, tmk=g1l), merges + dedupes by lat/long, and maps each terminal
 * into the Nirmala sensor RAW shape so normalizeSensors + the whole
 * dashboard would work unchanged if re-enabled.
 *
 * VIONA requires a Bearer token (same token works for all 3 gateways). Token +
 * gateway URLs are server-only env; the browser only sees /api/terminals.
 * Terminals carry no rain data → is_raining=false (rain heatmap stays empty;
 * the coverage/dots network still renders). status: 1 = online → 'active'.
 */

export const dynamic = 'force-dynamic';

const GATEWAYS = [
  process.env.VIONA_API_URL_JYP || 'https://viona-api1.g1g.bignet.host',
  process.env.VIONA_API_URL_MNK || 'https://viona-api1.g1k.bignet.host',
  process.env.VIONA_API_URL_TMK || 'https://viona-api1.g1l.bignet.host',
];

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

export async function GET(request) {
  // Prefer the logged-in user's VIONA token (cookie set by /api/auth/login),
  // fall back to a static env token for headless testing.
  const TOKEN = readCookie(request, 'viona_token') || process.env.VIONA_API_TOKEN || '';
  if (!TOKEN) {
    return Response.json({ error: 'no_viona_token', sensors: [] }, { status: 502 });
  }

  // Per-gateway diagnostics so a silent partial failure (one regional gateway
  // down → a whole region vanishes from the map) is visible, not swallowed.
  const diag = [];
  const lists = await Promise.all(GATEWAYS.map(async (base) => {
    const host = (() => { try { return new URL(base).host; } catch { return base; } })();
    try {
      const r = await fetch(`${base}/api/v1/terminal/latlong`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!r.ok) { diag.push({ host, ok: false, httpStatus: r.status, count: 0 }); return []; }
      const json = await r.json();
      const arr = Array.isArray(json?.data) ? json.data : [];
      const lngs = arr.map((t) => parseFloat(t.longitude)).filter(Number.isFinite);
      diag.push({
        host, ok: true, count: arr.length,
        lngRange: lngs.length ? [Math.min(...lngs), Math.max(...lngs)] : null,
      });
      return arr;
    } catch (e) {
      diag.push({ host, ok: false, error: String(e?.message || e), count: 0 });
      return [];
    }
  }));

  const seen = new Set();
  const sensors = [];
  for (const list of lists) {
    for (const t of list) {
      if (t.latitude == null || t.longitude == null) continue;
      const key = `${t.latitude},${t.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const online = t.status === 1;
      sensors.push({
        id: t.id ?? t.terminal_id ?? t.terminal_name ?? t.name ?? key,
        latitude: parseFloat(t.latitude),
        longitude: parseFloat(t.longitude),
        status: online ? 'active' : 'inactive',
        is_raining: false,          // terminals carry no rain data
        blacklisted: false,
        manual_blacklisted: false,
        inactive: !online,
        unavailable: false,
        last_update: t.last_update ?? t.updated_at ?? null,
        _type: 'terminal',
      });
    }
  }

  // Longitude histogram (5° buckets) + active-vs-total east of 134°E (Papua),
  // so we can tell "no Papua data" from "Papua data present but inactive".
  const lngHist = {};
  let papuaTotal = 0, papuaActive = 0;
  for (const s of sensors) {
    if (!Number.isFinite(s.longitude)) continue;
    const k = Math.floor(s.longitude / 5) * 5;
    lngHist[k] = (lngHist[k] || 0) + 1;
    if (s.longitude > 134) { papuaTotal++; if (s.status === 'active') papuaActive++; }
  }

  return Response.json({
    source: 'viona-terminals',
    total_items: sensors.length,
    alert: `Live (VIONA terminals): ${sensors.length} site · ${sensors.filter((s) => s.status === 'active').length} online`,
    _diag: { gateways: diag, lngHistogram_5deg: lngHist, papua_lng_gt_134: { total: papuaTotal, active: papuaActive } },
    sensors,
  });
}
