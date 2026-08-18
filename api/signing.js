import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { computeExpiresAt, isExpired, isTerminalStatus, documentTypeLabel } from '../src/lib/eSignature.js';

// signing_requests has zero client-facing RLS policies by design (same
// pattern as employee_portal_accounts) — the signer isn't a logged-in
// Compass user, so there's no session to scope RLS against. The security
// boundary here is entirely the unguessable sign_id (crypto.randomUUID(),
// generated server-side below) plus the checks below, not RLS — this
// endpoint must use the service-role key. A previous RLS cleanup pass
// dropped this table's "Allow all" policy believing it was unused, which
// silently broke every "send for signature" action (writes/reads started
// failing with 42501) until this was reworked to bypass RLS entirely via
// the service role, the way api/portal/* already does.
//
// Integrations & Workflow Automation (Phase 5, IP27, §21) — widened from
// meeting records only, pending/signed only, to outcome letters, agreed
// adjustments, and consultation records, with a real status lifecycle:
// sent -> opened -> signed/acknowledged/declined, or expired. A decline
// is recorded as a plain fact for HR to follow up on — never treated as
// evidence the document's content was wrong, and the only thing it
// triggers is the same manager-notification email every other outcome
// already sends.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { document, employeeName, managerName, managerEmail, meetingType, meetingDate, documentType, requiresSignature, signature, acknowledged, declined, declineReason, signedAt } = req.body;
    const signId = req.body.signId;

    try {
      if (signature || acknowledged || declined) {
        // The signer here is the external employee/manager, not a logged-in
        // Compass user — the unguessable sign_id is the auth boundary, by
        // design (see file comment). But the notification email content
        // must come from the stored request, not the anonymous POST body:
        // otherwise anyone holding one still-pending sign_id could forge
        // employeeName/managerName/documentType and have the server email an
        // arbitrary managerEmail from Compass's own verified sending domain.
        const existingRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
        const [existing] = await existingRes.json();
        if (!existing) return res.status(404).json({ error: 'Signing request not found' });
        if (isTerminalStatus(existing.status)) return res.status(409).json({ error: 'This document has already been actioned' });
        if (isExpired(existing.expires_at)) return res.status(409).json({ error: 'This signing link has expired' });

        const outcome = signature ? 'signed' : acknowledged ? 'acknowledged' : 'declined';
        const patch = outcome === 'declined'
          ? { status: 'declined', declined_at: signedAt, decline_reason: declineReason || '' }
          : { status: outcome, signature: signature || null, signed_at: signedAt };

        const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        const text = await r.text();
        if (!r.ok) return res.status(500).json({ error: text });

        // Notify manager if email provided — using the stored request's
        // fields, never the request body's.
        if (existing.manager_email) {
          const label = documentTypeLabel(existing.document_type);
          const outcomeText = outcome === 'signed' ? 'signed' : outcome === 'acknowledged' ? 'acknowledged' : 'declined to sign';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Compass HR <notifications@mail.compasshruk.com>',
              to: [existing.manager_email],
              subject: `${existing.employee_name} has ${outcomeText} the ${label.toLowerCase()}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                <h2 style="color:#7C5CFC">Compass HR</h2>
                <p>Dear ${esc(existing.manager_name)},</p>
                <p><strong>${esc(existing.employee_name)}</strong> has ${esc(outcomeText)} the <strong>${esc(label)}</strong>${existing.meeting_date ? ` from <strong>${esc(existing.meeting_date)}</strong>` : ''}.</p>
                ${outcome === 'declined' && declineReason ? `<p>Reason given: ${esc(declineReason)}</p>` : ''}
                <p>The outcome is now recorded in the case file in Compass.</p>
                <p style="color:#666;font-size:12px">Powered by Compass HR</p>
              </div>`
            })
          });
        }

        return res.status(200).json({ success: true, status: outcome });
      } else {
        // Create signing request — unlike signing itself, this is always
        // initiated by a logged-in HR user (App.jsx's sendDocumentForSignature),
        // so it can and should require a real session rather than being open
        // to anyone. The sign_id is also generated here, not trusted from
        // the client, since it's the entire access-control boundary for the
        // signature step above.
        const caller = await verifyCaller(req);
        if (!caller) return res.status(401).json({ error: 'Unauthorized' });

        const newSignId = crypto.randomUUID();
        const r = await supabaseRequest('signing_requests', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            sign_id: newSignId, document, employee_name: employeeName, manager_name: managerName, manager_email: managerEmail||'',
            meeting_type: meetingType, meeting_date: meetingDate,
            document_type: documentType || 'meeting_record',
            requires_signature: requiresSignature !== false,
            status: 'sent', expires_at: computeExpiresAt(), created_at: new Date().toISOString(),
          })
        });
        const text = await r.text();
        if (!r.ok) return res.status(500).json({ error: text });
        return res.status(200).json({ success: true, signId: newSignId });
      }
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const { signId } = req.query;
    try {
      const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
      const data = await r.json();
      if (!data.length) return res.status(404).json({ error: 'Not found' });
      let existing = data[0];

      // First real view of the link — stamp opened_at and move past
      // "sent", but only once, and never for a request already past that
      // stage (signed/acknowledged/declined/expired, or already opened).
      if (existing.status === 'sent') {
        const nowIso = new Date().toISOString();
        const patchBody = isExpired(existing.expires_at, new Date(nowIso))
          ? { status: 'expired' }
          : { status: 'opened', opened_at: nowIso };
        const patchRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}`, {
          method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(patchBody)
        });
        if (patchRes.ok) {
          const [updated] = await patchRes.json();
          if (updated) existing = updated;
        }
      } else if (existing.status === 'opened' && isExpired(existing.expires_at)) {
        const patchRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}`, {
          method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify({ status: 'expired' })
        });
        if (patchRes.ok) {
          const [updated] = await patchRes.json();
          if (updated) existing = updated;
        }
      }

      return res.status(200).json(existing);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
