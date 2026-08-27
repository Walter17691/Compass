import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { checkRateLimit } from './_rateLimit.js';
import { computeExpiresAt, isExpired, isTerminalStatus, isPastPublicViewWindow, documentTypeLabel } from '../src/lib/eSignature.js';

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
    const { document, employeeEmail, employeeName, managerName, managerEmail, meetingType, meetingDate, documentType, requiresSignature, signature, acknowledged, declined, declineReason, signedAt } = req.body;
    const signId = req.body.signId;

    try {
      if (signature || acknowledged || declined) {
        // Phase 6.5 hardening (security review) — this path has no session
        // to rate-limit by caller id (the signer is external, unauthenticated
        // by design), so it's keyed by the sign_id itself instead: caps
        // repeated actioning attempts against one specific request, the
        // realistic abuse shape for a public write endpoint, without
        // affecting any other signer's own link.
        if (signId) {
          const withinLimit = await checkRateLimit(`sign-action:${signId}`, 20, 300);
          if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });
        }
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
        // Phase 6.5 hardening (structural remediation, Prompt 12 —
        // Signature Identity invariant): the read above and this write
        // used to be two separate round trips with no re-check at write
        // time — a genuine TOCTOU window (e.g. the same link opened on a
        // phone and a laptop, signed on one and declined on the other a
        // moment later). Because a 'declined' patch never touches
        // signature/signed_at and a 'signed' patch never touches
        // declined_at/decline_reason, whichever request landed SECOND
        // silently produced a self-contradictory row — e.g.
        // status:'declined' while still carrying a captured signature and
        // signed_at from the request that landed first. Folding the
        // not-yet-terminal check into the UPDATE's own WHERE clause makes
        // the whole read-check-write sequence atomic under Postgres row
        // locking: only the request that genuinely observes the row still
        // pending can ever apply its patch, and a loser gets a real,
        // honest 409 instead of silently corrupting the record.
        const patch = outcome === 'declined'
          ? { status: 'declined', declined_at: signedAt, decline_reason: declineReason || '' }
          : { status: outcome, signature: signature || null, signed_at: signedAt };

        const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&status=in.(sent,opened)`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(patch)
        });
        if (!r.ok) { const text = await r.text(); return res.status(500).json({ error: text }); }
        const updatedRows = await r.json();
        if (!updatedRows.length) return res.status(409).json({ error: 'This document has already been actioned' });

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
        //
        // Phase 6.5 hardening (P0) — requireOrgMembership both verifies the
        // caller is real AND that they actually belong to the org they
        // claim this document is for, storing org_id on the new row so
        // api/portal/_signatures.js can later scope a portal user's own
        // "pending signature" list to their own org, not every org's.
        const { orgId } = req.body;
        const auth = await requireOrgMembership(req, res, orgId);
        if (!auth) return;

        const withinLimit = await checkRateLimit(`signing-create:${auth.caller.id}`, 20, 300);
        if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

        const newSignId = crypto.randomUUID();
        const r = await supabaseRequest('signing_requests', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            sign_id: newSignId, document, employee_email: employeeEmail||'', employee_name: employeeName, manager_name: managerName, manager_email: managerEmail||'',
            meeting_type: meetingType, meeting_date: meetingDate,
            document_type: documentType || 'meeting_record',
            requires_signature: requiresSignature !== false,
            org_id: orgId,
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
    const { signId, internal, orgId } = req.query;
    try {
      const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
      const data = await r.json();
      if (!data.length) return res.status(404).json({ error: 'Not found' });
      let existing = data[0];

      // Phase 6.5 hardening (structural remediation, Prompt 12 —
      // Signature Identity invariant): this GET is hit by two genuinely
      // different callers sharing one URL — the actual signer opening
      // their emailed link (public/sign.html), and Compass's own HR-side
      // internal status checks (App.jsx's signature-sync poll on every
      // case view, and resendSignatureReminder's lookup before chasing).
      // Only the FIRST is a genuine "the employee opened this document"
      // event; the transition below used to fire for both, meaning an HR
      // user simply viewing their own case could flip a still-pending
      // request to "opened" and stamp a real opened_at — a false record
      // of employee engagement that's directly disclosable (e.g. "the
      // audit trail shows they opened the outcome letter on 12 March")
      // when in fact HR's own dashboard produced it. internal=1 marks a
      // status-only read that must never mutate state; only a request
      // without it (the real signer-facing page) can advance sent→opened.
      // The expiry transition below is a pure fact about elapsed time,
      // not an engagement signal, so it's safe to apply on either kind of
      // read — an internal check should show a genuinely-expired link as
      // expired just as honestly as the signer's own page would.
      const isInternalStatusCheck = internal === '1';

      // Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM)
      // — internal=1 used to be a self-asserted query flag with no real
      // authentication behind it: anyone holding just the sign_id could
      // add it and get the exact same unrestricted, permanent read a
      // genuine HR session gets — it changed a write side-effect, not the
      // access boundary. It's now a real, org-scoped check. App.jsx's two
      // internal callers (the signature-sync poll on case view, and
      // resendSignatureReminder's lookup) already run inside an
      // authenticated HR session and already know org.id, so this is
      // additive there and closes the gap for everyone else.
      if (isInternalStatusCheck) {
        const auth = await requireOrgMembership(req, res, orgId);
        if (!auth) return;
        if (existing.org_id !== orgId) return res.status(403).json({ error: 'Not authorised for this signing request' });
      }

      // First real view of the link — stamp opened_at and move past
      // "sent", but only once, and never for a request already past that
      // stage (signed/acknowledged/declined/expired, or already opened),
      // and never from an internal HR-side status check.
      if (existing.status === 'sent' && !isInternalStatusCheck) {
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

      // Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM)
      // — the public link's sign_id was the only access control, with no
      // time bound: a forwarded or leaked email link kept disclosing the
      // full document text and captured signature image indefinitely. An
      // authenticated internal read (above) stays unrestricted, since
      // that's a real, auditable HR boundary — an anonymous read past a
      // generous window for the signer to revisit and download their own
      // copy now gets status only, not the underlying content.
      if (!isInternalStatusCheck && isTerminalStatus(existing.status) && isPastPublicViewWindow(existing)) {
        return res.status(200).json({ status: existing.status, restricted: true });
      }

      return res.status(200).json(existing);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
