import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Lists which employees currently have Portal access, for the admin-facing
// "who has portal access" view — employee_portal_accounts has zero
// client-facing RLS by design (see supabase/employee_portal_2026-07-25.sql),
// so HR staff can't see this at all without a server endpoint, and until
// now there wasn't one.
export async function listAccounts(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const accRes = await supabaseRequest(`employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}&select=employee_name,created_at&order=employee_name.asc`);
    const accounts = await accRes.json();
    res.status(200).json({ accounts });
  } catch (e) {
    console.error('Portal list-accounts error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
