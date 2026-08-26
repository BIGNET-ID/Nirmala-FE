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

const TEMP_USERS = [
  { email: 'ITBDI@bignet.id', password: 'admin' },
  { email: 'rendra@bignet.id', password: 'UV%a5u[8f:+@uS2(YgQ0Dl3]lPWh66lO' },
  { email: 'bony.muslimin@bignet.id', password: '5JKetJX{UcUBf(UF?@kblvup:CfBQR13' },
];

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ status: false, message: 'Email & password wajib diisi.' }, { status: 400 });
  }

  const match = TEMP_USERS.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
  );
  if (!match) {
    return Response.json({ status: false, message: 'Email atau password salah.' }, { status: 401 });
  }

  const token = crypto.randomUUID();
  const user = { email: match.email };
  return Response.json({ status: true, user, token });
}
