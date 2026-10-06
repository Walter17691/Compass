import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { assessParticipantResponse, participantResponsePatch, ACTIONABLE_FILTER, RESPONSE_REFUSAL } from '../../src/lib/participantResponse.js';

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
      // superseded_at is now selected — SIG-SEC-01. Without it this path could
      // not even see that a request had been replaced.
      const reqRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=org_id,employee_email,status,expires_at,superseded_at`);
      const reqs = await reqRes.json();
      const existing = reqs[0];
      const existingEmail = normEmail(existing?.employee_email);
      // Tenancy and recipient binding FIRST, so a caller who has no business
      // with this request learns nothing about its lifecycle state.
      if (!existing || !existingEmail || existing.org_id !== account.org_id || existingEmail !== accountEmail) {
        return res.status(403).json({ error: 'You do not have access to this signature request' });
      }

      // ── SIG-SEC-01 / SIG-SEC-02 — PARITY WITH THE EMAILED-LINK PATH ──────
      //
      // This path used to reject only signed | acknowledged | declined. It did
      // NOT check superseded_at, so Slice 1b's invariant — "an older request
      // stayed live and SIGNABLE, and because the client polls only
      // meetings[].signId that signature would never appear in Compass" — was
      // still open through the portal. `disputed` and `proceeded` were not
      // rejected either, so a disputed record could be re-signed.
      //
      // assessParticipantResponse is the SAME function api/signing.js calls, so
      // the two paths cannot drift again.
      const verdict = assessParticipantResponse(existing);
      if (!verdict.ok) {
        return res.status(verdict.httpStatus).json({
          error: verdict.error,
          ...(verdict.refusal === RESPONSE_REFUSAL.SUPERSEDED ? { superseded: true } : {}),
        });
      }

      // SIG-SEC-02 — the actionable test is folded into the UPDATE's own WHERE,
      // exactly as the emailed-link path does it. Previously this read then
      // wrote with nothing in between, so two competing responses could both
      // succeed and leave a self-contradictory row. Postgres row locking now
      // means only the request that genuinely observes the row awaiting a
      // response can apply its patch; the loser gets an honest 409.
      //
      // The patch itself comes from the shared builder, so a portal signature
      // and an emailed-link signature are byte-identical in shape and both are
      // server-timed (SIG-SEC-05).
      const updateRes = await supabaseRequest(
        `signing_requests?sign_id=eq.${encodeURIComponent(signId)}&${ACTIONABLE_FILTER}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(participantResponsePatch('signed', { signature })),
      });
      if (!updateRes.ok) {
        console.error('signing_requests update failed:', await updateRes.text());
        return res.status(500).json({ error: 'Failed to save signature' });
      }
      const updatedRows = await updateRes.json();
      if (!updatedRows.length) {
        return res.status(409).json({ error: 'This document has already been actioned' });
      }
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Portal signatures error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
