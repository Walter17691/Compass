import { supabase } from '../supabase';

// Attaches the current Supabase session's access token as a Bearer header
// so server-side endpoints can verify who's actually calling (api/_auth.js)
// instead of trusting a client-supplied userId. Use for every api/portal,
// api/calendar, api/billing, and api/cron/test-notify call.
export async function authedFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
