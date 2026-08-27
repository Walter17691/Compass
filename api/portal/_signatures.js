import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { isExpired } from '../../src/lib/eSignature.js';

function normEmail(e) {
  return (e || '').trim().toLowerCase();
}

export async function signatures(req, res) {
  try {
    const caller = await verifyCaller(req);
    if (!caller) return res.status(401).json({ error: 'Unauthorized' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${caller.id}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    // Phase 6.5 hardening (P0, security review) — employee_name is not a
    // real ownership boundary: two employees can share a name, in the
    // same org or a different one. org_id closes the cross-tenant leak;
    // requiring a matching employee_email (rather than employee_name)
    // closes the same-org name-collision leak too — signing_requests and
    // employee_portal_accounts both carry employee_email specifically
    // for this disambiguation (automation_levels_2026-08-18.sql /
    // add_employee_email_to_portal_accounts). A portal account with no
    // email on file (shouldn't happen via the normal invite flow, which
    // requires one — see _accept-invite.js) can't be disambiguated at
    // all, so this fails closed rather than falling back to name-only
    // matching.
    const accountEmail = normEmail(account.employee_email);

    if (req.method === 'GET') {
      if (!accountEmail) return res.status(200).json({ pending: [] });
      const pendingRes = await supabaseRequest(
        `signing_requests?org_id=eq.${encodeURIComponent(account.org_id)}&employee_email=eq.${encodeURIComponent(accountEmail)}&status=in.(sent,opened)&select=sign_id,document,meeting_type,meeting_date,status`
      );
      const pending = await pendingRes.json();
      return res.status(200).json({ pending });
    }

    if (req.method === 'POST') {
      const { signId, signature } = req.body;
      if (!signId || !signature) return res.status(400).json({ error: 'signId and signature are required' });
      if (!accountEmail) return res.status(403).json({ error: 'You do not have access to this signature request' });

      // Ownership check — the pending request must actually belong to
      // this portal account's org AND employee_email, not any sign_id the
      // caller happens to pass in. Both org_id and employee_email must be
      // present and matching — a missing email on either side fails
      // closed (403), never falls through to a permissive match.
      const reqRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=org_id,employee_email,status,expires_at`);
      const reqs = await reqRes.json();
      const existing = reqs[0];
      const existingEmail = normEmail(existing?.employee_email);
      if (!existing || !existingEmail || existing.org_id !== account.org_id || existingEmail !== accountEmail) {
        return res.status(403).json({ error: 'You do not have access to this signature request' });
      }
      if (existing.status === 'signed' || existing.status === 'acknowledged' || existing.status === 'declined') return res.status(400).json({ error: 'Already signed' });
      // Phase 6.5 hardening (closes Prompt 11 audit finding 2.8, MEDIUM) —
      // unlike api/signing.js's own POST handler, this path never checked
      // expires_at at all, so a portal user could sign a document well
      // past its 7-day expiry window, silently bypassing the same
      // freshness guarantee every other signing path enforces.
      if (isExpired(existing.expires_at)) return res.status(400).json({ error: 'This signing request has expired' });

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
