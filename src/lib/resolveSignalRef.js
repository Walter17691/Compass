// Phase 6.5 hardening (P1, reliability review) — extracted from
// CaseViewScreen.jsx's own inline resolveSignalRef while fixing a real
// bug there: evidence refs were resolved by array-index lookup
// ((cs.evidence||[])[ref.id]), which only worked by coincidence for
// guardrails.js's own (now also fixed) index-based sourceRefs, and was
// already broken for App.jsx's acceptDocumentFinding, which has stored a
// real evidence UUID here since evidenceUpload.js's ensureEvidenceIds
// (Cluster 8) — every "Ask why" on an AI-detected inconsistency finding
// silently resolved to nothing. Pulled out to its own module so this
// resolution logic — and the id-vs-index distinction specifically — has
// direct unit coverage, rather than only being reachable through
// CaseViewScreen's full 130+-prop render tree.
export function resolveSignalRef(ref, { meetings = [], allegations = [], evidence = [] } = {}) {
  if (ref.kind === "meeting") {
    const m = meetings.find(x => x.id === ref.id);
    return m ? { label: m.type || "Meeting", detail: null, date: m.date } : null;
  }
  if (ref.kind === "allegation") {
    const a = allegations.find(x => x.id === ref.id);
    return a ? { label: a.title, detail: null, date: a.createdAt } : null;
  }
  if (ref.kind === "evidence") {
    const e = evidence.find(x => x.id === ref.id);
    return e ? { label: e.name || "Evidence", detail: e.type || null, date: e.date || null } : null;
  }
  // Self-contained refs (own label/detail already set, nothing to look up
  // by id) — e.g. ConsistencyPanel's anonymised comparable-case count,
  // where there's no specific case id that could be shown without
  // defeating the anonymity.
  if (ref.detail || ref.date) return ref;
  return null;
}
