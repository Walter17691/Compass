import { requireOrgRole } from '../_auth.js';
import { supabaseRequest } from './_supabase.js';
import { isHrRole } from '../../src/lib/roles.js';

// Phase 6.5 hardening (data-lifecycle review) — the DSAR compiler
// (src/lib/dsarCompile.js) covers every table the client can query
// directly under normal RLS, but two tables holding real personal data
// have zero client-facing RLS by design (the same "service-role is the
// only access path" pattern this file's own siblings — _status.js,
// _accounts.js — document): signing_requests (the actual signature and
// document text held on file) and employee_portal_accounts (who has
// portal login access, and to what email). Without this, neither a DSAR
// compile nor the org-wide "Export all data" flow (App.jsx's
// exportAllData) had any query path to either table at all — not "chose
// not to," genuinely couldn't see them — so both silently omitted two
// real categories of personal data Compass holds.
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

  try {
    const signingRes = await supabaseRequest(
      `signing_requests?org_id=eq.${encodeURIComponent(orgId)}${nameFilter}&select=sign_id,document,employee_name,employee_email,manager_name,manager_email,meeting_type,meeting_date,document_type,status,signature,signed_at,created_at,opened_at,expires_at,declined_at,decline_reason`
    );
    const signingRequests = signingRes.ok ? await signingRes.json() : [];

    const accountsRes = await supabaseRequest(
      `employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}${nameFilter}&select=id,employee_name,employee_email,created_at`
    );
    const portalAccounts = accountsRes.ok ? await accountsRes.json() : [];

    res.status(200).json({ signingRequests, portalAccounts });
  } catch (e) {
    console.error('dsar-lookup error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
