import { supabaseRequest } from './_supabase.js';
import { canSeeAllOrgCases } from '../src/lib/roles.js';
import { approvalActionForOutcome } from '../src/lib/approvals.js';

// Phase 7 (Controlled Beta Infrastructure Gate 3) — see api/_supabase.js
// for why this is now configurable via env var with a production fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
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

// Phase 6.5 hardening (closes Prompt 16 audit finding C2, CRITICAL) —
// api/send-letter.js and api/send-for-signature.js used to check org
// membership alone before delivering an arbitrary, caller-supplied
// letter under Compass's own verified sending domain: no case, no role,
// no relationship to what was actually being sent. This is the shared
// boundary those endpoints now require instead — the same access a case
// is actually visible under (mirrors the live cases SELECT RLS policy):
// an oversight role (HR/legal/auditor), the case's own creator/owner, or
// any case_access grant, not just "some member of this org." Case
// existence/org match is checked server-side via the service-role key —
// never trust a client-supplied org/case pairing.
// caseId is optional here on purpose: a brand-new case doesn't exist yet
// at the point a meeting record is first sent for signature
// (saveMeetingToCase is what finds-or-creates it, and that happens
// AFTER this call for a fresh case — see sendForSignature's own
// comment) — falling back to the plain org-membership check preserves
// that legitimate flow. Callers that need the stronger guarantee (an
// outcome letter, which can only ever exist for a real, already-saved
// case) enforce caseId being present themselves before calling this.
export async function requireCaseAccess(req, res, orgId, caseId) {
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return null;
  if (!caseId) return auth;
  try {
    const caseRes = await supabaseRequest(`cases?id=eq.${encodeURIComponent(caseId)}&select=id,org_id,created_by,owner_id,outcome`);
    const [cs] = await caseRes.json();
    if (!cs || cs.org_id !== orgId) { res.status(404).json({ error: 'Case not found' }); return null; }
    if (canSeeAllOrgCases(auth.role) || cs.created_by === auth.caller.id || cs.owner_id === auth.caller.id) {
      return { ...auth, case: cs };
    }
    const accessRes = await supabaseRequest(`case_access?case_id=eq.${encodeURIComponent(caseId)}&user_id=eq.${encodeURIComponent(auth.caller.id)}&select=role`);
    const accessRows = await accessRes.json();
    if (accessRows.length > 0) return { ...auth, case: cs, caseRole: accessRows[0].role };
    res.status(403).json({ error: 'You do not have access to this case' });
    return null;
  } catch (e) {
    console.error('requireCaseAccess error:', e.message);
    res.status(500).json({ error: 'Could not verify case access' });
    return null;
  }
}

// Phase 6.5 hardening (closes Prompt 16 audit finding C2) — the second
// half of the same fix: even a caller with real case access shouldn't be
// able to deliver an outcome letter for an approval-gated outcome type
// (suspension/final written warning/dismissal — src/lib/approvals.js's
// APPROVAL_ACTIONS) before HR has actually approved it. Mirrors
// OutcomeModal.jsx's own requestHrReview call: step is the approval
// action id, status is the same 'pending'/'approved'/'rejected'
// vocabulary hr_review_requests has always used. Returns true (nothing
// to gate) for outcome types that were never approval-gated to begin
// with, e.g. "No further action".
//
// Phase 6.5 hardening (closes Prompt 16 audit finding H10, HIGH) — a
// falsy outcomeType (never recorded — cases.outcome defaults to "") used
// to fall through the "not approval-gated, nothing to check" branch
// exactly the same as a genuinely-decided, genuinely-non-gated outcome
// like "No further action". That's backwards for a letter explicitly
// typed "outcome": CaseViewScreen's Copilot "Draft outcome letter"
// action (and the Letter editor's own "Outcome letter" tab, reachable
// directly any time a case's Letter screen is open) can produce a full
// AI-drafted dismissal/warning letter WITHOUT ever calling
// OutcomeModal's finalizeOutcome — the only code path that sets
// cases.outcome — so the case's real outcome stays empty right up to
// the point of sending. An empty outcome is never legitimate grounds to
// send something labelled an outcome communication, approval-gated or
// not; this is the one case where "nothing recorded yet" must fail
// closed, not open.
export async function verifyOutcomeApproved(caseId, outcomeType) {
  if (!outcomeType) return false;
  const action = approvalActionForOutcome(outcomeType);
  if (!action) return true;
  const reviewRes = await supabaseRequest(`hr_review_requests?case_id=eq.${encodeURIComponent(caseId)}&step=eq.${encodeURIComponent(action)}&status=eq.approved&select=id&limit=1`);
  const rows = await reviewRes.json();
  return rows.length > 0;
}
