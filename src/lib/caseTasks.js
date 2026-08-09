// Pure helpers for case_tasks — same flat, cross-case-listable shape as
// allegations.js (see supabase/case_structure_2026-08-09.sql), not the
// nested {id, tasks:[...]} shape checklistTasks.js operates on. That
// nested shape fits onboarding/offboarding instances, where "tasks" are
// always read in the context of one instance; case_tasks needs its own
// cross-case Tasks screen (every open task across every case), which a
// flat table — and flat pure helpers over it — supports directly.

export const TASK_PRIORITIES = ["low", "normal", "high"];

export function tasksForCase(tasks, caseId) {
  return (tasks || []).filter(t => t.caseId === caseId);
}

export function addTask(tasks, caseId, fields) {
  const name = (fields?.name || "").trim();
  if (!name) return tasks;
  const task = {
    id: "task_" + Date.now(),
    caseId,
    name,
    owner: fields.owner || "",
    dueDate: fields.dueDate || "",
    priority: TASK_PRIORITIES.includes(fields.priority) ? fields.priority : "normal",
    status: "open",
    createdAt: new Date().toISOString(),
  };
  return [...(tasks || []), task];
}

export function updateTask(tasks, taskId, fields) {
  return (tasks || []).map(t => t.id === taskId ? { ...t, ...fields } : t);
}

export function toggleTaskDone(tasks, taskId) {
  return (tasks || []).map(t => t.id === taskId ? { ...t, status: t.status === "done" ? "open" : "done" } : t);
}

export function removeTask(tasks, taskId) {
  return (tasks || []).filter(t => t.id !== taskId);
}
