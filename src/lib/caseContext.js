// Assembles a case's own record into one context block for AI features
// scoped to it — the case-wide "Ask Compass" and the AI Case Overview
// (both Phase 8 of the gap-analysis build-out). Same shape as
// getPolicyCtx()/getCaseHistoryContext() in App.jsx: a pure string
// builder, no I/O, so it's usable from any AI call site without
// duplicating how a case's data gets read out.
//
// Deliberately excludes other employees' cases entirely — this is
// case-scoped context, not organisation history (that's
// getCaseHistoryContext()'s job, kept separate so the two never blur
// together the way the risk-assessment prompt fix earlier this session
// had to guard against).
export function buildCaseContext(cs, allegations = [], tasks = []) {
  const parts = [];

  parts.push([
    `Employee: ${cs.employeeName || "Unknown"}`,
    cs.caseType ? `Case type: ${cs.caseType}` : null,
    cs.dateReceived ? `Opened: ${cs.dateReceived}` : null,
    cs.description ? `Description: ${cs.description}` : null,
  ].filter(Boolean).join("\n"));

  if (allegations.length) {
    const allegationBlocks = allegations.map(a => [
      `- ${a.title}${a.period ? " (" + a.period + ")" : ""} — status: ${a.status}`,
      a.peopleInvolved ? `  People involved: ${a.peopleInvolved}` : null,
      a.employeeResponse ? `  Employee response: ${a.employeeResponse}` : null,
      a.witnessEvidence ? `  Witness evidence: ${a.witnessEvidence}` : null,
    ].filter(Boolean).join("\n"));
    parts.push("ALLEGATIONS:\n" + allegationBlocks.join("\n"));
  }

  const evidenceByAllegation = (cs.evidence || []).filter(ev => ev.allegationId);
  if (evidenceByAllegation.length) {
    const lines = evidenceByAllegation.map(ev => {
      const allegation = allegations.find(a => a.id === ev.allegationId);
      return `- ${ev.name} — ${ev.stance || "neutral"} "${allegation?.title || "an allegation"}"`;
    });
    parts.push("EVIDENCE LINKED TO ALLEGATIONS:\n" + lines.join("\n"));
  }

  const meetings = cs.meetings || [];
  if (meetings.length) {
    const lines = meetings.map(m => `- ${m.type || "Meeting"} on ${m.date || "unknown date"}${m.record ? ": " + m.record.slice(0, 500) : ""}`);
    parts.push("MEETINGS:\n" + lines.join("\n\n"));
  }

  if (cs.investigationReport) parts.push("INVESTIGATION REPORT:\n" + cs.investigationReport.slice(0, 2000));
  if (cs.outcome) parts.push(`OUTCOME ISSUED: ${cs.outcome}${cs.outcomeDate ? " on " + cs.outcomeDate : ""}`);

  const openTasks = tasks.filter(t => t.status !== "done");
  if (openTasks.length) parts.push("OPEN TASKS:\n" + openTasks.map(t => `- ${t.name}${t.dueDate ? " (due " + t.dueDate + ")" : ""}`).join("\n"));

  return parts.join("\n\n").slice(0, 12000);
}
