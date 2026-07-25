import { verifyCaller } from './_auth.js';

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgMemberId } = req.body;
  if (!orgMemberId) return res.status(400).json({ error: 'orgMemberId is required' });

  try {
    // Look up the caller's own membership/role, and the target row being
    // removed — never trust the client-supplied userId for the deletion
    // itself, only what's actually attached to this org_members row.
    const [callerRes, targetRes] = await Promise.all([
      supabaseRequest(`org_members?user_id=eq.${encodeURIComponent(caller.id)}&select=org_id,role`),
      supabaseRequest(`org_members?id=eq.${encodeURIComponent(orgMemberId)}&select=org_id,user_id`),
    ]);
    const [callerMember] = await callerRes.json();
    const [targetMember] = await targetRes.json();

    if (!callerMember || !targetMember) return res.status(404).json({ error: 'Member not found' });
    if (callerMember.org_id !== targetMember.org_id) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
      return res.status(403).json({ error: 'Only HR Directors and HR Managers can remove team members' });
    }

    await supabaseRequest(`org_members?id=eq.${encodeURIComponent(orgMemberId)}`, { method: 'DELETE' });

    if (targetMember.user_id) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetMember.user_id}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
