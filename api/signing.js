import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { checkRateLimit } from './_rateLimit.js';
import { computeExpiresAt, isExpired, isTerminalStatus, isParticipantResponse, isPastPublicViewWindow, documentTypeLabel } from '../src/lib/eSignature.js';
import { assessParticipantResponse, participantResponsePatch, ACTIONABLE_FILTER, RESPONSE_REFUSAL } from '../src/lib/participantResponse.js';
import { validateEmployeeResponse, validateResolution, resolutionPatch, challengesAccuracy, isResolved } from '../src/lib/employeeResponse.js';
import { publicSigningView, restrictedSigningView } from '../src/lib/publicSigningView.js';

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
    const { document, employeeEmail, employeeName, managerName, managerEmail, meetingType, meetingDate, documentType, requiresSignature, signature, acknowledged, declined, declineReason, disputed, participantComment, proceed, proceedReason, meetingId, responseType, proposedCorrection, resolveResponse, resolution, resolutionReason, resolutionAddendum } = req.body;
    const signId = req.body.signId;
    // NOTE: req.body.signedAt is deliberately NOT destructured. SIG-SEC-05 — the
    // holder of a signing link used to choose the evidential timestamp on their
    // own signature. Participant times are now server-derived in
    // participantResponsePatch, and a body value is ignored rather than trusted.

    try {
      if (signature || acknowledged || declined || disputed) {
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
        // Trust Slice 2A — ONE authority, shared with api/portal/_signatures.js.
        // These four conditions were inline here and only PARTLY inline there,
        // which is how the portal ended up able to sign a SUPERSEDED request
        // (SIG-SEC-01, HIGH). The refusal names no replacement token.
        const verdict = assessParticipantResponse(existing);
        if (!verdict.ok) {
          return res.status(verdict.httpStatus).json({
            error: verdict.error,
            ...(verdict.refusal === RESPONSE_REFUSAL.SUPERSEDED ? { superseded: true } : {}),
          });
        }

        // Pre-V1 Trust Slice — `disputed` joins the outcomes. It is a RESPONSE,
        // not agreement: the participant received the record and disagrees with
        // part of it. isConfirmedByParticipant() deliberately excludes it, so no
        // consumer can read a dispute as confirmation.
        const outcome = signature ? 'signed' : acknowledged ? 'acknowledged' : disputed ? 'disputed' : 'declined';
        // The participant's own words, available with ANY outcome — somebody who
        // signs can still note a correction, and previously the only way to say
        // anything at all was to refuse. Trimmed, length-capped, and stored
        // alongside the record; it never touches the manager's text.
        const commentText = typeof participantComment === 'string' ? participantComment.trim().slice(0, 5000) : '';
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
        // SIG-SEC-05 — the evidential timestamp is SERVER-derived. `signedAt`
        // arrived in this anonymous body, so the holder of a link chose the time
        // on their own signature and a backdated value was accepted without
        // question. The body value is now ignored entirely.
        // TRUST-SIG-03 — the accuracy classification is validated BEFORE the
        // write, so a malformed response is refused rather than half-recorded.
        // An unclassified response is permitted and stays NULL.
        const classification = validateEmployeeResponse({
          responseType, comment: commentText, proposedCorrection,
        });
        if (!classification.ok) return res.status(400).json({ error: classification.error });

        const patch = participantResponsePatch(outcome, {
          signature, declineReason, comment: commentText,
          responseType: classification.responseType, proposedCorrection,
        });
        // A dispute with no words is not a dispute anybody can act on.
        if (outcome === 'disputed' && !commentText) {
          return res.status(400).json({ error: 'Please say what you disagree with before submitting.' });
        }

        const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&${ACTIONABLE_FILTER}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(patch)
        });
        if (!r.ok) { const text = await r.text(); return res.status(500).json({ error: text }); }
        const updatedRows = await r.json();
        if (!updatedRows.length) return res.status(409).json({ error: 'This document has already been actioned' });

        // Notify manager if email provided — using the stored request's
        // fields, never the request body's.
        //
        // Phase 6.5 hardening (closes Prompt 11 audit finding 7.10,
        // MEDIUM) — this fetch had no try/catch of its own, so a Resend
        // failure (network error, outage, timeout) propagated straight
        // into the outer catch and returned a 500 — even though the
        // signature/decline PATCH just above had already committed
        // successfully. The signer would see their own genuinely-recorded
        // action reported back as a failure, and a caller that (unlike
        // sign.html's own fetch, which never checks response.ok) does
        // check the status code could treat an already-successful sign as
        // failed and retry needlessly. Isolated so a notification failure
        // is logged and swallowed, never turning a successful sign/
        // decline into an apparent one.
        if (existing.manager_email) {
          try {
            const label = documentTypeLabel(existing.document_type);
            const outcomeText = outcome === 'signed' ? 'signed' : outcome === 'acknowledged' ? 'acknowledged' : outcome === 'disputed' ? 'responded with comments on' : 'declined to sign';
            const notifyRes = await fetch('https://api.resend.com/emails', {
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
                  ${commentText ? `<p>They have added comments on the record. These are in the case file in Compass — they are not reproduced in this email, because they may refer to other people.</p>` : ''}
                  <p>The outcome is now recorded in the case file in Compass.</p>
                  <p style="color:#666;font-size:12px">Powered by Compass HR</p>
                </div>`
              })
            });
            if (!notifyRes.ok) console.error('Manager notification email failed:', await notifyRes.text());
          } catch (notifyErr) {
            console.error('Manager notification email error:', notifyErr.message);
          }
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
        // ── PROCEED AFTER REASONABLE OPPORTUNITY ──────────────────────────
        //
        // An explicit human decision, never a computed one. Compass may show how
        // long a request has been outstanding; it must not conclude that the
        // opportunity given was reasonable. That judgement, and the reason for
        // it, belong to a named person.
        //
        // AUTHORISATION AND PROVENANCE ARE BOTH SERVER-SIDE. This table has RLS
        // enabled with zero policies and is reached only under the service role,
        // so auth.uid() is NULL for every write and a database trigger could not
        // derive the actor. requireOrgMembership verifies the session AND that
        // the caller belongs to the org that owns this request; the actor and
        // timestamp are then taken from that verified session, never from the
        // request body. A client-supplied proceeded_by is ignored entirely.
        // ── TRUST-SIG-03 — THE EMPLOYER RESOLVES A CHALLENGE ──────────────
        //
        // A third artefact, recorded ALONGSIDE the record and the response. It
        // writes no change to `document`, `participant_comment` or
        // `proposed_correction`: neither side can make the other disappear.
        //
        // Normal authenticated case authority, with the actor and the time
        // derived from the verified session and the server clock — never from
        // this body. Same rule proceed-without-confirmation follows.
        if (resolveResponse) {
          const { orgId: resolveOrgId } = req.body;
          const resolveAuth = await requireOrgMembership(req, res, resolveOrgId);
          if (!resolveAuth) return;
          if (!signId) return res.status(400).json({ error: 'Which response are you resolving?' });
          const valid = validateResolution({ resolution, reason: resolutionReason, addendum: resolutionAddendum });
          if (!valid.ok) return res.status(400).json({ error: valid.error });

          const rowRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
          const [row] = await rowRes.json();
          if (!row) return res.status(404).json({ error: 'Signing request not found' });
          if (row.org_id !== resolveOrgId) return res.status(403).json({ error: 'Not authorised for this signing request' });
          // Only an actual challenge is reviewable. A plain comment needs no
          // adjudication, and inventing one would imply the employee disputed
          // something they did not.
          if (!challengesAccuracy(row)) {
            return res.status(409).json({ error: 'There is no disputed response on this record to resolve.' });
          }
          if (isResolved(row)) {
            return res.status(409).json({ error: 'This response has already been reviewed.', alreadyResolved: true });
          }

          // Conditional on still being unresolved, so two reviewers cannot both
          // record a conclusion.
          const patchRes = await supabaseRequest(
            `signing_requests?sign_id=eq.${encodeURIComponent(signId)}&response_resolution=is.null`, {
            method: 'PATCH', headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(resolutionPatch({
              resolution, reason: resolutionReason, addendum: resolutionAddendum,
              actorId: resolveAuth.user.id,
            })),
          });
          if (!patchRes.ok) return res.status(500).json({ error: await patchRes.text() });
          const [resolved] = await patchRes.json();
          if (!resolved) return res.status(409).json({ error: 'This response has already been reviewed.', alreadyResolved: true });
          // The four resolution fields the modal renders, and nothing else. Not
          // the whole row: response_resolved_by is an internal auth.users uuid
          // and the client already knows everything else it needs.
          return res.status(200).json({
            success: true,
            resolution: resolved.response_resolution,
            resolvedAt: resolved.response_resolved_at,
            request: {
              response_resolution: resolved.response_resolution,
              response_resolution_reason: resolved.response_resolution_reason,
              response_addendum: resolved.response_addendum,
              response_resolved_at: resolved.response_resolved_at,
            },
          });
        }

        if (proceed) {
          const { orgId: proceedOrgId } = req.body;
          const proceedAuth = await requireOrgMembership(req, res, proceedOrgId);
          if (!proceedAuth) return;
          if (!signId) return res.status(400).json({ error: 'Which request are you proceeding without?' });

          const reason = typeof proceedReason === 'string' ? proceedReason.trim() : '';
          if (!reason) return res.status(400).json({ error: 'Record why you are proceeding without confirmation.' });

          const existingRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
          const [existing] = await existingRes.json();
          if (!existing) return res.status(404).json({ error: 'Signing request not found' });
          if (existing.org_id !== proceedOrgId) return res.status(403).json({ error: 'Not authorised for this signing request' });

          // IDEMPOTENT. A replayed click returns the existing decision rather
          // than overwriting its actor, time or reason — the first decision is
          // the one that was made.
          if (existing.status === 'proceeded') {
            return res.status(200).json({ success: true, alreadyProceeded: true, proceededAt: existing.proceeded_at });
          }
          // A participant who has already responded cannot be proceeded past.
          // There is nothing to proceed without, and overwriting their response
          // would erase the very thing this slice exists to protect.
          if (isParticipantResponse(existing.status)) {
            return res.status(409).json({ error: 'This participant has already responded — there is nothing to proceed without.' });
          }

          const nowIso = new Date().toISOString();
          const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&status=in.(sent,opened,expired,pending)`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({
              status: 'proceeded',
              proceeded_at: nowIso,
              proceeded_by: proceedAuth.caller.id,
              proceed_reason: reason.slice(0, 2000),
              proceeded_from_status: existing.status,
            })
          });
          if (!r.ok) { const text = await r.text(); return res.status(500).json({ error: text }); }
          const rows = await r.json();
          if (!rows.length) return res.status(409).json({ error: 'This request changed while you were deciding — reload and try again.' });
          return res.status(200).json({
            success: true, proceededAt: nowIso, proceededFromStatus: existing.status,
          });
        }

        const { orgId } = req.body;
        const auth = await requireOrgMembership(req, res, orgId);
        if (!auth) return;

        const withinLimit = await checkRateLimit(`signing-create:${auth.caller.id}`, 20, 300);
        if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

        const newSignId = crypto.randomUUID();

        // ── SUPERSEDE FIRST, THEN INSERT ──────────────────────────────────
        //
        // Order matters and is not arbitrary. signing_requests carries a partial
        // unique index over (meeting_id) where superseded_at is null, so there
        // can only ever be ONE current request per document. Inserting the
        // successor before retiring the predecessor would violate it.
        //
        // Scoped by org_id, which requireOrgMembership has already verified, so
        // a caller cannot retire another tenant's requests. meeting_id comes from
        // the payload but is only ever used INSIDE that org filter. The actor and
        // timestamp are server-derived; the body is not consulted for either.
        //
        // Idempotent by construction: a replayed re-issue matches no
        // not-yet-superseded row the second time.
        if (meetingId) {
          const supersededAt = new Date().toISOString();
          const supersedeRes = await supabaseRequest(
            `signing_requests?meeting_id=eq.${encodeURIComponent(meetingId)}&org_id=eq.${encodeURIComponent(orgId)}&superseded_at=is.null`,
            {
              method: 'PATCH',
              headers: { 'Prefer': 'return=representation' },
              body: JSON.stringify({
                superseded_at: supersededAt,
                superseded_by_sign_id: newSignId,
                superseded_by: auth.caller.id,
              })
            }
          );
          if (!supersedeRes.ok) {
            const text = await supersedeRes.text();
            return res.status(500).json({ error: `Could not retire the previous request: ${text}` });
          }
        }

        const r = await supabaseRequest('signing_requests', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            sign_id: newSignId, document, employee_email: employeeEmail||'', employee_name: employeeName, manager_name: managerName, manager_email: managerEmail||'',
            meeting_type: meetingType, meeting_date: meetingDate,
            document_type: documentType || 'meeting_record',
            requires_signature: requiresSignature !== false,
            org_id: orgId,
            meeting_id: meetingId || null,
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
    const { signId, internal, orgId, meetingId } = req.query;
    try {
      // ── THE REQUEST CHAIN FOR ONE DOCUMENT ──────────────────────────────
      //
      // Authenticated and org-scoped, like internal=1 — and metadata ONLY. No
      // document text, no signature image, no participant comment, and no
      // superseded_by_sign_id. A caller that wants a specific snapshot asks for
      // it by sign_id through the existing path, which applies the same checks.
      //
      // Exists so the manager UI can say "current request, and one previous"
      // without the client having to hold a list of tokens.
      if (meetingId && internal === '1') {
        const auth = await requireOrgMembership(req, res, orgId);
        if (!auth) return;
        const chainRes = await supabaseRequest(
          `signing_requests?meeting_id=eq.${encodeURIComponent(meetingId)}&org_id=eq.${encodeURIComponent(orgId)}`
          + `&select=sign_id,status,document_type,created_at,opened_at,signed_at,declined_at,expires_at,superseded_at,proceeded_at,proceeded_from_status`
          + `&order=created_at.desc`
        );
        if (!chainRes.ok) return res.status(500).json({ error: await chainRes.text() });
        const rows = await chainRes.json();
        return res.status(200).json({
          requests: rows,
          current: rows.find(r => !r.superseded_at) || null,
          superseded: rows.filter(r => r.superseded_at),
        });
      }

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
        return res.status(200).json(restrictedSigningView(existing));
      }

      // superseded_by_sign_id IS the successor's signing token. An authenticated
      // org member may see it (they can already reach every request in their
      // org); an anonymous link holder must never, or an old email would become
      // a route to the current document.
      if (!isInternalStatusCheck) {
        // SIG-SEC-03 — an explicit ALLOW-LIST, built UP from what
        // public/sign.html actually reads. Spreading the row and deleting two
        // keys sent org_id, manager_email, meeting_id, proceeded_by (an internal
        // auth.users id) and proceed_reason (the manager's own reasoning for
        // proceeding WITHOUT this person) to the link holder — and made every
        // future column public by default. Four were added in the two slices
        // before this one.
        return res.status(200).json(publicSigningView(existing));
      }
      return res.status(200).json(existing);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
