// Manager Enablement (Phase 4, MP12, §13) — "Escalate to HR". Pure
// string-building only (persistence stays in App.jsx's escalateToHr,
// which reuses the existing requestHrReview/hr_review_requests pipeline
// with step:"escalation" — a new, distinct step from ReviewScreen's own
// pre-existing step:"record" request, left untouched). The point is
// auto-attaching context the manager would otherwise have to type out
// themselves: stage, most recent meeting, how much evidence/allegation
// activity is on file, and any outstanding questions already flagged —
// their own note is appended last, not first, so HR reads the factual
// picture before the manager's framing of it.
export function buildEscalationContext({ employeeName, caseType, stageLabel, lastMeeting, allegationsCount = 0, evidenceCount = 0, openQuestionsCount = 0, note = "" }) {
  const lines = [];
  lines.push(`Case: ${employeeName}${caseType ? " (" + caseType + ")" : ""}`);
  if (stageLabel) lines.push(`Stage: ${stageLabel}`);
  lines.push(lastMeeting ? `Most recent meeting: ${lastMeeting.type} on ${lastMeeting.date}` : "No meetings recorded yet.");
  lines.push(`Allegations on file: ${allegationsCount}`);
  lines.push(`Evidence on file: ${evidenceCount}`);
  if (openQuestionsCount) lines.push(`Outstanding questions: ${openQuestionsCount}`);
  if ((note || "").trim()) lines.push("", "Note from the manager:", note.trim());
  return lines.join("\n");
}
