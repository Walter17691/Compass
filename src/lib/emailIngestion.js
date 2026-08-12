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

export function buildEmailEvidenceItem({ sender, subject, date, body, addedBy }) {
  const lines = [
    sender ? `From: ${sender}` : null,
    subject ? `Subject: ${subject}` : null,
    date ? `Date: ${date}` : null,
    "",
    body || "",
  ].filter(l => l !== null).join("\n");
  return {
    name: subject ? `Email: ${subject}` : "Pasted email",
    type: "Email",
    date: date || new Date().toLocaleDateString("en-GB"),
    addedBy: addedBy || "HR Manager",
    record: lines,
  };
}
