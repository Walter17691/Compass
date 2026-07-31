import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

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

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, employeeName } = req.body || {};
  if (!orgId || !employeeName) return res.status(400).json({ error: 'orgId and employeeName are required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
      return res.status(403).json({ error: 'Only HR Directors and HR Managers can revoke portal access' });
    }

    const delRes = await supabaseRequest(`employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}&employee_name=eq.${encodeURIComponent(employeeName)}`, { method: 'DELETE' });
    if (!delRes.ok) {
      console.error('revoke-access delete failed:', await delRes.text());
      return res.status(500).json({ error: 'Failed to revoke access' });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Portal revoke-access error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
