// Manager Enablement (Phase 4, MP5, §3) — pure validation/shaping of the
// AI's raw triage-summary JSON before it's trusted anywhere in the app.
// Split out from the API-calling closure in App.jsx (same reasoning as
// every other src/lib/*.js pure helper here) so the one part of this
// feature that behaves the same regardless of what the model returns is
// actually unit-testable, not just exercised incidentally through a real
// AI call.
const VALID_URGENCY = ["LOW", "MEDIUM", "HIGH"];

export function sanitizeTriageSummary(parsed) {
  const p = parsed || {};
  return {
    aiCategory: typeof p.category === "string" ? p.category.trim() : "",
    aiSummary: typeof p.summary === "string" ? p.summary.trim() : "",
    aiWitnessesCount: Number.isFinite(p.witnessesCount) ? p.witnessesCount : null,
    aiEvidenceMentioned: Array.isArray(p.evidenceMentioned) ? p.evidenceMentioned.filter(x => typeof x === "string" && x.trim()) : [],
    aiImmediateAction: typeof p.immediateActionTaken === "string" ? p.immediateActionTaken.trim() : "",
    aiConsiderations: typeof p.considerations === "string" ? p.considerations.trim() : "",
    aiUrgency: VALID_URGENCY.includes(p.urgency) ? p.urgency : null,
  };
}
