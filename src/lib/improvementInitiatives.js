// Organisational ER Intelligence (Phase 6, OP22, §18) — Improvement
// Initiatives. Pure helpers over milestones (a jsonb array on
// improvement_initiatives, see supabase/improvement_initiatives_2026-08-20.sql)
// — no separate table, since milestones only ever need to be read/written
// as a whole alongside their own initiative.

export const INITIATIVE_STATUSES = ["active", "completed", "abandoned"];

export function addMilestone(milestones, label, targetDate) {
  const trimmed = (label || "").trim();
  if (!trimmed) return milestones;
  const milestone = { id: "milestone_" + Date.now(), label: trimmed, targetDate: targetDate || "", done: false };
  return [...(milestones || []), milestone];
}

export function toggleMilestone(milestones, milestoneId) {
  return (milestones || []).map(m => m.id === milestoneId ? { ...m, done: !m.done } : m);
}

export function removeMilestone(milestones, milestoneId) {
  return (milestones || []).filter(m => m.id !== milestoneId);
}

export function milestoneProgress(milestones) {
  const list = milestones || [];
  const completed = list.filter(m => m.done).length;
  return { completed, total: list.length };
}

// Deliberately no percentage or single "on track" verdict — a raw
// completed/total count is honest about what's known; inferring
// schedule health from milestone count alone would fabricate precision
// the data doesn't support (same discipline as riskMap.js's own
// no-blended-score reasoning, OP16).
export function describeMilestoneProgress(milestones) {
  const { completed, total } = milestoneProgress(milestones);
  if (total === 0) return "No milestones set yet.";
  return `${completed} of ${total} milestone${total === 1 ? "" : "s"} complete.`;
}
