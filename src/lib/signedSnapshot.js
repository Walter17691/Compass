import { splitMeetingRecord } from './meetingRecordSections';

// ─────────────────────────────────────────────────────────────────────────
// THE EMPLOYEE-FACING SLICE OF A MEETING RECORD.
//
// This exact derivation existed TWICE, inline and identical: once where a record
// is sent for signature (so the participant sees only their half), and once
// where a meeting is saved (producing meetings[].signDocument). Two copies of
// the rule that decides what an employee is allowed to see is one copy too many,
// and the trust slice needs a THIRD caller — comparing what was signed against
// what the record says now — so it is extracted rather than copied again.
//
// Behaviour is preserved exactly, including the belt-and-braces second cut:
// splitMeetingRecord is the real boundary, and the "## HR Advisor" / "## Key
// Points" search is a fallback for the 884 legacy records that predate that
// boundary and still carry both halves mixed together.
// ─────────────────────────────────────────────────────────────────────────

export function employeeFacingSnapshot(record) {
  const full = splitMeetingRecord(record || "").employeeFacing;
  const start = full.indexOf("## Meeting Details");
  const advisorCut = full.indexOf("## HR Advisor");
  const keyCut = full.indexOf("\n## Key Points");
  const end = advisorCut > -1 ? advisorCut : keyCut > -1 ? keyCut : undefined;
  const raw = start > -1 ? full.slice(start, end) : full.slice(0, advisorCut > -1 ? advisorCut : undefined);
  return raw.replace(/^## /gm, "").replace(/^# /gm, "").replace(/\*\*/g, "");
}

// Whitespace-insensitive comparison, with the SAME heading cleanup applied to
// both sides. A reflow, a trailing newline or a changed indent is not a change to
// what the participant agreed to, and reporting one as a divergence would train
// people to ignore the warning that matters.
//
// Both sides matter: the stored snapshot was itself produced by
// employeeFacingSnapshot (so its "## " markers are already gone), but a legacy or
// externally-produced snapshot may retain them. Stripping only the current side
// would then report every such row as diverged — a false alarm on exactly the
// warning that has to stay credible.
const normalise = t => String(t || "")
  .replace(/^## /gm, "").replace(/^# /gm, "").replace(/\*\*/g, "")
  .replace(/\s+/g, " ").trim();

/**
 * Has the meeting record moved on from the document the participant was given?
 *
 * Returns null when the question cannot be answered — no snapshot loaded yet, or
 * no record — because "we don't know" must never render as "unchanged".
 */
export function snapshotDivergence(signedDocument, currentRecord) {
  if (typeof signedDocument !== "string" || !signedDocument.trim()) return null;
  if (typeof currentRecord !== "string") return null;
  const signed = normalise(signedDocument);
  const current = normalise(employeeFacingSnapshot(currentRecord));
  if (!current) return null;
  if (signed === current) return { diverged: false };
  return {
    diverged: true,
    // Reported so the UI can be specific about what kind of change happened,
    // without claiming to be a diff tool.
    currentIsLonger: current.length > signed.length,
    signedIsSubstringOfCurrent: current.includes(signed),
  };
}
