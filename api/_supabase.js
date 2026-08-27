// Phase 7 (Controlled Beta Infrastructure Gate 3) — configurable so a
// non-production Vercel deployment (e.g. a preview used for E2E) can
// point its serverless functions at the separate compass-e2e-test
// Supabase project via a Vercel env var, instead of always writing to
// production. Falls back to the existing hardcoded production URL, so
// production itself needs no change to keep working.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';

export async function supabaseRequest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}
