import { newId } from './ids.js';

// Integrations & Workflow Automation (Phase 5, IP13, §7) — send-from-
// Compass coordinated workflow. Draft -> HR Review -> Approve already
// exist unchanged (lib/letterApproval.js); Send already exists unchanged
// (api/send-letter.js, a working Resend-backed endpoint with a review
// modal that had no trigger button wired to it — this phase wires it up
// and adds the four steps that never ran automatically once a send
// actually succeeded: Save Sent Copy, Add Timeline Event, Update Task,
// Record Audit Event, App.jsx's own audit()).
//
// Shared with src/components/caseTabs/DocumentsTab.jsx (IP12's "Draft:"
// button labels) so the exact-string task-match below (App.jsx's
// sendLetterCoordinated) stays honest: it only ever completes a task
// whose name matches one of these real, product-surfaced labels
// verbatim — never a fuzzy/AI guess at intent.
// Human UAT remediation, Batch 2, Part 13 (adjacent finding) — invite/
// appeal/suspension were still missing from this map, so a genuine
// disciplinary/appeal hearing invitation sent via sendLetterCoordinated
// still hit the fallback below and went out with a subject line calling
// it "... Outcome Letter", was recorded to evidence/Timeline as the
// generic "Sent: Letter" (indistinguishable from any other sent letter),
// and could never auto-complete a matching task — exactly the same class
// of bug this comment's own history already fixed once for witness-
// invitation, just never generalised to these three. Deliberately NOT
// adding "outcome" — its existing fallback below already correctly
// names it, and every existing test asserting that fallback (e.g.
// buildLetterSubject's own "Disciplinary Outcome Letter - ...") must
// keep passing unchanged. Labels match LetterScreen.jsx's own LETTER_TYPES
// picker text (the actual product-surfaced names), not a new vocabulary.
export const CORRESPONDENCE_TYPE_LABELS = {
  "witness-invitation": "Witness invitation",
  "evidence-request": "Evidence request",
  "oh-consent-request": "OH consent request",
  "invite": "Invitation",
  "appeal": "Appeal outcome",
  "suspension": "Suspension",
};

function toBase64(text) {
  return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}

// The actual email subject a letter is sent with — shared by the send
// itself (App.jsx's sendLetterCoordinated) and reply-matching below, so
// the two can never drift out of sync. Previously hard-coded to "...
// Outcome Letter - ..." for every type (a pre-existing bug this phase's
// own reply-matching need surfaced — a witness invitation was going out
// with a subject line calling it an "Outcome Letter").
export function buildLetterSubject({ type, meetingType, employeeName }) {
  const label = CORRESPONDENCE_TYPE_LABELS[type];
  if (label) return `${label} - ${employeeName || "Employee"}`;
  return `${meetingType || "Meeting"} Outcome Letter - ${employeeName || "Employee"}`;
}

// Same text/plain + dataUrl shape as buildEmailEvidenceItem
// (lib/emailIngestion.js) — for the same reason: a saved sent-letter
// copy should be just as reachable by the document-AI pipeline
// (canAnalyseEvidence) as any other evidence on the case, not a second-
// class record. source:"sent_letter" is this item's own equivalent of
// emailIngestion's source:"email" marker — lib/caseTimeline.js reads it
// to give a sent letter its own dedicated timeline entry. subject and
// recipient are kept as their own fields (not just folded into the
// record text) so matchReplyToSentLetters below can compare against
// them directly rather than re-parsing free text.
// signId: optional — only set when this letter went out through
// sendDocumentForSignature (App.jsx's sendLetterForAcknowledgement, IP27)
// rather than a plain Resend email (sendLetterCoordinated, IP13). Same
// signId/signStatus field names meetings already use, so the same
// widened-status badge logic (lib/eSignature.js) and Communications view
// (IP31) can read either kind of sent item the same way.
export function buildSentLetterEvidenceItem({ type, subject, recipient, body, addedBy, signId }) {
  const label = CORRESPONDENCE_TYPE_LABELS[type] || "Letter";
  const lines = [
    `Sent to: ${recipient}`,
    `Subject: ${subject}`,
    "",
    body || "",
  ].join("\n");
  return {
    // Phase 6.5 hardening (structural remediation, Prompt 12 — Task/
    // Entity Identity invariant) — see emailIngestion.js's own
    // buildEmailEvidenceItem comment for why this needs a real id rather
    // than relying on array position.
    id: newId("ev"),
    name: `Sent: ${label}`,
    type: "text/plain",
    date: new Date().toLocaleDateString("en-GB"),
    addedBy: addedBy || "HR Manager",
    record: lines,
    dataUrl: `data:text/plain;base64,${toBase64(lines)}`,
    size: new Blob([lines]).size,
    source: "sent_letter",
    subject,
    recipient,
    ...(signId ? { signId, signStatus: "sent" } : {}),
  };
}

// Pure — the one open case task (if any) this send should mark done.
// Deliberately an exact, case-insensitive name match against the real
// product-surfaced correspondence label, not a fuzzy heuristic: if HR
// (or the Command Bar, IP6) created a task literally called "Evidence
// request" and this send is that same type, completing it is a safe,
// grounded inference; anything less exact risks completing the wrong
// task.
export function findTaskToCompleteForSentLetter(caseTasks, caseId, letterType) {
  const label = CORRESPONDENCE_TYPE_LABELS[letterType];
  if (!label) return null;
  return (caseTasks || []).find(t =>
    t.caseId === caseId && t.status !== "done" && t.name?.trim().toLowerCase() === label.toLowerCase()
  ) || null;
}

function stripReplyPrefixes(subject) {
  let s = (subject || "").trim();
  // Handles "Re: Re: Fwd: ..." — a real reply chain accumulates these,
  // so one pass isn't enough.
  let changed = true;
  while (changed) {
    changed = false;
    const next = s.replace(/^(re|fw|fwd)\s*:\s*/i, "");
    if (next !== s) { s = next.trim(); changed = true; }
  }
  return s;
}

// Integrations & Workflow Automation (Phase 5, IP14, §8) — reply
// capture. Real Microsoft Graph message threading (conversationId)
// would only work for mail actually sent through the user's own
// connected Outlook mailbox — IP13's send-from-Compass goes via Resend
// (api/send-letter.js), a separate mail system Graph has no visibility
// into, so conversationId can never bridge the two. Subject + recipient
// matching works regardless of which system the original went out
// through, which is what makes this deterministic and testable rather
// than another AI guess.
export function matchReplyToSentLetters(message, sentLetterItems) {
  const incomingSubject = stripReplyPrefixes(message?.subject).toLowerCase();
  const incomingFrom = (message?.from || "").trim().toLowerCase();
  if (!incomingSubject || !incomingFrom) return null;

  const candidates = (sentLetterItems || []).filter(item => {
    const itemSubject = (item.subject || "").trim().toLowerCase();
    const itemRecipient = (item.recipient || "").trim().toLowerCase();
    if (!itemSubject || itemRecipient !== incomingFrom) return false;
    return incomingSubject === itemSubject || incomingSubject.includes(itemSubject) || itemSubject.includes(incomingSubject);
  });
  if (!candidates.length) return null;
  // Most recently sent match — a case could plausibly have sent the same
  // correspondence type to the same person twice (e.g. two separate
  // evidence requests over the life of a case).
  return candidates.reduce((latest, item) => new Date(item.date) > new Date(latest.date) ? item : latest);
}
