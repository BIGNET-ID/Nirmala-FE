/**
 * TEMPORARY hardcoded login, disabled until the official Nirmala backend
 * auth is ready. Checked server-side only, never shipped to the client
 * bundle.
 *
 * Known risk (flagged, accepted by product owner 2026-08-20): plaintext
 * credentials in source. Replace with real backend auth before this ships
 * beyond internal/demo use.
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
  return Response.json({ status: true, user, token });
}
