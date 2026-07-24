const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';

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
