/**
 * TEMPORARY sensor source: VIONA RTGS terminals.
 *
 * While the real Nirmala sensor API isn't reachable, this fetches VIONA's
 * `/api/v1/terminal/latlong` from the 3 gateways (jyp=g1g, mnk=g1k, tmk=g1l),
 * merges + dedupes by lat/long, and maps each terminal into the Nirmala sensor
 * RAW shape so normalizeSensors + the whole dashboard work unchanged.
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

  const lists = await Promise.all(GATEWAYS.map(async (base) => {
    try {
      const r = await fetch(`${base}/api/v1/terminal/latlong`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!r.ok) return [];
      const json = await r.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch {
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

  return Response.json({
    source: 'viona-terminals',
    total_items: sensors.length,
    alert: `Live (VIONA terminals): ${sensors.length} site · ${sensors.filter((s) => s.status === 'active').length} online`,
    sensors,
  });
}
