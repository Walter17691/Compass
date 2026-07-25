const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
// Public anon key — safe to duplicate here, it's already shipped in the
// client bundle (src/supabase.js). Only used to validate a caller-supplied
// access token against Supabase's own /auth/v1/user endpoint.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWVnZnNvaWpoZG5udnVxamluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU2MjYsImV4cCI6MjA5NzAzMTYyNn0.IPdANRIK94XdCWy7aK1MOiIVqYgPKmvN8_ZJ6LCENBI';

// Verifies who is actually calling, server-side, via their own Supabase
// access token — never trust a client-supplied userId/orgId directly, since
// anyone can type any value into a query string or request body. The
// client must send `Authorization: Bearer <access_token>` (the token from
// supabase.auth.getSession()); this calls Supabase's own auth endpoint to
// confirm the token is real and get the user id it actually belongs to.
export async function verifyCaller(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id, email: user.email } : null;
  } catch (e) {
    console.error('verifyCaller error:', e.message);
    return null;
  }
}
