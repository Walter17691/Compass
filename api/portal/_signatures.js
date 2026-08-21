import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function signatures(req, res) {
  try {
    const caller = await verifyCaller(req);
    if (!caller) return res.status(401).json({ error: 'Unauthorized' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${caller.id}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    if (req.method === 'GET') {
      // Phase 6.5 hardening (P0) — was matched by employee_name alone
      // across the WHOLE platform, so a portal user at one org could see
      // (and, on the POST path below, forge a signature onto) another
      // org's pending documents purely by sharing a name with someone at
      // a different company. account.org_id scopes this to the caller's
      // own org; signing_requests_org_scope_2026-08-21.sql adds the
      // column this needs. Also fixes a stale status filter — the
      // e-signature status lifecycle widened to sent/opened/signed/
      // acknowledged/declined/expired (esignature_expansion_2026-08-18.sql,
      // api/signing.js), but this query was never updated off the old
      // pending/signed vocabulary, so it silently returned nothing for
      // any request created since that change.
      const pendingRes = await supabaseRequest(
        `signing_requests?org_id=eq.${encodeURIComponent(account.org_id)}&employee_name=eq.${encodeURIComponent(account.employee_name)}&status=in.(sent,opened)&select=sign_id,document,meeting_type,meeting_date,status`
      );
      const pending = await pendingRes.json();
      return res.status(200).json({ pending });
    }

    if (req.method === 'POST') {
      const { signId, signature } = req.body;
      if (!signId || !signature) return res.status(400).json({ error: 'signId and signature are required' });

      // Ownership check — the pending request must actually belong to
      // this portal account's org AND employee_name, not any sign_id the
      // caller happens to pass in. org_id is the load-bearing addition
      // here: employee_name alone previously let a same-named portal
      // user at a DIFFERENT org attach their own signature to this one's
      // document.
      const reqRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=org_id,employee_name,status`);
      const reqs = await reqRes.json();
      const existing = reqs[0];
      if (!existing || existing.org_id !== account.org_id || existing.employee_name !== account.employee_name) {
        return res.status(403).json({ error: 'You do not have access to this signature request' });
      }
      if (existing.status === 'signed' || existing.status === 'acknowledged' || existing.status === 'declined') return res.status(400).json({ error: 'Already signed' });

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
