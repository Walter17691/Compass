import { requireOrgRole } from '../_auth.js';
import { fetchAllPagesServer } from '../_paginatedFetch.js';
import { isHrRole } from '../../src/lib/roles.js';

// Phase 6.5 hardening (data-lifecycle review) — the DSAR compiler
// (src/lib/dsarCompile.js) covers every table the client can query
// directly under normal RLS, but several tables holding real personal
// data have no client-facing RLS path for an HR user reading about
// someone else (the same "service-role is the only access path" pattern
// this file's own siblings — _status.js, _accounts.js — document):
// signing_requests and employee_portal_accounts (zero policies at all —
// nothing but service role can read them), employee_portal_invites (same,
// zero policies), profiles (RLS is strictly `auth.uid() = id`, so even
// HR can never read a *different* user's own row), and case_views (RLS
// is strictly `user_id = auth.uid()`, same shape — App.jsx's own
// loadCaseViews only ever loads the signed-in user's own rows for
// exactly this reason). Without this, neither a DSAR compile nor the
// org-wide "Export all data" flow (App.jsx's exportAllData) had any
// query path to any of these tables — not "chose not to," genuinely
// couldn't see them — so all five silently omitted real categories of
// personal data Compass holds (closes independent audit finding 4.3's
// "tables never wired in at all" list, along with dsarCompile.js's own
// direct handling of the tables that ARE normally client-readable).
//
// profiles/case_views have no employee_name column (they're keyed by
// auth user id, not the free-text name every other DSAR-relevant table
// uses) — resolved via org_members, which the client can already read
// org-wide, but re-resolved here server-side so this endpoint is
// self-contained and the two lookups stay consistent with each other.
//
// employeeName is optional: given, this scopes to one DSAR subject
// (compileSubjectData's own use); omitted, it returns every row for the
// org (exportAllData's own use) — one endpoint serving both call shapes
// rather than a near-duplicate second one, since the only real
// difference is whether an extra filter is applied. HR-role-gated either
// way, same as _accounts.js's own admin-facing lookup. Lives here rather
// than as its own top-level api/*.js file — this project already
// consolidates routes into catch-alls to stay under Vercel's
// per-function deployment cap (see this catch-all's own header comment),
// and _accounts.js/_invite.js/_revoke-access.js already establish that
// this catch-all covers HR-admin actions, not only employee-facing ones.
export async function dsarLookup(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, employeeName } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const auth = await requireOrgRole(req, res, orgId, isHrRole);
  if (!auth) return;

  const nameFilter = employeeName ? `&employee_name=eq.${encodeURIComponent(employeeName)}` : '';
  // Phase 6.5 hardening (closes Prompt 16 audit finding H16, HIGH) —
  // signing_requests also names a manager_name signatory (the person who
  // chaired/approved the meeting, not the employee it's about). Matching
  // only employee_name meant a DSAR from that manager could never surface
  // their own signing_requests rows even though the document, their own
  // name, and their own signature/decline are just as much their
  // personal data. Its own filter, not a change to nameFilter above —
  // employee_portal_accounts/employee_portal_invites have no
  // manager_name column at all, so reusing nameFilter there would 400.
  const signingNameFilter = employeeName
    ? `&or=(employee_name.eq.${encodeURIComponent(employeeName)},manager_name.eq.${encodeURIComponent(employeeName)})`
    : '';

  try {
    // Phase 6.5 hardening (closes Prompt 11 audit finding 10.7, MEDIUM) —
    // every query below was a single, unpaginated request, silently
    // truncated at PostgREST's default row cap once an org's row count
    // crossed it — the exact same class of gap H3 already closed for 8
    // other org-wide loaders this session, and H8 confirmed live on this
    // very table (signing_requests). employeeName omitted is exactly the
    // org-wide exportAllData call shape this endpoint exists to serve, so
    // silent truncation here meant a "complete" GDPR export wasn't.
    const { data: signingRequests } = await fetchAllPagesServer(
      `signing_requests?org_id=eq.${encodeURIComponent(orgId)}${signingNameFilter}&select=sign_id,document,employee_name,employee_email,manager_name,manager_email,meeting_type,meeting_date,document_type,status,signature,signed_at,created_at,opened_at,expires_at,declined_at,decline_reason`
    );

    const { data: portalAccounts } = await fetchAllPagesServer(
      `employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}${nameFilter}&select=id,employee_name,employee_email,created_at`
    );

    const { data: portalInvites } = await fetchAllPagesServer(
      `employee_portal_invites?org_id=eq.${encodeURIComponent(orgId)}${nameFilter}&select=id,employee_name,email,created_by,expires_at,accepted_at,created_at`
    );

    // name here matches org_members' own column (a per-membership display
    // name), not employee_name — org_members doesn't use that convention.
    const memberNameFilter = employeeName ? `&name=eq.${encodeURIComponent(employeeName)}` : '';
    const { data: matchedMembers } = await fetchAllPagesServer(
      `org_members?org_id=eq.${encodeURIComponent(orgId)}${memberNameFilter}&select=user_id`
    );
    const userIds = matchedMembers.map(m => m.user_id).filter(Boolean);

    // Only resolve profiles/case_views when there's a real user id to
    // scope by (either matched-by-name, or every member's id for the
    // org-wide export call). Fetching all profiles unfiltered would leak
    // past the org boundary — profiles has no org_id column at all.
    let profiles = [];
    let caseViews = [];
    if (!employeeName || userIds.length > 0) {
      let scopeUserIds = userIds;
      if (!employeeName) {
        const { data: allMembers } = await fetchAllPagesServer(`org_members?org_id=eq.${encodeURIComponent(orgId)}&select=user_id`);
        scopeUserIds = allMembers.map(m => m.user_id).filter(Boolean);
      }
      if (scopeUserIds.length > 0) {
        const idList = scopeUserIds.map(id => encodeURIComponent(id)).join(',');
        const profilesRes = await fetchAllPagesServer(`profiles?id=in.(${idList})&select=id,name,role,company,created_at`);
        profiles = profilesRes.data;
        const viewsRes = await fetchAllPagesServer(`case_views?org_id=eq.${encodeURIComponent(orgId)}&user_id=in.(${idList})&select=case_id,user_id,last_viewed_at`);
        caseViews = viewsRes.data;
      }
    }

    res.status(200).json({ signingRequests, portalAccounts, portalInvites, profiles, caseViews });
  } catch (e) {
    console.error('dsar-lookup error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
