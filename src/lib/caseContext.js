import { splitMeetingRecord } from './meetingRecordSections.js';
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
const INVESTIGATION_REPORT_CHARS = 2000;

// NEW-33 — shortened case content must identify itself as shortened.
//
// Every truncation here used to be a silent slice(). On the NEW-29 UAT case a
// 1,472-character meeting record was cut at 500 characters, landing mid-word:
// the stored transcript said "Can you confirm you are ready to proceed?" and
// the model received "...ready to pro". It then reported, entirely reasonably,
// that the dialogue was cut off mid-sentence — and that became a persisted
// next-action signal and an "incomplete record" question on a case whose
// record was in fact complete.
//
// No prompt rule can fix that, because the model was describing its input
// accurately. The builder is the only thing that knows whether it truncated,
// so it has to say so deterministically.
const EXCERPT_MARKER = "[record excerpt — remainder omitted to fit the context budget]";

// Appended once, only when something was actually shortened, so an excerpt
// boundary can never be read as evidence about the underlying record.
const EXCERPT_NOTE = "NOTE ON EXCERPTS: where content above ends with "
  + EXCERPT_MARKER
  + ", that marks how much text was passed to you here. It is a limit of this context only and is NOT evidence that the stored record, transcript or letter is incomplete, that a meeting was cut short, that dialogue is missing, or that the record is defective. The complete version exists in the case file. Content without that marker is complete as supplied.";

// Cuts at the latest sentence end, then line break, then word boundary inside
// the limit, so an excerpt does not end mid-word. The halfway floor stops a
// single early full stop throwing most of the excerpt away — below it, a word
// boundary is the better cut.
function excerpt(text, limit) {
  const full = typeof text === "string" ? text : (text == null ? "" : String(text));
  if (full.length <= limit) return { text: full, truncated: false };
  const window = full.slice(0, limit);
  const floor = Math.floor(limit / 2);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "), window.lastIndexOf(".\n"),
    window.lastIndexOf("? "), window.lastIndexOf("?\n"),
    window.lastIndexOf("! "), window.lastIndexOf("!\n"),
  );
  const lineEnd = window.lastIndexOf("\n");
  const wordEnd = window.lastIndexOf(" ");
  const cut = sentenceEnd > floor ? sentenceEnd + 1
    : lineEnd > floor ? lineEnd
    : wordEnd > 0 ? wordEnd
    : limit;
  return { text: full.slice(0, cut).trimEnd(), truncated: true };
}

// NEW-24 — grounding boundary. A saved meeting.record is one opaque markdown
// string holding three sections: Meeting Details, Meeting Dialogue, and HR
// Advisor Notes. The first two are a factual record of what happened and what
// was said. The third is AI-generated commentary, and feeding it back in here
// is what let a generated inference become "case context" for every later AI
// surface — Ask Compass, the case overview, next-best-action, and the signal
// generator whose output persists to case_signals and then grounds prep packs.
//
// An unsupported conclusion must not acquire the status of a recorded fact
// merely by having been saved once.
//
// READ-TIME ONLY: the stored record is never modified, and what the user sees
// on a saved meeting is unchanged. This strips the section from the copy used
// as historical/factual context, nothing else. Deliberately narrow — it is not
// a provenance system, it removes exactly one known-generated section.
//
// Matching is on a real markdown heading at the start of a line, so the same
// words appearing inside dialogue ("WC: I'll write the HR Advisor Notes up
// later") never trigger it. Skipping ends at the next heading of the same or
// higher level, so a lower-level heading inside the advisory body cannot end
// it early.
// ONE MATCHER, now in lib/meetingRecordSections.js — the signature path used a
// bare indexOf("## HR Advisor") that a heading variant would have defeated, so
// the robust matcher this function always had is shared rather than duplicated.
// Behaviour here is unchanged: READ-TIME ONLY, the stored record is never
// modified, and what the user sees on a saved meeting is untouched.
export function stripAdvisorNotes(record) {
  if (typeof record !== "string") return record;
  if (!record) return record;
  const { employeeFacing, internal } = splitMeetingRecord(record);
  // Byte-for-byte identical when there was no advisory section at all.
  return internal ? employeeFacing : record;
}

export function buildCaseContext(cs, allegations = [], tasks = [], meetingSummaries = {}) {
  const parts = [];
  // NEW-33 — set by any site that shortens content, so EXCERPT_NOTE is added
  // only when something was actually omitted.
  let anyExcerpt = false;

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
      // NEW-24 — budget and body are both computed from the factual record
      // only, so the budget reflects what is actually supplied.
      const factualRecord = stripAdvisorNotes(m.record);
      if (factualRecord) {
        runningLength += factualRecord.length;
        const withinBudget = runningLength <= MEETINGS_BUDGET_CHARS;
        let body;
        if (withinBudget) {
          const e = excerpt(factualRecord, MEETING_FULL_CHARS);
          body = e.truncated ? e.text + " " + EXCERPT_MARKER : e.text;
          if (e.truncated) anyExcerpt = true;
        } else if (meetingSummaries[m.id]) {
          // A cached AI compression, not the record itself — say so rather than
          // letting it read as the full text.
          body = "[summary of this meeting's record, not the record itself] " + meetingSummaries[m.id];
          anyExcerpt = true;
        } else {
          const e = excerpt(factualRecord, MEETING_FALLBACK_EXCERPT_CHARS);
          body = e.truncated ? e.text + " " + EXCERPT_MARKER : e.text;
          if (e.truncated) anyExcerpt = true;
        }
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
        const le = excerpt(m.letterOutput, LETTER_EXCERPT_CHARS);
        if (le.truncated) anyExcerpt = true;
        line += `\n  Letter sent${approvedNote}: ${le.truncated ? le.text + " " + EXCERPT_MARKER : le.text}`;
      }
      return line;
    });
    parts.push("MEETINGS:\n" + newestFirstLines.reverse().join("\n\n"));
  }

  if (cs.investigationReport) {
    const re = excerpt(cs.investigationReport, INVESTIGATION_REPORT_CHARS);
    if (re.truncated) anyExcerpt = true;
    parts.push("INVESTIGATION REPORT:\n" + (re.truncated ? re.text + " " + EXCERPT_MARKER : re.text));
  }
  if (cs.outcome) parts.push(`OUTCOME ISSUED: ${cs.outcome}${cs.outcomeIssuedAt ? " on " + cs.outcomeIssuedAt : ""}`);

  const openTasks = tasks.filter(t => t.status !== "done");
  if (openTasks.length) parts.push("OPEN TASKS:\n" + openTasks.map(t => `- ${t.name}${t.dueDate ? " (due " + t.dueDate + ")" : ""}`).join("\n"));

  if (anyExcerpt) parts.push(EXCERPT_NOTE);

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
    // Mirrors buildCaseContext's own budget exactly — both measure the
    // factual record, so the two can never disagree about which meetings
    // fall outside the budget and need a cached summary.
    const factualRecord = stripAdvisorNotes(m.record);
    if (!factualRecord) return false;
    runningLength += factualRecord.length;
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
