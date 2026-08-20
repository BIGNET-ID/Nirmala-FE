/**
 * TEMPORARY hardcoded login — VIONA-4 auth workflow disabled until the
 * official Nirmala backend auth is ready. Checked server-side only, never
 * shipped to the client bundle. Downstream /api/terminals-style routes
 * fall back to VIONA_API_TOKEN when there's no per-user viona_token
 * cookie, so this route doesn't need to mint a real VIONA token.
 *
 * Known risk (flagged, accepted by product owner 2026-08-20): plaintext
 * credentials in source. Replace with real backend auth before this ships
 * beyond internal/demo use.
 *
 * TODO: remove this block and restore the VIONA proxy once backend auth
 * ships. See git history for the original implementation.
 */

export const dynamic = 'force-dynamic';

const TEMP_EMAIL = 'ITBDI@bignet.id';
const TEMP_PASSWORD = 'admin';

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ status: false, message: 'Email & password wajib diisi.' }, { status: 400 });
  }

  if (
    email.trim().toLowerCase() !== TEMP_EMAIL.toLowerCase() ||
    password !== TEMP_PASSWORD
  ) {
    return Response.json({ status: false, message: 'Email atau password salah.' }, { status: 401 });
  }

  const token = crypto.randomUUID();
  const user = { email };
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `viona_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`,
  );
  return new Response(JSON.stringify({ status: true, user, token }), { status: 200, headers });
}
