// Pure helpers for case allegations/issues — the foundational entity the
// gap-analysis found missing entirely (evidence-tagging, the AI case
// overview, and case-scoped AI Q&A are all downstream of this). Unlike
// checklistTasks.js (tasks nested inside a parent instance), allegations
// are a flat, cross-case-listable entity of their own (see
// supabase/case_structure_2026-08-09.sql), so these operate directly on
// the allegations array — the caller (App.jsx) still owns persistence
// (Supabase) and which case is active.

export const ALLEGATION_STATUSES = [
  { id: "unreviewed", label: "Unreviewed", color: "#6B6375", bg: "#F5F1EA" },
  { id: "evidence_gathering", label: "Evidence gathering", color: "#B87520", bg: "#FEF5E7" },
  { id: "substantiated", label: "Substantiated", color: "#C84B2F", bg: "#FEF0EB" },
  { id: "partially_substantiated", label: "Partially substantiated", color: "#B87520", bg: "#FEF5E7" },
  { id: "not_substantiated", label: "Not substantiated", color: "#1A7A4A", bg: "#E8F5EE" },
  { id: "unable_to_determine", label: "Unable to determine", color: "#6B6375", bg: "#F5F1EA" },
];

export const EVIDENCE_STANCES = [
  { id: "supports", label: "Supports" },
  { id: "contradicts", label: "Contradicts" },
  { id: "context", label: "Context" },
  { id: "neutral", label: "Neutral" },
];

// The four statuses that represent a recorded finding, as opposed to the
// two procedural/in-progress statuses above them. Phase 16 (Decision
// Workspace) stamps decidedBy/decidedAt whenever status moves into one of
// these — never Compass's own call, just an accountability trail for a
// decision the responsible manager made.
export const FINDING_STATUSES = ["substantiated", "partially_substantiated", "not_substantiated", "unable_to_determine"];

export function isFindingStatus(status) {
  return FINDING_STATUSES.includes(status);
}

export function allegationStatusMeta(status) {
  return ALLEGATION_STATUSES.find(s => s.id === status) || ALLEGATION_STATUSES[0];
}

export function allegationsForCase(allegations, caseId) {
  return (allegations || []).filter(a => a.caseId === caseId);
}

export function addAllegation(allegations, caseId, fields) {
  const title = (fields?.title || "").trim();
  if (!title) return allegations;
  const allegation = {
    id: "alg_" + Date.now(),
    caseId,
    title,
    description: fields.description || "",
    period: fields.period || "",
    peopleInvolved: fields.peopleInvolved || "",
    status: "unreviewed",
    employeeResponse: "",
    witnessEvidence: "",
    decisionReasoning: "",
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
  return [...(allegations || []), allegation];
}

export function updateAllegation(allegations, allegationId, fields) {
  return (allegations || []).map(a => a.id === allegationId ? { ...a, ...fields } : a);
}

// Stamps decidedBy/decidedAt the moment status moves into a finding, and
// clears them if it's ever moved back out (e.g. reopened for more
// evidence) — a stale "decided" timestamp on a status that's no longer a
// finding would misrepresent the case's actual accountability trail.
export function setAllegationStatus(allegations, allegationId, status, decidedBy = null) {
  const fields = isFindingStatus(status)
    ? { status, decidedBy, decidedAt: new Date().toISOString() }
    : { status, decidedBy: null, decidedAt: null };
  return updateAllegation(allegations, allegationId, fields);
}

export function removeAllegation(allegations, allegationId) {
  return (allegations || []).filter(a => a.id !== allegationId);
}

// Phase 19 (Advanced Appeal Workspace) — a separate decision layered on
// top of the original finding, not a replacement of it: the finding
// (status/decidedBy/decidedAt) stays exactly as recorded, and the appeal
// outcome is its own accountability trail alongside it.
export const APPEAL_OUTCOMES = [
  { id: "upheld", label: "Appeal upheld" },
  { id: "partially_upheld", label: "Partially upheld" },
  { id: "not_upheld", label: "Not upheld" },
  { id: "further_investigation_required", label: "Further investigation required" },
];

export function appealOutcomeMeta(outcome) {
  return APPEAL_OUTCOMES.find(o => o.id === outcome) || null;
}

export function setAppealOutcome(allegations, allegationId, outcome, reasoning, decidedBy = null) {
  if (!APPEAL_OUTCOMES.some(o => o.id === outcome)) return allegations;
  return updateAllegation(allegations, allegationId, {
    appealOutcome: outcome,
    appealReasoning: reasoning || "",
    appealDecidedBy: decidedBy,
    appealDecidedAt: new Date().toISOString(),
  });
}

// ── Evidence linking ──
// Evidence itself stays nested JSONB on cases.evidence (no migration
// needed) — these just add/clear the optional allegationId/stance fields
// on one evidence item, by index within that case's evidence array.

export function linkEvidenceToAllegation(evidence, evidenceIndex, allegationId, stance) {
  return (evidence || []).map((ev, i) => i === evidenceIndex ? { ...ev, allegationId, stance: stance || "neutral" } : ev);
}

export function unlinkEvidenceFromAllegation(evidence, evidenceIndex) {
  return (evidence || []).map((ev, i) => {
    if (i !== evidenceIndex) return ev;
    const rest = { ...ev };
    delete rest.allegationId;
    delete rest.stance;
    return rest;
  });
}

export function evidenceForAllegation(evidence, allegationId) {
  return (evidence || []).map((ev, index) => ({ ...ev, index })).filter(ev => ev.allegationId === allegationId);
}
