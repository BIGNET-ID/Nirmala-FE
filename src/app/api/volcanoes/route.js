/**
 * Indonesian volcano locations, proxied from Overpass (OpenStreetMap's query
 * API) — a public, keyless third-party service, same "gets its own server
 * route" convention as owm/wind. Overpass's shared public instance is rate-
 * limited and this data barely ever changes (volcano coordinates aren't
 * moving), so this caches for a long TTL rather than owm/wind's
 * minutes-scale windows.
 *
 * If Overpass is unreachable and nothing is cached yet, this returns a
 * non-ok response — the client hook (useVolcanoes.js) falls back to the
 * captured-real-response fixture itself, the same way nirmalaApiService's
 * methods do, rather than this route reading `public/fixtures` off a
 * filesystem (this app deploys to Cloudflare Workers via
 * opennextjs-cloudflare, which doesn't guarantee that kind of access).
 */

export const dynamic = 'force-dynamic';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `[out:json];
area["ISO3166-1"="ID"]->.indonesia;
node["natural"="volcano"](area.indonesia);
out body;`;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — static geographic data
let cache = null; // { t, data }

function normalize(elements) {
  return elements
    .filter((e) => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => {
      const tags = e.tags || {};
      return {
        id: e.id,
        name: tags.name || tags['name:en'] || tags.alt_name || null,
        lat: e.lat,
        lng: e.lon,
      };
    });
}

export async function GET() {
  if (cache && Date.now() - cache.t < CACHE_TTL_MS) {
    return Response.json(cache.data, { headers: { 'x-cache': 'hit' } });
  }

  try {
    const r = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // Overpass returns 406 Not Acceptable to requests with no/empty
        // User-Agent (verified directly against the live API) — Next.js's
        // server-side fetch() doesn't set one by default the way curl does.
        'user-agent': 'Nirmala-FE/1.0 (+https://github.com/BIGNET-ID/Nirmala-FE)',
      },
    });
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const json = await r.json();
    const data = { volcanoes: normalize(json.elements || []) };
    cache = { t: Date.now(), data };
    return Response.json(data, { headers: { 'cache-control': 'public, max-age=86400', 'x-cache': 'miss' } });
  } catch (error) {
    console.warn('[api/volcanoes] Overpass unavailable:', error.message);
    if (cache) {
      // Serve stale rather than nothing — this data doesn't go stale fast.
      return Response.json(cache.data, { headers: { 'x-cache': 'stale' } });
    }
    return Response.json({ error: 'overpass_unavailable' }, { status: 502 });
  }
}
