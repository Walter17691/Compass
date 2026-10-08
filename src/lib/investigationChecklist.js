import { addTask } from './caseTasks.js';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// The checklist itself is stored as ordinary case_tasks (Phase 3 of the
// original 13-phase project) rather than a new table — this is a
// deliberate reuse: the same tasks already show up on the cross-case
// Tasks screen and HR's normal Tasks tab with zero new plumbing, giving
// HR the "small progress-tracking panel" the plan asks for for free.
// Each step's name is fixed/stable text (not per-case-varied), matching
// the same dedup convention guardrails.js/caseSignals.js already use.
//
// ── `label` IS A PERSISTED KEY. `displayLabel` IS NOT. (IR-REPORT-01a) ──
//
// `label` is the case_task NAME. It is what seedInvestigationChecklist dedupes
// on, what stepFor() matches a task by, and what finalizeInvestigationSubmission
// looks up to tick "Submit findings to HR". Changing a `label` would orphan
// every existing seeded task on every live case, so these strings are frozen.
//
// `displayLabel` is optional on-screen wording only, read by nothing that
// matches or persists. It exists because an investigation may be opened on an
// incident or a concern before any allegation — or any individual — has been
// identified, and heading that work "Review the allegation(s)" asserts an
// accusation the record may not contain. Where it is absent the `label` is
// shown, exactly as before.
export const INVESTIGATION_CHECKLIST_STEPS = [
  { id: "review_allegations", label: "Review the allegation(s)", displayLabel: "Review the issue(s) under investigation" },
  { id: "review_evidence", label: "Review the evidence" },
  { id: "interview_witnesses", label: "Interview witnesses" },
  { id: "interview_employee", label: "Interview the employee" },
  { id: "review_questions", label: "Review outstanding questions" },
  { id: "complete_investigation", label: "Complete the investigation", displayLabel: "Record your findings and conclusion" },
  { id: "submit_findings", label: "Submit findings to HR" },
];

// Idempotent — only adds steps that don't already exist as a task on this
// case, so re-assigning (or re-granting) an investigator never spawns
// duplicates.
export function seedInvestigationChecklist(caseTasks, caseId, ownerName) {
  const existingNames = new Set((caseTasks || []).filter(t => t.caseId === caseId).map(t => t.name));
  let updated = caseTasks || [];
  INVESTIGATION_CHECKLIST_STEPS.forEach(step => {
    if (existingNames.has(step.label)) return;
    // addTask now mints ids via crypto.randomUUID() (src/lib/ids.js),
    // collision-proof even seeding all seven steps in one synchronous
    // loop — no per-step suffix workaround needed any more.
    updated = addTask(updated, caseId, { name: step.label, owner: ownerName || "", priority: "normal" });
  });
  return updated;
}

export function investigationChecklistTasks(caseTasks, caseId) {
  const names = new Set(INVESTIGATION_CHECKLIST_STEPS.map(s => s.label));
  return (caseTasks || []).filter(t => t.caseId === caseId && names.has(t.name));
}
