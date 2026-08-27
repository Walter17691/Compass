import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Phase 7 (Controlled Beta Infrastructure Gate 3) — see api/_supabase.js
// for why this is now configurable via env var with a production fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';

export async function acceptInvite(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const inviteRes = await supabaseRequest(`employee_portal_invites?token=eq.${encodeURIComponent(token)}&select=*`);
    const invites = await inviteRes.json();
    const invite = invites[0];
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.accepted_at) return res.status(400).json({ error: 'This invite has already been used' });
    if (new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'This invite has expired' });

    // The signed-up account's email must match the invited email — otherwise
    // anyone who gets hold of the token (a forwarded email, a leaked link)
    // could sign up as any address and claim to be this employee. Look the
    // email up via the admin API rather than trusting a client-supplied
    // value, since the client isn't a source of truth for authorization.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    const userData = await userRes.json();
    const accountEmail = (userData.email || '').trim().toLowerCase();
    const invitedEmail = (invite.email || '').trim().toLowerCase();
    if (!userRes.ok || !accountEmail || accountEmail !== invitedEmail) {
      return res.status(403).json({ error: 'This invite was sent to a different email address. Please sign up using the email the invite was sent to.' });
    }

    const acceptRes = await supabaseRequest('employee_portal_accounts', {
      method: 'POST',
      body: JSON.stringify({
        org_id: invite.org_id,
        user_id: userId,
        employee_name: invite.employee_name,
        employee_email: invitedEmail || null,
      }),
    });
    if (!acceptRes.ok) {
      console.error('employee_portal_accounts insert failed:', await acceptRes.text());
      return res.status(500).json({ error: 'Failed to link your account — please contact HR' });
    }

    await supabaseRequest(`employee_portal_invites?id=eq.${invite.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accepted_at: new Date().toISOString() }),
    });

    res.status(200).json({ success: true, employeeName: invite.employee_name });
  } catch (e) {
    console.error('Portal accept-invite error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
