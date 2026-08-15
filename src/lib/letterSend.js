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
export const CORRESPONDENCE_TYPE_LABELS = {
  "witness-invitation": "Witness invitation",
  "evidence-request": "Evidence request",
  "oh-consent-request": "OH consent request",
};

function toBase64(text) {
  return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}

// Same text/plain + dataUrl shape as buildEmailEvidenceItem
// (lib/emailIngestion.js) — for the same reason: a saved sent-letter
// copy should be just as reachable by the document-AI pipeline
// (canAnalyseEvidence) as any other evidence on the case, not a second-
// class record. source:"sent_letter" is this item's own equivalent of
// emailIngestion's source:"email" marker — lib/caseTimeline.js reads it
// to give a sent letter its own dedicated timeline entry.
export function buildSentLetterEvidenceItem({ type, recipient, body, addedBy }) {
  const label = CORRESPONDENCE_TYPE_LABELS[type] || "Letter";
  const lines = [
    `Sent to: ${recipient}`,
    "",
    body || "",
  ].join("\n");
  return {
    name: `Sent: ${label}`,
    type: "text/plain",
    date: new Date().toLocaleDateString("en-GB"),
    addedBy: addedBy || "HR Manager",
    record: lines,
    dataUrl: `data:text/plain;base64,${toBase64(lines)}`,
    size: new Blob([lines]).size,
    source: "sent_letter",
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
