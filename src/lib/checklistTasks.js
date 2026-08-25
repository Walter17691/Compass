// Pure task-mutation helpers shared by onboarding (starter_instances) and
// offboarding (leaver_instances) — both are the same shape (a person + a
// phased list of tasks with owner/due-date/notes), and this logic used to
// be hand-copied per flow. That's exactly how the two forks drifted before
// (offboarding gained exit-interview/reason handling that onboarding never
// got) — a bug fixed in one copy silently doesn't apply to the other. Each
// function takes the current instances array and returns a new one; the
// caller (App.jsx) still owns persistence (localStorage + Supabase) and
// which "active" instance is selected, since those differ per flow.
import { newId } from './ids';

export function toggleChecklistTask(instances, instanceId, taskId) {
  return instances.map(s => s.id === instanceId ? {
    ...s,
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString() } : t),
  } : s);
}

export function updateChecklistTaskNote(instances, instanceId, taskId, note) {
  return instances.map(s => s.id === instanceId ? {
    ...s,
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, note } : t),
  } : s);
}

export function addChecklistTask(instances, instanceId, phaseLabel, taskText, owner) {
  if (!taskText?.trim()) return instances;
  const newTask = {
    id: newId("manual"),
    task: taskText.trim(),
    owner: owner || "HR",
    phaseId: phaseLabel.toLowerCase().replace(/\s+/g, "_"),
    phaseLabel,
    dueDate: "",
    done: false,
    doneAt: null,
    note: "",
    source: "manual",
  };
  return instances.map(s => s.id === instanceId ? { ...s, tasks: [...s.tasks, newTask] } : s);
}

export function removeChecklistTask(instances, instanceId, taskId) {
  return instances.map(s => s.id === instanceId ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) } : s);
}

export function reassignChecklistTaskOwner(instances, instanceId, taskId, owner) {
  return instances.map(s => s.id === instanceId ? {
    ...s,
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, owner } : t),
  } : s);
}

export function updateChecklistInstanceFields(instances, instanceId, fields) {
  return instances.map(s => s.id === instanceId ? { ...s, ...fields } : s);
}
