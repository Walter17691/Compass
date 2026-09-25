import { verifyCaller } from './_auth.js';
import { supabaseRequest } from './_supabase.js';

// Platform Admin Foundation — the sole authorization check for Compass
// operator (cross-tenant) routes, deliberately independent of org_members.
// Requires an authenticated caller (verifyCaller — their own Supabase
// access token, never a client-supplied id) AND a live (non-revoked) row
// in platform_admins, read via the service-role key so RLS's deliberate
// deny-all on that table never blocks this legitimate server-side check.
//
// This function must never be extended to accept an orgId or grant any
// case-content access — platform admins administer organisation/contract
// metadata only, through dedicated routes that never query cases,
// allegations, case_tasks, case_themes, case_signals, hr_review_requests,
// signing_requests, meetings, or evidence content. See platform_admin_
// foundation_2026-09-06.sql's own header for the full reasoning.
//
// `meetings` joined that list in Phase 4C.1 (supabase/standalone_meetings_
// 2026-09-25.sql). A standalone meeting holds a verbatim transcript of a
// conversation about a named employee — case content by any reasonable reading,
// and if anything more sensitive than most, since an informal 1-1 is exactly the
// conversation people expect to stay within their own organisation. Its RLS
// grants nothing to platform admins by construction: every policy branch
// requires an org_members row for auth.uid(), and platform admin status is
// deliberately independent of org_members. The prohibition here is the second
// lock, and platformAdminIsolation.test.js is the assertion that both hold.
//
// Same response/return contract as requireOrgMembership/requireOrgRole in
// _auth.js: writes the appropriate error response itself and returns null
// on failure, so call sites can just do:
//   const auth = await requirePlatformAdmin(req, res);
//   if (!auth) return; // response already sent
export async function requirePlatformAdmin(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }

  try {
    const adminRes = await supabaseRequest(
      `platform_admins?user_id=eq.${encodeURIComponent(caller.id)}&revoked_at=is.null&select=user_id,granted_at`
    );
    const [admin] = await adminRes.json();
    if (!admin) { res.status(403).json({ error: 'You do not have permission to perform this action' }); return null; }
    return { caller, grantedAt: admin.granted_at };
  } catch (e) {
    console.error('requirePlatformAdmin error:', e.message);
    res.status(500).json({ error: 'Could not verify platform administrator status' });
    return null;
  }
}
