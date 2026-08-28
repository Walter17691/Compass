// Phase 8A — shared environment guard for every UAT fixture/reset script
// in this directory. Every script in scripts/uat/ MUST call
// requireNonProductionSupabase() before issuing a single write, and MUST
// NOT fall back to any hardcoded Supabase URL the way api/_supabase.js's
// production-fallback pattern does — that fallback exists there so a
// real API route degrades to production if a deploy-time env var is
// missing, which is exactly the behaviour a UAT script must never have.
//
// Resolution order: SUPABASE_URL (server-side var name) first, then
// VITE_SUPABASE_URL (what this repo's own .env actually sets today) —
// no third option, no default. Either must explicitly resolve to the
// known compass-e2e-test project ref, or this refuses to run.

const PRODUCTION_REF = 'npeegfsoijhdnnvuqjin';
const E2E_TEST_REF = 'zdbbvljbndmujywtkwfy';

export function requireNonProductionSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'Refusing to run: neither SUPABASE_URL nor VITE_SUPABASE_URL is set. ' +
      'This script never falls back to a default project — set one explicitly (via .env) before running.'
    );
  }
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      `Refusing to run: resolved Supabase URL points at the PRODUCTION project (${PRODUCTION_REF}). ` +
      'UAT scripts must never write to production.'
    );
  }
  if (!url.includes(E2E_TEST_REF)) {
    throw new Error(
      `Refusing to run: resolved Supabase URL does not match the known non-production compass-e2e-test project (${E2E_TEST_REF}). ` +
      `Resolved to a different project — if this is intentional (e.g. a genuinely new dedicated UAT project), update E2E_TEST_REF in scripts/uat/_guard.js deliberately, don't bypass this check.`
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('Refusing to run: SUPABASE_SERVICE_KEY is not set.');
  }

  return { url, serviceKey };
}

export async function supabaseRest(path, options = {}) {
  const { url, serviceKey } = requireNonProductionSupabase();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function supabaseAdminAuth(path, options = {}) {
  const { url, serviceKey } = requireNonProductionSupabase();
  const res = await fetch(`${url}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}
