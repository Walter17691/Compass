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

function toTime(dateStr) {
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function buildCaseTimeline(cs, allegations, auditLog) {
  const entries = [];

  if (cs.dateReceived) {
    entries.push({ date: cs.dateReceived, type: "case", description: `Case opened${cs.caseType ? " — " + cs.caseType : ""}`, actor: cs.createdByName || null, linkTo: null });
  }

  (cs.meetings || []).forEach(m => {
    entries.push({ date: m.date, type: "meeting", description: `${m.type || "Meeting"} held`, actor: m.manager || m.savedBy || null, linkTo: { kind: "meeting", id: m.id } });
    if (m.letterOutput) {
      entries.push({ date: m.savedAt || m.date, type: "letter", description: "Letter drafted", actor: m.savedBy || null, linkTo: { kind: "meeting", id: m.id } });
    }
  });

  if (cs.investigationReport) {
    entries.push({ date: cs.investigationReportDate || cs.dateReceived, type: "report", description: "Investigation report generated", actor: null, linkTo: { kind: "report" } });
  }

  if (cs.outcome) {
    entries.push({ date: cs.outcomeDate || cs.dateReceived, type: "outcome", description: `Outcome issued: ${cs.outcome}`, actor: null, linkTo: { kind: "outcome" } });
  }

  (allegations || []).filter(a => a.caseId === cs.id).forEach(a => {
    entries.push({ date: a.createdAt, type: "allegation", description: `Allegation added: ${a.title}`, actor: null, linkTo: { kind: "allegation", id: a.id } });
  });

  (auditLog || [])
    .filter(e => e.caseId === cs.id && !(e.action || "").startsWith("Allegation"))
    .forEach(e => {
      entries.push({ date: e.ts, type: "audit", description: e.detail ? `${e.action} — ${e.detail}` : e.action, actor: e.user || null, linkTo: null });
    });

  return entries.sort((a, b) => toTime(a.date) - toTime(b.date));
}
