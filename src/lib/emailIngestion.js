// Phase 24 of the reasoning-layer build-out — Email integration
// groundwork. Real Outlook/Gmail integration needs OAuth app registration
// (Microsoft Entra / Google Cloud Console) that only the org owner can
// create, so this phase builds only the part that doesn't need it: a
// manual "paste an email" save-to-case flow, reusing Phase 7's document-
// extraction posture (AI reads the real content, produces a reviewable
// suggestion, nothing is written until the user confirms) and Phase 22's
// matchCaseByEmployeeName for the case-reference suggestion, rather than
// inventing a second case-matching implementation.
//
// Deliberately future-adapter-shaped: a pasted email and a webhook-
// delivered one (Microsoft Graph mail push, Gmail push via Cloud Pub/Sub)
// both reduce to the same three inputs — raw text content, an org, a
// user attributing the save — so a later adapter only needs to call
// buildEmailEvidenceItem with fields it parsed from the API payload
// instead of a textarea; it doesn't need a different pipeline or a new
// evidence shape. No new table for this — email content saved to a case
// is stored exactly like a witness statement already is (evidence.record,
// no dataUrl), see App.jsx's existing saveMeetingToCase.

// Browser-safe UTF-8 -> base64, matching what FileReader.readAsDataURL
// produces for a real text file upload — btoa alone throws on non-Latin1
// characters (an email pasted with a curly quote or an accented name is
// common enough that this isn't an edge case worth skipping).
function toBase64(text) {
  return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}

// Integrations & Workflow Automation (Phase 5, IP9) — recipients/
// attachmentsMentioned/employeesMentioned/caseReferences/datesMentioned
// are folded into the stored record text (not separate fields on the
// evidence item — evidence.record is the one place this app already
// reads a document's full content from) so they're genuinely preserved,
// not just shown transiently in SaveEmailScreen and then lost.
export function buildEmailEvidenceItem({ sender, subject, date, body, addedBy, recipients, attachmentsMentioned, employeesMentioned, caseReferences, datesMentioned }) {
  const lines = [
    sender ? `From: ${sender}` : null,
    recipients?.length ? `To: ${recipients.join(", ")}` : null,
    subject ? `Subject: ${subject}` : null,
    date ? `Date: ${date}` : null,
    employeesMentioned?.length ? `Employees mentioned: ${employeesMentioned.join(", ")}` : null,
    caseReferences?.length ? `Case references: ${caseReferences.join(", ")}` : null,
    datesMentioned?.length ? `Other dates mentioned: ${datesMentioned.join(", ")}` : null,
    attachmentsMentioned?.length ? `Attachments mentioned: ${attachmentsMentioned.join(", ")}` : null,
    "",
    body || "",
  ].filter(l => l !== null).join("\n");
  // type "text/plain" (a real MIME type, matching how a genuine file
  // upload's evidence.type already works — see evidenceUpload.js) rather
  // than the previous "Email" placeholder — that's what lets
  // canAnalyseEvidence (lib/documentIngestion.js) recognise this record
  // as something the AI document-analysis pipeline can actually read,
  // closing the gap IP11's email-to-evidence phase depends on.
  return {
    name: subject ? `Email: ${subject}` : "Pasted email",
    type: "text/plain",
    date: date || new Date().toLocaleDateString("en-GB"),
    addedBy: addedBy || "HR Manager",
    record: lines,
    dataUrl: `data:text/plain;base64,${toBase64(lines)}`,
    size: new Blob([lines]).size,
  };
}
