import { requireCaseAccess, verifyOutcomeApproved } from './_auth.js';
import { checkRateLimit } from './_rateLimit.js';
import { escapeHtml as esc } from './_html.js';

// Human UAT remediation, Batch 2, Part 11 — the non-meeting-record
// branch below used to unconditionally say "the outcome letter"
// regardless of letterType, so a disciplinary/appeal hearing invitation
// email misdescribed itself as an outcome letter. Mirrors
// LetterScreen.jsx's own lTypes map for the same three types it already
// distinguishes when building the subject line client-side.
const LETTER_KIND_LABEL = {
  outcome: 'the outcome letter',
  invite: 'the invitation letter',
  appeal: 'the appeal outcome letter',
  suspension: 'the suspension letter',
};

// Phase 6.5 hardening (P0) — previously verified only that SOME real
// Supabase session was calling (any authenticated identity on the whole
// project, including an employee portal account, not just this org's own
// staff), with no org-membership check and no rate limit, sending from
// Compass's own verified domain with a caller-controlled recipient/
// subject/body. requireOrgMembership closed the "any authenticated
// identity" gap; the rate limit caps abuse even from a legitimate but
// compromised account, the same pattern api/chat.js already uses.
//
// Phase 6.5 hardening (Prompt 16 audit, closes finding C2, CRITICAL) —
// requireOrgMembership alone still let ANY member of the org — not just
// someone with a real relationship to the specific case a letter was
// about — send it, with no check on whether an approval-gated outcome
// had actually been approved. Chained with C1 (now closed), this meant
// a "notetaker" case_access grant was enough to both set a case's
// outcome to Dismissal AND deliver a fabricated dismissal letter, with
// zero HR sign-off. requireCaseAccess closes the first half;
// verifyOutcomeApproved closes the second, specifically for outcome
// letters — letterType is the same category LetterScreen.jsx's own
// activeLetter state already tracks client-side (outcome/invite/appeal/
// suspension/...), now threaded through so the server can tell an
// outcome letter apart from routine case correspondence rather than
// gating every letter type as if it carried the same weight.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, body, orgId, caseId, letterType, employeeName, meetingType, managerName, date, documentType, recipientName, personalMessage, attachments, attachmentNames } = req.body;

  // An outcome letter can only ever exist for a real, already-saved case
  // (OutcomeModal sets cases.outcome on an existing row) — unlike other
  // letter types, there's no legitimate "case doesn't exist yet" path
  // for this one, so caseId is mandatory here specifically.
  if (letterType === 'outcome' && !caseId) {
    return res.status(400).json({ error: 'caseId is required for an outcome letter' });
  }

  const auth = await requireCaseAccess(req, res, orgId, caseId);
  if (!auth) return;

  if (letterType === 'outcome') {
    const approved = await verifyOutcomeApproved(caseId, auth.case.outcome);
    if (!approved) {
      const message = auth.case.outcome
        ? "This outcome requires HR sign-off before its letter can be sent — it hasn't been approved yet."
        : "This case has no recorded outcome yet — record the outcome before sending an outcome letter.";
      return res.status(403).json({ error: message });
    }
  }

  const withinLimit = await checkRateLimit(`send-letter:${auth.caller.id}`, 20, 300);
  if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

  // Phase 6.5 hardening (Prompt 14, Section 7 — closes independent audit
  // finding 2.3, remaining half) — the P0 fix above closed "any
  // authenticated identity, not just this org's own staff"; this closes
  // "arbitrary recipient with zero validation at all". `to` staying
  // caller-chosen is deliberate — HR legitimately shares case
  // correspondence with external parties (solicitors, occupational
  // health, the employee's personal email) that Compass has no record
  // of, so this can't be restricted to a known-employee allow-list
  // without breaking that. What was genuinely missing is confirming `to`
  // is even a well-formed email address before Compass's own verified
  // sending domain relays arbitrary content to it.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof to !== 'string' || !EMAIL_RE.test(to)) {
    return res.status(400).json({ error: 'A valid recipient email address is required' });
  }

  // Human UAT remediation, Batch 2, Part 5 — "never 'Dear ,' with an
  // empty name" enforced server-side too, not just by the client
  // disabling its own Send button, since this is the endpoint that
  // actually builds and sends the email.
  if (documentType === 'meeting_record' && !String(recipientName || '').trim()) {
    return res.status(400).json({ error: 'A recipient name is required' });
  }

  // Human UAT remediation, Batch 2, Part 11 — a disciplinary/appeal
  // hearing invitation had no way to actually carry the case evidence
  // the employee is entitled to see before the hearing; App.jsx's
  // sendLetterCoordinated forwards HR's selection (from the case's own
  // existing evidence, never a second store) as real Resend attachments.
  const resendAttachments = Array.isArray(attachments)
    ? attachments.filter(a => a && a.filename && a.content).map(a => ({ filename: String(a.filename), content: String(a.content) }))
    : [];

  // Human UAT remediation, Batch 2 hardening — the UAT requirement was a
  // genuine attachment, not just an honest "nothing is attached"
  // message. shareRecord (App.jsx) always generates and sends the
  // meeting-record PDF as a real attachment before calling this endpoint
  // — if that ever comes through empty (a client-side PDF generation
  // failure, a caller bypassing the normal UI), this must fail loudly,
  // not silently send an email that looks successful but never carried
  // the document it claims to.
  const isMeetingRecordShare = documentType === 'meeting_record';
  if (isMeetingRecordShare && resendAttachments.length === 0) {
    return res.status(400).json({ error: 'The meeting record document is missing — nothing was sent' });
  }

  // Human UAT remediation, Batch 2, Part 5/6 hardening — "Share meeting
  // record" now always carries the record as a real PDF attachment
  // (validated above), so the body stays a short, professional message
  // that names the attachment rather than repeating its full contents.
  const html = isMeetingRecordShare
    ? `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#7C5CFC">Compass HR</h2>
            <p>Dear ${esc(recipientName)},</p>
            <p>${esc(managerName)} has shared the ${esc(meetingType)} meeting record${employeeName ? ` for ${esc(employeeName)}` : ''}${date ? ` dated ${esc(date)}` : ''} with you — please see the attached document${attachmentNames?.length ? ` (${attachmentNames.map(n => esc(n)).join(', ')})` : ''}.</p>
            ${personalMessage ? `<div style="background:#f5f3ff;border-left:4px solid #7C5CFC;padding:12px 16px;margin:16px 0;font-size:14px;line-height:1.6">${esc(personalMessage)}</div>` : ''}
            <p style="color:#666;font-size:12px">Sent via Compass HR. If you have any questions please contact ${esc(managerName)}.</p>
          </div>
        `
    : `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#7C5CFC">Compass HR</h2>
            <p>Dear ${esc(employeeName)},</p>
            <p>Please find ${LETTER_KIND_LABEL[letterType] || 'the letter'} from your recent <strong>${esc(meetingType)}</strong> on <strong>${esc(date)}</strong>${attachmentNames?.length ? '' : ' below'}.</p>
            <div style="background:#f9f9f9;border-left:4px solid #7C5CFC;padding:16px;margin:20px 0;font-family:Georgia,serif;white-space:pre-wrap;font-size:14px;line-height:1.8">${esc(body)}</div>
            ${attachmentNames?.length ? `<p style="font-size:13px;color:#333"><strong>Attached:</strong> ${attachmentNames.map(n => esc(n)).join(', ')}</p>` : ''}
            <p style="color:#666;font-size:12px">This letter was generated by Compass HR. If you have any questions please contact ${esc(managerName)}.</p>
          </div>
        `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <notifications@mail.compasshruk.com>',
        to: [to],
        subject: subject || (isMeetingRecordShare ? `${meetingType} Record - ${employeeName}` : `${meetingType} Outcome Letter - ${employeeName}`),
        html,
        ...(resendAttachments.length ? { attachments: resendAttachments } : {}),
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send');
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
