// ─────────────────────────────────────────────────────────────────────────
// WAVE C.1A — what Compass analyses must be what the user is reviewing.
//
// Human UAT read a Meeting Record whose Purpose stated an allegation of
// unauthorised company-vehicle use, while the Summary beside it said "no
// substantive facts, allegations, or subject matter were recorded" and the
// Advice said the transcript was "limited to the opening formalities".
//
// Both statements were true — of DIFFERENT MEETINGS. The record came from a
// September investigation; the analysis was left over in component state from a
// standalone meeting reviewed minutes earlier, whose three notes really were
// just opening formalities.
//
// Opening a saved record did `setReviewOutput(m.record)` and navigated. That
// swapped the left-hand record and touched nothing else, so meetingSummary,
// advisorNotes, riskScore and the Ask history all survived from whatever had
// been analysed last. Nothing was cached wrongly and no prompt was at fault:
// the record and its analysis were simply never bound together.
//
// ┌─ THE INVARIANT ─────────────────────────────────────────────────────────┐
// │ Analysis is always presented WITH the record it was written for, or not  │
// │ at all. A record arriving without analysis clears the previous analysis  │
// │ rather than inheriting it — an empty rail is honest, a borrowed one is   │
// │ not.                                                                     │
// └─────────────────────────────────────────────────────────────────────────┘
//
// No schema change: every field read here already exists on the stored meeting.
// ─────────────────────────────────────────────────────────────────────────

import { splitMeetingRecord } from './meetingRecordSections';

// The analysis that belongs to a stored meeting. `advisorNotes` prefers the
// meeting's own column/field and falls back to the internal half of a legacy
// mixed record — the same precedence the reopen path already uses, so one rule
// governs both.
export function groundingFromMeeting(meeting) {
  const raw = meeting && typeof meeting.record === "string" ? meeting.record : "";
  const { employeeFacing, internal } = splitMeetingRecord(raw);
  return {
    record: employeeFacing,
    recordOriginal: employeeFacing,
    advisorNotes: (meeting && meeting.advisorNotes) || internal || "",
    summary: (meeting && meeting.summary) || "",
    riskScore: (meeting && meeting.riskScore) ?? null,
  };
}

// A bare record with no analysis of its own — a witness statement opened from
// Evidence, for instance. The analysis fields are deliberately EMPTY, not
// absent: the caller must clear, because inheriting the previous meeting's
// analysis is exactly the defect this module exists to end.
export function groundingFromRecord(recordText) {
  const raw = typeof recordText === "string" ? recordText : "";
  const { employeeFacing } = splitMeetingRecord(raw);
  return {
    record: employeeFacing,
    recordOriginal: employeeFacing,
    advisorNotes: "",
    summary: "",
    riskScore: null,
  };
}

// Whitespace-insensitive, because a reflow is not a material change and a stale
// warning nobody believes is worse than none. Anything else counts: this is
// deliberately conservative, since the cost of a false "stale" is a regenerate
// and the cost of a false "current" is advice about a record that no longer
// exists.
const normalise = t => (typeof t === "string" ? t : "").replace(/\s+/g, " ").trim();

export function sameRecord(a, b) {
  return normalise(a) === normalise(b);
}

// True when analysis is on screen that was written for a different version of
// the record than the one being shown. `analysisFor` is null when there is no
// analysis at all, which is not staleness.
export function isAnalysisStale({ record = "", analysisFor = null, hasAnalysis = false } = {}) {
  if (!hasAnalysis) return false;
  if (analysisFor === null || analysisFor === undefined) return false;
  return !sameRecord(record, analysisFor);
}
