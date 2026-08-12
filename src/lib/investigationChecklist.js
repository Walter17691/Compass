import { addTask } from './caseTasks';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// The checklist itself is stored as ordinary case_tasks (Phase 3 of the
// original 13-phase project) rather than a new table — this is a
// deliberate reuse: the same tasks already show up on the cross-case
// Tasks screen and HR's normal Tasks tab with zero new plumbing, giving
// HR the "small progress-tracking panel" the plan asks for for free.
// Each step's name is fixed/stable text (not per-case-varied), matching
// the same dedup convention guardrails.js/caseSignals.js already use.
export const INVESTIGATION_CHECKLIST_STEPS = [
  { id: "review_allegations", label: "Review the allegation(s)" },
  { id: "review_evidence", label: "Review the evidence" },
  { id: "interview_witnesses", label: "Interview witnesses" },
  { id: "interview_employee", label: "Interview the employee" },
  { id: "review_questions", label: "Review outstanding questions" },
  { id: "complete_investigation", label: "Complete the investigation" },
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
    const withNewTask = addTask(updated, caseId, { name: step.label, owner: ownerName || "", priority: "normal" });
    // addTask ids are Date.now()-based — seeding all seven steps in one
    // synchronous loop can call it within the same millisecond, so two
    // steps would collide on id and then toggle together. Appending the
    // step's own stable id guarantees uniqueness here without touching
    // addTask's shared id scheme (fine for its other, non-batch callers).
    const newTask = withNewTask[withNewTask.length - 1];
    updated = [...withNewTask.slice(0, -1), { ...newTask, id: newTask.id + "_" + step.id }];
  });
  return updated;
}

export function investigationChecklistTasks(caseTasks, caseId) {
  const names = new Set(INVESTIGATION_CHECKLIST_STEPS.map(s => s.label));
  return (caseTasks || []).filter(t => t.caseId === caseId && names.has(t.name));
}
