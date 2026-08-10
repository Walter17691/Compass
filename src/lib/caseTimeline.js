// Pure merge of a case's scattered event sources into one chronological
// list. Nothing here is a new source of truth — meetings and allegations
// already live on the case/allegations array, and audit_log already
// records everything else (status toggles, reassignment, confidentiality
// changes) once a call site threads case_id through audit(). This just
// reads all of it and produces one sorted view.
//
// Allegation lifecycle events (added/status changed/removed) are
// deliberately read from the allegations array itself, not from
// audit_log — audit() also logs those same events (see App.jsx's
// createAllegation/changeAllegationStatus/deleteAllegation) so entries
// whose action starts with "Allegation" are excluded from the audit
// source below to avoid showing the same moment twice.
//
// Phase 8 adds: a stable `key` per entry (so overrides survive a
// regenerated timeline), `allegationId` where an entry is genuinely tied
// to one specific allegation (only the allegation source itself — a
// meeting or letter isn't modelled as allegation-scoped anywhere else in
// the app, so this deliberately doesn't invent that relationship), and
// application of `overrides` (excluded/edits/relevance, all keyed by
// entry key) — the case's `timeline_overrides` column, applied here
// rather than duplicated per caller.

function toTime(dateStr) {
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function rawEntries(cs, allegations, auditLog) {
  const entries = [];

  if (cs.dateReceived) {
    entries.push({ key: "case-opened", date: cs.dateReceived, type: "case", description: `Case opened${cs.caseType ? " — " + cs.caseType : ""}`, actor: cs.createdByName || null, linkTo: null, allegationId: null });
  }

  (cs.meetings || []).forEach(m => {
    entries.push({ key: `meeting-${m.id}`, date: m.date, type: "meeting", description: `${m.type || "Meeting"} held`, actor: m.manager || m.savedBy || null, linkTo: { kind: "meeting", id: m.id }, allegationId: null });
    if (m.letterOutput) {
      entries.push({ key: `letter-${m.id}`, date: m.savedAt || m.date, type: "letter", description: "Letter drafted", actor: m.savedBy || null, linkTo: { kind: "meeting", id: m.id }, allegationId: null });
    }
  });

  if (cs.investigationReport) {
    entries.push({ key: "report", date: cs.investigationReportDate || cs.dateReceived, type: "report", description: "Investigation report generated", actor: null, linkTo: { kind: "report" }, allegationId: null });
  }

  if (cs.outcome) {
    entries.push({ key: "outcome", date: cs.outcomeDate || cs.dateReceived, type: "outcome", description: `Outcome issued: ${cs.outcome}`, actor: null, linkTo: { kind: "outcome" }, allegationId: null });
  }

  (allegations || []).filter(a => a.caseId === cs.id).forEach(a => {
    entries.push({ key: `allegation-${a.id}`, date: a.createdAt, type: "allegation", description: `Allegation added: ${a.title}`, actor: null, linkTo: { kind: "allegation", id: a.id }, allegationId: a.id });
  });

  (auditLog || [])
    .filter(e => e.caseId === cs.id && !(e.action || "").startsWith("Allegation"))
    .forEach((e, i) => {
      entries.push({ key: `audit-${e.ts}-${i}`, date: e.ts, type: "audit", description: e.detail ? `${e.action} — ${e.detail}` : e.action, actor: e.user || null, linkTo: null, allegationId: null });
    });

  return entries;
}

export function buildCaseTimeline(cs, allegations, auditLog, overrides = {}) {
  const excluded = new Set(overrides.excluded || []);
  const edits = overrides.edits || {};
  const relevance = overrides.relevance || {};

  return rawEntries(cs, allegations, auditLog)
    .filter(e => !excluded.has(e.key))
    .map(e => ({ ...e, description: edits[e.key] || e.description, relevance: relevance[e.key] || null }))
    .sort((a, b) => toTime(a.date) - toTime(b.date));
}
