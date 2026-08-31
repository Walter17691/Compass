// Pure helpers for case signals — the shared substrate behind Next Best
// Action, Contradiction Detection, the Unanswered Question Tracker, and
// Procedural Guardrails (see supabase/case_signals_2026-08-10.sql). Same
// shape as allegations.js: a flat, cross-case-listable entity; the caller
// (App.jsx) owns persistence and which case is active.
import { newId } from './ids.js';

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
    id: newId("sig"),
    caseId,
    type: fields.type,
    title,
    reasoning: fields.reasoning || "",
    status: OPEN_STATUS,
    sourceRefs: fields.sourceRefs || [],
    source: fields.source || "ai",
    createdBy: fields.createdBy || null,
    createdAt: new Date().toISOString(),
    // Phase 6.5 hardening (Prompt 14, guardrail lifecycle redesign) — the
    // stable rule identifier a check's own logic is about (e.g.
    // "decision_reasoning_missing"), distinct from `title`'s presentation
    // text. Only guardrail-generated signals set this; every other
    // signal source (Next Best Action, Contradiction Detection, Appeal
    // ground) leaves it null, same as before this field existed. This is
    // the real identity case_signals_open_rule_unique (DB) enforces —
    // title is not a safe identity (it's copy, and two different rules
    // could coincidentally share wording).
    ruleId: fields.ruleId || null,
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

// Human UAT remediation, Batch 1, Issue 6 — "Still to explore" questions
// marked Resolved/Not relevant could reappear once Compass re-generated
// the list, because generateUnansweredQuestions (App.jsx) only ever
// checked currently-OPEN signals before creating fresh ones: a
// previously-decided signal (status resolved/not_relevant) simply isn't
// "open" any more, so it was invisible to the dedup check, and a fresh
// AI pass had nothing to compare its newly-worded question against.
//
// Re-audited on human review round 2 for whether a stronger, non-text
// identity actually exists here — the same re-examination inconsistency
// detection's own meeting-id-pair identity already got. It doesn't, in
// the sense of an existing DB row this question is "about": a case's
// allegations/meetings/evidence all have real ids, but a "still to
// explore" question is precisely about something NOT yet in any of
// those — there is no existing allegation/meeting/evidence id an absence
// can be pinned to, and ruleId is specifically for guardrails.js's own
// fixed rule catalog (a small, enumerable set of check names), not a
// per-question identity — reusing it here would collide two different
// people's "not yet interviewed" questions onto the same id.
//
// What DOES exist, safely, without any schema change: source_refs is
// already a flexible jsonb array of {kind, id, label} (kind currently
// meeting|evidence|allegation|document, per its own migration comment —
// WhySourcesModal/resolveSignalRef.js already degrade any unrecognised
// kind to a plain labelled row rather than breaking, so adding one more
// kind is additive, not a redesign). generateUnansweredQuestions now asks
// the SAME AI call (no second call, no embeddings) for one extra
// structured field per question — `subject`, the stable fact/person this
// question concerns, not a restatement of the question's own wording —
// stored as a `{kind:"subject", id:<normalised subject>}` source_ref.
// Extracting a stable subject (a name, a specific gap) is a materially
// easier, lower-variance task for the model than freely phrasing a
// question is, so two paraphrases of the same underlying question are
// far more likely to converge on the same subject than on the same
// sentence — but this is offered honestly as a stronger fingerprint, not
// a proof of semantic equivalence, which is why normalised-text matching
// stays as the final fallback below, and older signals with no subject
// ref at all (everything created before this change) simply fall
// straight through to that same fallback with no migration needed.
function normalizeQuestionText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[.?!,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tier 2 — finds a PRIOR signal (any status) of the given type on this
// case whose stored `subject` source_ref normalises to the same value.
export function findMatchingSignalBySubject(signals, caseId, type, subject) {
  const normalized = normalizeQuestionText(subject);
  if (!normalized) return null;
  return signalsForCase(signals, caseId).find(s => s.type === type && (s.sourceRefs || []).some(r => r.kind === "subject" && normalizeQuestionText(r.id) === normalized)) || null;
}

// Tier 3 (fallback) — finds a PRIOR signal (any status — open, resolved,
// not_relevant, etc.) of the given type on this case whose title
// normalises to the same text as `questionText`. Used when no subject
// match is available (no subject was generated, or the matching prior
// signal predates this identity existing at all).
export function findMatchingSignalByText(signals, caseId, type, questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return null;
  return signalsForCase(signals, caseId).find(s => s.type === type && normalizeQuestionText(s.title) === normalized) || null;
}

// Runs the full tier 2 -> tier 3 hierarchy for a freshly-generated
// question, returning the prior matching signal (of any status) if one
// exists, or null if this is genuinely new.
export function findMatchingQuestionSignal(signals, caseId, type, { subject, questionText }) {
  return findMatchingSignalBySubject(signals, caseId, type, subject)
    || findMatchingSignalByText(signals, caseId, type, questionText);
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
