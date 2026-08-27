import { supabaseRequest } from './_supabase.js';
import { requireOrgRole } from '../_auth.js';
import { isHrRole } from '../../src/lib/roles.js';

// Lists which employees currently have Portal access, for the admin-facing
// "who has portal access" view — employee_portal_accounts has zero
// client-facing RLS by design (see supabase/employee_portal_2026-07-25.sql),
// so HR staff can't see this at all without a server endpoint, and until
// now there wasn't one.
export async function listAccounts(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  // Phase 6.5 hardening — this view is explicitly HR-admin-facing (see
  // comment above), but the check below it only verified org membership,
  // letting any non-HR member enumerate who has portal access org-wide.
  const auth = await requireOrgRole(req, res, orgId, isHrRole);
  if (!auth) return;

  try {
    // Phase 6.5 hardening (closes Prompt 11 audit finding 2.9, MEDIUM) —
    // id/employee_email added so revoke-access can target the exact row
    // instead of matching on employee_name, which is not unique.
    const accRes = await supabaseRequest(`employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}&select=id,employee_name,employee_email,created_at&order=employee_name.asc`);
    const accounts = await accRes.json();
    res.status(200).json({ accounts });
  } catch (e) {
    console.error('Portal list-accounts error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
