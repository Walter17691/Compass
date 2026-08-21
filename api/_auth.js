import { supabaseRequest } from './_supabase.js';

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

// Phase 6.5 hardening — tenant isolation (P0). verifyCaller only answers
// "is this a real, logged-in Supabase user" — it says nothing about
// whether they belong to the org a request is scoped to, or what role
// they hold there. Several service-role endpoints (which bypass RLS
// entirely, so this check is the ONLY authorization boundary they have)
// were missing this step, or copied it inconsistently by hand — this is
// the one shared implementation every one of them should call instead.
// Writes the appropriate error response itself and returns null on
// failure so call sites can just do:
//   const auth = await requireOrgMembership(req, res, orgId);
//   if (!auth) return; // response already sent
export async function requireOrgMembership(req, res, orgId) {
  const caller = await verifyCaller(req);
  if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!orgId) { res.status(400).json({ error: 'orgId is required' }); return null; }
  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [member] = await memberRes.json();
    if (!member) { res.status(403).json({ error: 'Not a member of this organisation' }); return null; }
    return { caller, role: member.role };
  } catch (e) {
    console.error('requireOrgMembership error:', e.message);
    res.status(500).json({ error: 'Could not verify organisation membership' });
    return null;
  }
}

// Convenience wrapper for the common "must be a member AND hold one of
// these roles" shape (e.g. HR-only actions) — same response/return
// contract as requireOrgMembership above. roleCheck can be an array of
// allowed role strings, or a predicate function (role) => boolean — pass
// isHrRole/hasConfidentialOversight from src/lib/roles.js directly to
// stay on the exact same definition the client's own UI gating uses,
// rather than a second hand-copied role list drifting from it.
export async function requireOrgRole(req, res, orgId, roleCheck) {
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return null;
  const allowed = typeof roleCheck === 'function' ? roleCheck(auth.role) : roleCheck.includes(auth.role);
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission to perform this action' });
    return null;
  }
  return auth;
}
