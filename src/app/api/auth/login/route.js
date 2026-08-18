/**
 * Login proxy → VIONA-4 auth workflow.
 *
 * POST { email, password } → VIONA POST /api/v1/auth/login → { data: { token, user } }.
 * (VIONA's Turnstile is not enforced server-side, so email+password is enough.)
 * On success we also drop an httpOnly `viona_token` cookie so the /api/terminals
 * proxy can call the gateways with the logged-in user's own token. The token is
 * additionally returned to the client for the encrypted AuthContext store.
 */

export const dynamic = 'force-dynamic';

const AUTH_URL = process.env.VIONA_AUTH_URL || 'https://viona-api.bignet.id';

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { email, password, turnstileToken } = body;
  if (!email || !password) {
    return Response.json({ status: false, message: 'Email & password wajib diisi.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${AUTH_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password, ...(turnstileToken ? { turnstileToken } : {}) }),
      cache: 'no-store',
    });
    const data = await upstream.json().catch(() => ({}));
    const token = data?.data?.token;

    if (!upstream.ok || !token) {
      return Response.json(
        { status: false, message: data?.message || 'Login gagal.' },
        { status: upstream.status || 401 },
      );
    }

    const user = data?.data?.user || { email };
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append(
      'Set-Cookie',
      `viona_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`,
    );
    return new Response(JSON.stringify({ status: true, user, token }), { status: 200, headers });
  } catch (err) {
    return Response.json(
      { status: false, message: 'Tidak dapat menghubungi server autentikasi.' },
      { status: 502 },
    );
  }
}
