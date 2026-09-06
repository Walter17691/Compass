import { supabaseRequest } from './_supabase.js';
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

// Commercial-readiness audit remediation (2026-09) — requireCaseAccess
// used to re-derive "can this caller touch this case" as a hand-rolled
// JS predicate (canSeeAllOrgCases(role) OR created_by OR owner_id OR
// case_access). That predicate silently drifted from cases' own live
// RLS stack in two ways, both confirmed against production pg_policies:
// (1) CONFIDENTIALITY — canSeeAllOrgCases() includes hr_manager, but
//     cases' own RESTRICTIVE confidentiality policy ("Confidential
//     cases restricted to authorised staff") gates on the narrower
//     has_confidential_case_oversight() (hr_director/legal_reviewer/
//     auditor only) — so an hr_manager with no creator/case_access
//     relationship to a confidential case passed this check, but could
//     not actually SELECT the case row under RLS. owner_id alone was
//     also treated as sufficient here, but owner_id is not one of that
//     policy's exemption terms at all.
// (2) LOCATION — this function never checked location, but cases' own
//     PERMISSIVE policy ("Users can access cases in their org or
//     assigned to them") requires can_access_case_location() OR an
//     explicit case_access row; a location_manager's own created_by
//     case, at a location they've since lost access to, passed here
//     but would not be SELECT-visible under RLS either.
// FIX: stop re-deriving the predicate in JS. Ask Postgres, as the
// caller, whether the case is visible — the exact question RLS exists
// to answer, and the same query the client's own supabase-js call would
// run. This makes cases' live RLS stack (tenant boundary, location,
// confidentiality, creator/owner/case_access) the single authoritative
// source for every one of those dimensions, with nothing duplicated
// here to drift again, and any future RLS hardening applies for free.
// A separate, narrow, NON-authorizing service-role existence/tenant
// check runs first purely to preserve the pre-existing 404 ("no such
// case in this org") vs 403 ("case exists, you're just not authorised
// on it") distinction — it never contributes to the access decision
// itself, which is made exclusively by the caller-scoped query below.
async function callerCaseVisible(req, caseId, select) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cases?id=eq.${encodeURIComponent(caseId)}&select=${select}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : undefined;
}

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
    const existsRes = await supabaseRequest(`cases?id=eq.${encodeURIComponent(caseId)}&select=id,org_id`);
    const [exists] = await existsRes.json();
    if (!exists || exists.org_id !== orgId) { res.status(404).json({ error: 'Case not found' }); return null; }

    const cs = await callerCaseVisible(req, caseId, 'id,outcome');
    if (!cs) { res.status(403).json({ error: 'You do not have access to this case' }); return null; }

    // Non-authorizing enrichment only, run after access is already
    // proven above — surfaces the caller's own case_access role, if
    // any. Nothing downstream depends on this; it's informational.
    const accessRes = await supabaseRequest(`case_access?case_id=eq.${encodeURIComponent(caseId)}&user_id=eq.${encodeURIComponent(auth.caller.id)}&select=role`);
    const accessRows = await accessRes.json();
    const caseRole = accessRows[0]?.role;

    return { ...auth, case: cs, ...(caseRole ? { caseRole } : {}) };
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
