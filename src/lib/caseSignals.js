// Pure helpers for case signals — the shared substrate behind Next Best
// Action, Contradiction Detection, the Unanswered Question Tracker, and
// Procedural Guardrails (see supabase/case_signals_2026-08-10.sql). Same
// shape as allegations.js: a flat, cross-case-listable entity; the caller
// (App.jsx) owns persistence and which case is active.

export const SIGNAL_TYPES = [
  { id: "next_action", label: "Next best action", color: "#7C5CFC" },
  { id: "inconsistency", label: "Potential inconsistency", color: "#B87520" },
  { id: "unanswered_question", label: "Unanswered question", color: "#1C5AA0" },
  { id: "process_risk", label: "Procedural guardrail", color: "#C84B2F" },
];

export const SIGNAL_STATUSES = [
  { id: "open", label: "Open" },
  { id: "accepted", label: "Accepted" },
  { id: "dismissed", label: "Dismissed" },
  { id: "not_relevant", label: "Not relevant" },
  { id: "resolved", label: "Resolved" },
  { id: "explained", label: "Explained" },
];

const OPEN_STATUS = "open";
const RESOLVED_STATUSES = ["accepted", "dismissed", "not_relevant", "resolved", "explained"];

export function signalTypeMeta(type) {
  return SIGNAL_TYPES.find(t => t.id === type) || SIGNAL_TYPES[0];
}

export function signalsForCase(signals, caseId) {
  return (signals || []).filter(s => s.caseId === caseId);
}

export function openSignalsForCase(signals, caseId, type) {
  return signalsForCase(signals, caseId).filter(s => s.status === OPEN_STATUS && (!type || s.type === type));
}

// Phase 20 — Daily HR Command Centre's "Compass Recommendations" shortlist
// reads straight from this same open-signal substrate org-wide rather than
// a new AI call: every signal's title/reasoning was already AI-written
// when it was created (Next Best Action, Guardrails, etc.), so ranking and
// capping the existing ones is enough — no need to re-summarise on every
// Home page load. process_risk (a procedural risk already in motion)
// ranks above next_action (a suggestion) before falling back to recency,
// then capped by the caller to whatever the dashboard can show without
// overwhelming it.
const RECOMMENDATION_TYPE_PRIORITY = { process_risk: 0, next_action: 1 };

export function topOpenSignalsOrgWide(signals, types, limit = 5) {
  return (signals || [])
    .filter(s => s.status === OPEN_STATUS && (!types || types.includes(s.type)))
    .sort((a, b) => {
      const pa = RECOMMENDATION_TYPE_PRIORITY[a.type] ?? 99;
      const pb = RECOMMENDATION_TYPE_PRIORITY[b.type] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, limit);
}

export function createSignal(signals, caseId, fields) {
  const title = (fields?.title || "").trim();
  if (!title || !fields?.type) return signals;
  const signal = {
    id: "sig_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    caseId,
    type: fields.type,
    title,
    reasoning: fields.reasoning || "",
    status: OPEN_STATUS,
    sourceRefs: fields.sourceRefs || [],
    source: fields.source || "ai",
    createdBy: fields.createdBy || null,
    createdAt: new Date().toISOString(),
  };
  return [...(signals || []), signal];
}

export function updateSignal(signals, signalId, fields) {
  return (signals || []).map(s => s.id === signalId ? { ...s, ...fields } : s);
}

export function setSignalStatus(signals, signalId, status, resolvedBy, reason) {
  if (!SIGNAL_STATUSES.some(s => s.id === status)) return signals;
  return updateSignal(signals, signalId, {
    status,
    resolvedReason: reason || null,
    resolvedBy: RESOLVED_STATUSES.includes(status) ? (resolvedBy || null) : null,
    resolvedAt: RESOLVED_STATUSES.includes(status) ? new Date().toISOString() : null,
  });
}

// Marks any still-open signals of a given type on a case as superseded
// (resolved) — used when an AI pass regenerates a signal (e.g. Next Best
// Action re-running) so stale recommendations don't pile up alongside the
// fresh one.
export function supersedeOpenSignalsOfType(signals, caseId, type) {
  return (signals || []).map(s =>
    s.caseId === caseId && s.type === type && s.status === OPEN_STATUS
      ? { ...s, status: "resolved", resolvedReason: "Superseded by a newer recommendation", resolvedAt: new Date().toISOString() }
      : s
  );
}
