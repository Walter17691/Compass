import { supabaseRequest } from './_supabase.js';
import { requireOrgRole } from '../_auth.js';
import { isHrRole } from '../../src/lib/roles.js';

// Until now there was no way to remove someone's Employee Portal access,
// ever — not manually from Settings, not as part of offboarding. A
// dismissed or departed employee kept indefinite login access to their own
// case documents and signatures. This is the only place that deletes an
// employee_portal_accounts row; the account itself (auth.users) is left
// alone deliberately — revoking just cuts the org-scoped link the portal
// endpoints check, which is enough to lock them out of every case-list/
// case-detail/onboarding/signatures/status call, without the heavier and
// harder-to-undo step of deleting their whole Supabase Auth identity.
export async function revokeAccess(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, accountId } = req.body || {};
  if (!orgId || !accountId) return res.status(400).json({ error: 'orgId and accountId are required' });

  // Phase 6.5 hardening — this was already correct (the first endpoint
  // this whole check pattern was modelled on), just duplicated by hand;
  // now routed through the shared helper so this and every other portal
  // endpoint enforce the exact same membership+role logic from one place.
  const auth = await requireOrgRole(req, res, orgId, isHrRole);
  if (!auth) return;

  try {
    // Phase 6.5 hardening (closes Prompt 11 audit finding 2.9, MEDIUM) —
    // this used to match on employee_name, which is not unique: two
    // portal accounts sharing a name (in the same org, or matched
    // cross-tenant since the filter had no other disambiguator) could
    // mean the DELETE removed the wrong account, or several at once. It
    // also always reported {success:true} even when zero rows matched,
    // so a stale/mistyped name looked like a successful revoke while the
    // account kept full portal access. Now targets the account's own id
    // (its real primary key), still org-scoped as defense in depth, and
    // only reports success once a row was actually confirmed deleted.
    const delRes = await supabaseRequest(`employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=representation' },
    });
    if (!delRes.ok) {
      console.error('revoke-access delete failed:', await delRes.text());
      return res.status(500).json({ error: 'Failed to revoke access' });
    }
    const deleted = await delRes.json();
    if (!deleted.length) return res.status(404).json({ error: 'Portal account not found' });

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Portal revoke-access error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
