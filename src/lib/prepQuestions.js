// Pure helpers for a meeting's editable pre-meeting question list (Meeting
// Intelligence Phase 2, M1/M2). Session-local, same lifecycle as
// prepNotes — not persisted to Supabase on their own; a question object is:
// {id, text, category, essential, reasoning, linkedAllegationId, linkedEvidenceId, source, status, statusSource}.
// source is "ai" (from generatePrepQuestions) or "user" (manually added).
// linkedEvidenceId is keyed by the evidence item's own stable id (Phase
// 6.5 hardening, P0, Cluster 8) — was linkedEvidenceIndex (array
// position), which a delete elsewhere on the case's evidence could
// silently repoint at the wrong item.
// status is one of QUESTION_STATUSES below; statusSource tracks whether
// the live AI pass or the user themselves set it — updateMeetingIntelligence
// (App.jsx) never overwrites a status the user set manually.

export const QUESTION_STATUSES = [
  { id: "not_asked", label: "Not asked", symbol: "○", color: "#9B9098" },
  { id: "asked", label: "Asked", symbol: "◐", color: "#B87520" },
  { id: "answered", label: "Answered", symbol: "●", color: "#1A7A4A" },
  { id: "partially_answered", label: "Partially answered", symbol: "◑", color: "#B87520" },
  { id: "no_longer_relevant", label: "No longer relevant", symbol: "–", color: "#C4BAB0" },
];

export function questionStatusMeta(status) {
  return QUESTION_STATUSES.find(s => s.id === status) || QUESTION_STATUSES[0];
}

export function addPrepQuestion(questions) {
  return [...(questions || []), {
    id: "pq_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    text: "", category: "general", essential: false, reasoning: "",
    linkedAllegationId: null, linkedEvidenceId: null, source: "user",
    status: "not_asked", statusSource: "ai",
  }];
}

export function updatePrepQuestionText(questions, id, text) {
  return (questions || []).map(q => q.id === id ? { ...q, text } : q);
}

export function removePrepQuestion(questions, id) {
  return (questions || []).filter(q => q.id !== id);
}

// direction: -1 to move up, +1 to move down. Returns the same array
// reference if the move would go out of bounds.
export function movePrepQuestion(questions, id, direction) {
  const qs = questions || [];
  const idx = qs.findIndex(q => q.id === id);
  const newIdx = idx + direction;
  if (idx < 0 || newIdx < 0 || newIdx >= qs.length) return qs;
  const copy = [...qs];
  [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
  return copy;
}

export function togglePrepQuestionEssential(questions, id) {
  return (questions || []).map(q => q.id === id ? { ...q, essential: !q.essential } : q);
}

export function linkPrepQuestionToAllegation(questions, id, allegationId) {
  return (questions || []).map(q => q.id === id ? { ...q, linkedAllegationId: allegationId || null } : q);
}

export function linkPrepQuestionToEvidence(questions, id, evidenceId) {
  const value = evidenceId === "" || evidenceId === null || evidenceId === undefined ? null : evidenceId;
  return (questions || []).map(q => q.id === id ? { ...q, linkedEvidenceId: value } : q);
}

// source: "user" for a manual override (RecordScreen's status picker) or
// "ai" for the live meeting-intelligence pass. A question whose current
// statusSource is "user" is excluded from the AI's tracking prompt
// entirely (see App.jsx's updateMeetingIntelligence), so this function
// itself doesn't need to guard against being overwritten — by the time
// an "ai" update reaches here, the caller already only asked the AI about
// questions that were still AI-owned.
export function setPrepQuestionStatus(questions, id, status, source) {
  if (!QUESTION_STATUSES.some(s => s.id === status)) return questions;
  return (questions || []).map(q => q.id === id ? { ...q, status, statusSource: source } : q);
}
