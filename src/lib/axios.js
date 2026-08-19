import axios from 'axios';

// Same-origin: the browser calls /api/* which the Next proxy route
// (app/api/[...path]) forwards to the real backend, keeping CORS + token
// server-side. Override with NEXT_PUBLIC_API_BASE_URL only to bypass the proxy.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const nirmalaApi = axios.create({
  baseURL: API_BASE_URL,
  // Most endpoints respond in well under a second, but /api/sensors (4.500+
  // stations, ~1.2MB) measured ~8.7s against the live backend — comfortably
  // above the PRD's claimed ~300ms. Keep this above the proxy's own
  // TIMEOUT_MS (see app/api/[...path]/route.js) so the proxy's 502 (not an
  // axios client-side abort) is what triggers fixture-fallback.
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Response Interceptor for Error Diagnostics.
// Every caller in nirmalaApiService catches this rejection and falls back to
// a fixture (see src/lib/nirmalaApi.js) — so a 502 here (our own proxy timing
// out against a momentarily slow backend, see app/api/[...path]/route.js) is
// an already-handled, expected-under-load condition, not an unhandled error.
// console.warn (not console.error) so it doesn't trip Next.js's dev error
// overlay for something the app already recovers from gracefully.
nirmalaApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;
    const message = error?.message;

    if (status) {
      console.warn(`[Nirmala API Warning] ${status}: ${message} — falling back to fixture`);
    } else if (message?.includes('timeout')) {
      console.warn('[Nirmala API Warning] Request timeout - using fallback data');
    } else {
      console.warn(`[Nirmala API Warning] ${message || 'Unknown error'}`);
    }

    return Promise.reject(error);
  }
);
