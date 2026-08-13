// Process Intelligence (Phase 3, P2) — a real, per-process-type stage
// registry. Before this, caseStage.js only ever inferred one of two
// shapes (disciplinary or grievance) — anything else (performance,
// attendance, redundancy, probation, flexible working — all genuine,
// already-selectable case types in the "+ New case" quick-create
// dropdown) silently fell through to the disciplinary shape with no
// dedicated stage tracking at all.
//
// This does NOT replace that inference — it documents the same shapes
// as real, reusable data (misconduct/grievance keep the exact stage ids
// they've always used, so nothing about existing cases changes) and adds
// genuinely new shapes for the three process types that had none:
// probation and flexible working (both already selectable but untracked
// in the regular case flow — note this is deliberately separate from
// DevelopScreen's own dedicated probation/appraisal/PDP flow, which
// stays exactly as it is), and long-term sickness (new, not previously
// selectable anywhere), using the spec's own worked stage list.
//
// Case types sharing the disciplinary shape today (capability, attendance,
// redundancy, appeal, other) get their own labelled registry entry rather
// than silently falling through — "what process are we following?" can
// now be answered by name for all of them, even where the stage sequence
// itself is still shared. Giving each of those its own distinct shape is
// a natural follow-up, not required to close the gap the audit found
// (no dedicated stage tracking at all for those types).

const DISCIPLINARY_STAGES = [
  { id: "intake", label: "Concern raised" },
  { id: "investigation", label: "Investigation" },
  { id: "inv_report", label: "Investigation review" },
  { id: "disciplinary", label: "Disciplinary hearing" },
  { id: "outcome", label: "Outcome" },
  { id: "appeal", label: "Appeal" },
  { id: "closed", label: "Closed" },
];

const GRIEVANCE_STAGES = [
  { id: "intake", label: "Grievance raised" },
  { id: "hearing", label: "Grievance meeting" },
  { id: "outcome", label: "Outcome" },
  { id: "appeal", label: "Appeal" },
  { id: "closed", label: "Closed" },
];

// Spec's own worked example (§1): Absence Identified -> Contact/Welfare
// -> Medical Evidence -> Occupational Health -> Adjustments Considered
// -> Review -> Capability Consideration -> Decision.
const LONG_TERM_SICKNESS_STAGES = [
  { id: "absence_identified", label: "Absence identified" },
  { id: "contact_welfare", label: "Contact / welfare" },
  { id: "medical_evidence", label: "Medical evidence" },
  { id: "occupational_health", label: "Occupational health" },
  { id: "adjustments_considered", label: "Adjustments considered" },
  { id: "review", label: "Review" },
  { id: "capability_consideration", label: "Capability consideration" },
  { id: "decision", label: "Decision" },
  { id: "closed", label: "Closed" },
];

const PROBATION_STAGES = [
  { id: "probation_started", label: "Probation started" },
  { id: "check_in", label: "Check-in" },
  { id: "concerns_raised", label: "Concerns raised" },
  { id: "extension_or_review", label: "Extension / review" },
  { id: "outcome", label: "Outcome" },
  { id: "closed", label: "Closed" },
];

const FLEXIBLE_WORKING_STAGES = [
  { id: "request_received", label: "Request received" },
  { id: "assessment", label: "Assessment" },
  { id: "decision_meeting", label: "Decision meeting" },
  { id: "decision", label: "Decision" },
  { id: "appeal", label: "Appeal" },
  { id: "closed", label: "Closed" },
];

// `matches` covers every raw cs.caseType string actually produced by
// either case-creation entry point today: IntakeScreen.jsx's 8-button
// picker (lowercased label ids) and the quick-create <select>'s looser
// 13-option list (App.jsx, lowercased free text) — the two have never
// shared one vocabulary (e.g. "attendance" vs "attendance/sickness"),
// so this normalizes both onto one canonical entry rather than adding a
// third, parallel one.
export const PROCESS_TYPES = [
  { id: "misconduct", label: "Misconduct", matches: ["misconduct", "disciplinary", "conduct concern", "investigation"], stages: DISCIPLINARY_STAGES },
  { id: "grievance", label: "Grievance", matches: ["grievance", "discrimination", "whistleblowing"], stages: GRIEVANCE_STAGES },
  { id: "appeal", label: "Appeal", matches: ["appeal"], stages: DISCIPLINARY_STAGES },
  { id: "capability", label: "Capability", matches: ["performance", "capability"], stages: DISCIPLINARY_STAGES },
  { id: "attendance", label: "Attendance", matches: ["attendance", "absence", "attendance/sickness"], stages: DISCIPLINARY_STAGES },
  { id: "long_term_sickness", label: "Long-term sickness", matches: ["long-term sickness", "long term sickness", "long_term_sickness"], stages: LONG_TERM_SICKNESS_STAGES },
  { id: "probation", label: "Probation", matches: ["probation"], stages: PROBATION_STAGES },
  { id: "flexible_working", label: "Flexible working", matches: ["flexible working", "flexible_working"], stages: FLEXIBLE_WORKING_STAGES },
  { id: "redundancy", label: "Redundancy consultation", matches: ["redundancy"], stages: DISCIPLINARY_STAGES },
  { id: "other", label: "Other", matches: ["other"], stages: DISCIPLINARY_STAGES },
];

const OTHER_PROCESS_TYPE = PROCESS_TYPES[PROCESS_TYPES.length - 1];

export function getProcessType(caseType) {
  const norm = (caseType || "").trim().toLowerCase();
  return PROCESS_TYPES.find(p => p.matches.includes(norm)) || OTHER_PROCESS_TYPE;
}

export function getStageDefinitions(caseType) {
  return getProcessType(caseType).stages;
}

export function stageLabel(caseType, stageId) {
  return getStageDefinitions(caseType).find(s => s.id === stageId)?.label || stageId;
}
