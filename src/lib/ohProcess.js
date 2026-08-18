// Integrations & Workflow Automation (Phase 5, IP22, §18) — the spec's
// full tracked occupational health process, expanding the single
// occupational_health STAGE (processStages.js's long-term-sickness flow)
// and its two flat date fields into a real step-by-step record. Compass
// tracks the process only — it never makes or implies a medical
// judgement; "recommendations" is HR's own record of what the OH report
// said and what HR decided, never Compass's interpretation of a report.

export const OH_PROCESS_STEPS = [
  { id: "concern_identified", label: "Concern identified" },
  { id: "consider_referral", label: "Referral considered" },
  { id: "consent", label: "Consent obtained" },
  { id: "prepare", label: "Referral prepared" },
  { id: "submit", label: "Referral submitted" },
  { id: "await_report", label: "Awaiting report" },
  { id: "received", label: "Report received" },
  { id: "hr_review", label: "HR review" },
  { id: "recommendations", label: "Recommendations recorded" },
  { id: "adjustments_considered", label: "Adjustments considered" },
  { id: "manager_discussion", label: "Manager discussion" },
  { id: "review_date", label: "Review date set" },
];

export function ohStepIndex(stepId) {
  return OH_PROCESS_STEPS.findIndex(s => s.id === stepId);
}

// "done" | "current" | "upcoming" — mirrors caseStage.js's own
// getCaseStage/withStageTransitionStamp shape (a single currentStep
// pointer plus a history of when each step was first reached) rather
// than a flat checklist, since these steps are strictly sequential. A
// process with no currentStep at all hasn't been rejected or skipped —
// it just hasn't started, so the first step reads "current" (there's
// always something actionable to show) rather than every step reading
// "upcoming" with nothing to act on.
export function ohStepStatus(ohProcess, stepId) {
  const target = ohStepIndex(stepId);
  if (target < 0) return "upcoming";
  const current = ohStepIndex(ohProcess?.currentStep);
  if (current < 0) return target === 0 ? "current" : "upcoming";
  if (target < current) return "done";
  if (target === current) return "current";
  return "upcoming";
}

// Advances to stepId, stamping the first time it's reached. Never
// rewinds an already-recorded history entry — same one-way-stamp
// convention as caseStage.js's withStageTransitionStamp.
export function advanceOhProcess(ohProcess, stepId, extra = {}) {
  const history = { ...(ohProcess?.history || {}) };
  if (!history[stepId]) history[stepId] = new Date().toISOString();
  return { ...(ohProcess || {}), ...extra, currentStep: stepId, history };
}

// The two flat case-level OH date fields (oh_referral_date/
// oh_report_received_date) predate this tracked process and
// deadlines.js's "OH report expected" chase logic already reads them
// directly — rather than duplicating that logic against the new
// structured history, submit/received keep mirroring into those same
// fields, only filling a blank one (never overwriting a date HR already
// entered by hand before this tracker existed).
const MIRRORED_DATE_FIELD = { submit: "ohReferralDate", received: "ohReportReceivedDate" };

export function applyOhStepTransition(cs, stepId, extra = {}) {
  const ohProcess = advanceOhProcess(cs.ohProcess, stepId, extra);
  const mirroredField = MIRRORED_DATE_FIELD[stepId];
  const mirrored = mirroredField && !cs[mirroredField] ? { [mirroredField]: ohProcess.history[stepId].split("T")[0] } : {};
  return { ...cs, ...mirrored, ohProcess };
}
