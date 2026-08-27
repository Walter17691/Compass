// Process Intelligence (Phase 3, P18, §15) — org-configurable ER process
// templates: a saved bundle of required documents, suggested meetings,
// default tasks, a linked policy category, suggested roles, and a target
// timescale, one per process type (P2's own registry, processStages.js).
// Deliberately a bundle over P2/P8/P9's existing vocabulary rather than a
// new one of its own — approvals stay P9's fixed, non-configurable list
// (a template doesn't change which outcome types require sign-off, only
// which process it applies to), and roles stay suggestions, not
// auto-assignment (assigning a role needs a specific person, which isn't
// something a template can decide on an org's behalf).
export function getTemplateForType(templates, processTypeId) {
  return (templates || []).find(t => t.process_type === processTypeId) || null;
}

// default_tasks entries are {name, owner, dayOffset} — dayOffset mirrors
// the exact convention TemplatesSection.jsx's onboarding/offboarding task
// editor already uses ("day offset from start/last day"), here counted
// from the case's own dateReceived/creation date instead.
// Phase 6.5 hardening (closes Prompt 11 audit finding 3.9, MEDIUM) — a
// date-only fromDateStr parses as UTC midnight, but setDate()/getDate()
// read and write LOCAL calendar fields. Whenever the added day range
// crosses a DST transition (UK clocks spring forward the last Sunday of
// March), the resulting local midnight, converted back to UTC by
// toISOString(), can land on the PREVIOUS UTC calendar day — reproduced
// directly: resolveDefaultTaskDueDate(5, "2026-03-25") returned
// "2026-03-29" instead of the correct "2026-03-30". Using the UTC-field
// variants throughout keeps the whole calculation in the same frame the
// string was parsed in, never touching local wall-clock time at all.
export function resolveDefaultTaskDueDate(dayOffset, fromDateStr) {
  if (dayOffset === null || dayOffset === undefined || dayOffset === "") return "";
  const from = fromDateStr ? new Date(fromDateStr) : new Date();
  if (isNaN(from)) return "";
  const due = new Date(from);
  due.setUTCDate(due.getUTCDate() + Number(dayOffset));
  return due.toISOString().split("T")[0];
}
