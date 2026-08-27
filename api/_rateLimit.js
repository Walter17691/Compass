// Phase 7 (Controlled Beta Infrastructure Gate 3) — see api/_supabase.js
// for why this is now configurable via env var with a production fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Fails OPEN: if the rate limiter itself is unreachable, we let the request
// through rather than taking down the core AI feature over an outage in an
// abuse-prevention control. Auth (verifyCaller) is the real security
// boundary here — this just caps sustained abuse from one caller.
export async function checkRateLimit(key, limit, windowSeconds) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) {
      console.error('Rate limit check failed:', await res.text());
      return true;
    }
    return await res.json();
  } catch (e) {
    console.error('Rate limit check error:', e.message);
    return true;
  }
}
