import { supabaseRequest } from './_supabase.js';

export async function signatures(req, res) {
  try {
    const accountUserId = req.method === 'GET' ? req.query.userId : req.body.userId;
    if (!accountUserId) return res.status(400).json({ error: 'userId is required' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${accountUserId}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    if (req.method === 'GET') {
      const pendingRes = await supabaseRequest(
        `signing_requests?employee_name=eq.${encodeURIComponent(account.employee_name)}&status=eq.pending&select=sign_id,document,meeting_type,meeting_date,status`
      );
      const pending = await pendingRes.json();
      return res.status(200).json({ pending });
    }

    if (req.method === 'POST') {
      const { signId, signature } = req.body;
      if (!signId || !signature) return res.status(400).json({ error: 'signId and signature are required' });

      // Ownership check — the pending request must actually belong to
      // this portal account's employee_name, not any sign_id the caller
      // happens to pass in.
      const reqRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=employee_name,status`);
      const reqs = await reqRes.json();
      const existing = reqs[0];
      if (!existing || existing.employee_name !== account.employee_name) {
        return res.status(403).json({ error: 'You do not have access to this signature request' });
      }
      if (existing.status === 'signed') return res.status(400).json({ error: 'Already signed' });

      const updateRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ signature, status: 'signed', signed_at: new Date().toISOString() }),
      });
      if (!updateRes.ok) {
        console.error('signing_requests update failed:', await updateRes.text());
        return res.status(500).json({ error: 'Failed to save signature' });
      }
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Portal signatures error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
