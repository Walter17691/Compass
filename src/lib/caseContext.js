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

// Phase 21 — Case Memory hardening. Meeting records are the one
// unbounded-growth part of a case (allegations/evidence/tasks stay small
// in practice; the investigation report and outcome already carry their
// own caps below) — a long-running case with 20+ meetings could blow the
// old blind trailing slice(0, 12000) on the whole assembled string,
// which silently dropped whatever came AFTER that cutoff: the
// investigation report, the outcome, open tasks. Budgeting only the
// meetings section instead means every other section is always present
// in full, and older meetings degrade gracefully (a cached AI summary if
// one's been generated — see App.jsx's buildHardenedCaseContext — or a
// short excerpt in the meantime) rather than the whole case context
// silently truncating mid-record.
const MEETING_FULL_CHARS = 500;
const MEETINGS_BUDGET_CHARS = 6000;
const MEETING_FALLBACK_EXCERPT_CHARS = 150;
const LETTER_EXCERPT_CHARS = 300;

export function buildCaseContext(cs, allegations = [], tasks = [], meetingSummaries = {}) {
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
      // Decision/approval trail (Phase 16/19) — the reasoning behind a
      // finding, and any appeal outcome layered on top of it, previously
      // never reached the AI context at all despite being the most
      // decision-relevant fact on a concluded allegation.
      a.decisionReasoning ? `  Decision: ${a.decisionReasoning}${a.decidedAt ? " (decided " + a.decidedAt + ")" : ""}` : null,
      a.appealOutcome ? `  Appeal outcome: ${a.appealOutcome}${a.appealReasoning ? " — " + a.appealReasoning : ""}${a.appealDecidedAt ? " (decided " + a.appealDecidedAt + ")" : ""}` : null,
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
    // Walk newest-first so the running total spends the budget on the
    // most recent (usually most decision-relevant) meetings first; older
    // ones that fall outside it get compressed rather than dropped.
    let runningLength = 0;
    const newestFirstLines = [...meetings].reverse().map(m => {
      let line = `- ${m.type || "Meeting"} on ${m.date || "unknown date"}`;
      if (m.record) {
        runningLength += m.record.length;
        const withinBudget = runningLength <= MEETINGS_BUDGET_CHARS;
        const body = withinBudget
          ? m.record.slice(0, MEETING_FULL_CHARS)
          : (meetingSummaries[m.id] || m.record.slice(0, MEETING_FALLBACK_EXCERPT_CHARS) + "…");
        line += ": " + body;
      }
      // Letter history (Phase 21) — previously excluded entirely, even
      // though a sent letter (invite, outcome, appeal) is often the most
      // concrete record of what was actually communicated to the
      // employee. Always included at a small fixed excerpt regardless of
      // the meeting-record budget above — letters are inherently short
      // and too decision-relevant to compress away.
      if (m.letterOutput) {
        const approvedNote = m.letterApprovedAt ? ` (approved ${m.letterApprovedAt})` : "";
        line += `\n  Letter sent${approvedNote}: ${m.letterOutput.slice(0, LETTER_EXCERPT_CHARS)}`;
      }
      return line;
    });
    parts.push("MEETINGS:\n" + newestFirstLines.reverse().join("\n\n"));
  }

  if (cs.investigationReport) parts.push("INVESTIGATION REPORT:\n" + cs.investigationReport.slice(0, 2000));
  if (cs.outcome) parts.push(`OUTCOME ISSUED: ${cs.outcome}${cs.outcomeDate ? " on " + cs.outcomeDate : ""}`);

  const openTasks = tasks.filter(t => t.status !== "done");
  if (openTasks.length) parts.push("OPEN TASKS:\n" + openTasks.map(t => `- ${t.name}${t.dueDate ? " (due " + t.dueDate + ")" : ""}`).join("\n"));

  return parts.join("\n\n");
}

// Meetings whose record would be compressed by buildCaseContext because
// they fall outside the budget and don't already have a cached summary —
// exactly the set App.jsx's buildHardenedCaseContext needs to generate
// summaries for before the real context assembly. Pure so it's testable
// without an AI call: given the same meetings/summaries inputs, always
// returns the same answer.
export function meetingsNeedingSummary(cs, meetingSummaries = {}) {
  const meetings = cs.meetings || [];
  let runningLength = 0;
  return [...meetings].reverse().filter(m => {
    if (!m.record) return false;
    runningLength += m.record.length;
    const overBudget = runningLength > MEETINGS_BUDGET_CHARS;
    return overBudget && !meetingSummaries[m.id];
  }).reverse();
}

// Phase 23 — Explainability retrofit. The exact set of allegations/
// meetings that fed a generated case overview, in WhySourcesModal's
// sourceRefs shape — captured once at generation time (App.jsx's
// generateCaseOverview) rather than re-derived at render time, so "why"
// always reflects what the overview actually saw, even if the case's own
// allegations/meetings change afterwards.
export function buildOverviewSourceRefs(allegations = [], meetings = []) {
  return [
    ...allegations.map(a => ({ kind: "allegation", id: a.id, label: a.title })),
    ...meetings.map(m => ({ kind: "meeting", id: m.id, label: m.type || "Meeting" })),
  ];
}
