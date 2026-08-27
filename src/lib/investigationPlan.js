import { addTask } from './caseTasks.js';

// Manager Enablement (Phase 4, MP8, §9) — distinct from
// investigationChecklist.js's fixed 7-step generic checklist: this is an
// AI-generated, case-specific set of concrete actions (e.g. "Interview
// Priya Shah as a named witness"), grounded only in the allegations and
// evidence already on the case (App.jsx's generateInvestigationPlan
// builds the prompt from exactly that). Stored as ordinary case_tasks —
// same table, same Tasks tab, same toggle/delete — tagged with this
// source so it can be shown as its own section rather than mixed
// anonymously into the generic checklist or ad-hoc tasks.
export const INVESTIGATION_PLAN_SOURCE = "investigation_plan";
const MAX_PLAN_ITEMS = 8;

export function investigationPlanTasks(caseTasks, caseId) {
  return (caseTasks || []).filter(t => t.caseId === caseId && t.source === INVESTIGATION_PLAN_SOURCE);
}

// Validates/shapes the AI's raw JSON response — same discipline as
// concernTriage.js's sanitizeTriageSummary: never trust the model's
// output shape directly. Deduplicates by name (case-insensitive) and
// caps the count; a name-only item (no reasoning) is still valid.
export function sanitizeInvestigationPlanItems(parsed) {
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const items = [];
  for (const item of parsed) {
    const name = (item?.name || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, reasoning: (item?.reasoning || "").trim() });
    if (items.length >= MAX_PLAN_ITEMS) break;
  }
  return items;
}

// Idempotent, same shape as investigationChecklist.js's own
// seedInvestigationChecklist: skips any item whose name already exists
// as a task on this case (case-insensitive — an AI-generated item and a
// human-typed one shouldn't be treated as different just by casing).
// addTask now mints ids via crypto.randomUUID() (src/lib/ids.js),
// collision-proof even seeding several plan items in one synchronous
// pass — no per-item suffix workaround needed any more.
export function seedInvestigationPlanTasks(caseTasks, caseId, items) {
  const existingNames = new Set((caseTasks || []).filter(t => t.caseId === caseId).map(t => t.name.toLowerCase()));
  let updated = caseTasks || [];
  (items || []).forEach(item => {
    if (existingNames.has(item.name.toLowerCase())) return;
    updated = addTask(updated, caseId, { name: item.name, owner: "", priority: "normal", source: INVESTIGATION_PLAN_SOURCE });
  });
  return updated;
}
