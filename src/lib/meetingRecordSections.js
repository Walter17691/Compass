// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — the employee-facing / internal boundary.
//
// A generated meeting record arrives as ONE markdown string containing three
// sections: Meeting Details, Meeting Dialogue, and HR Advisor Notes. The first
// two are a factual account of what happened and what was said. The third is
// Compass's internal advisory commentary — written for the HR user, never for
// the employee.
//
// Found in human UAT (2026-09-25): "Edit record" exposed the whole string, so
// the editable — and therefore confirmable, and potentially signable — record
// included the internal advisory narrative. The invariant this module exists to
// enforce is:
//
//     employeeFacingRecord !== internalCompassAnalysis
//
// ONE MATCHER. caseContext.js already had a robust strip (heading-level aware,
// case-insensitive, CRLF-safe, and matching only a real heading at the start of
// a line so "I'll write the HR Advisor Notes up later" inside dialogue cannot
// trigger it). The signature path meanwhile used a bare
// `full.indexOf("## HR Advisor")`, which would have missed `### HR Advisor
// Notes`, the British "Adviser", a bold pseudo-heading, or a missing space —
// and then internal advice would have reached the employee. That matcher now
// lives here once, and both callers use it.
//
// Splitting, not hiding. Hiding the section in the UI while the payload stayed
// mixed would leave every downstream consumer — the authoritative record, the
// signature document, the case file — still carrying it.
// ─────────────────────────────────────────────────────────────────────────

// A real markdown heading at line start, any level.
const headingLevel = line => ((line.match(/^[ \t]*(#{1,6})[ \t]+\S/) || [])[1] || "").length;

// The internal advisory heading. Deliberately tolerant of what an LLM actually
// emits — any heading level, either spelling, optional space after the hashes —
// because a heading variant must never become a data-boundary breach.
const internalHeadingLevel = line =>
  ((line.match(/^[ \t]*(#{1,6})[ \t]*HR Advis(?:o|e)r\b/i) || [])[1] || "").length;

// Splits a generated record into the two payloads.
//
// Returns { employeeFacing, internal }. `internal` is "" when the record has no
// advisory section — which is the normal case for the 884 legacy meetings that
// predate this format, and for a hand-written record.
//
// Skipping ends at the next heading of the same or higher level, so a
// lower-level heading inside the advisory body cannot end it early.
export function splitMeetingRecord(record) {
  const text = typeof record === "string" ? record : (record == null ? "" : String(record));
  if (!text) return { employeeFacing: "", internal: "" };

  // Split on \n only, so a \r survives at the end of each line and CRLF input
  // rejoins exactly as it arrived.
  const lines = text.split("\n");
  const bare = line => line.replace(/\r$/, "");
  if (!lines.some(l => internalHeadingLevel(bare(l)) > 0)) {
    return { employeeFacing: text, internal: "" };
  }

  const kept = [];
  const internal = [];
  let skippingFrom = 0;
  for (const line of lines) {
    const b = bare(line);
    const level = internalHeadingLevel(b);
    if (level > 0) { skippingFrom = level; internal.push(line); continue; }
    if (skippingFrom) {
      const h = headingLevel(b);
      if (h > 0 && h <= skippingFrom) skippingFrom = 0;
    }
    (skippingFrom ? internal : kept).push(line);
  }
  return {
    // Only reached when an advisory section was actually removed, so trimming
    // the blank tail it leaves behind cannot affect a record that had none.
    employeeFacing: kept.join("\n").replace(/[\s\r\n]+$/, ""),
    internal: internal.join("\n").replace(/[\s\r\n]+$/, ""),
  };
}

// The employee-facing half only. This is what may be edited, confirmed as the
// authoritative record, and sent for signature.
export function employeeFacingRecord(record) {
  return splitMeetingRecord(record).employeeFacing;
}

// The internal half only. Shown to the HR user, never to the employee.
export function internalAnalysis(record) {
  return splitMeetingRecord(record).internal;
}

// True when a record still has both halves mixed together — the legacy shape.
// Used to split on read so an old saved record does not reappear inside the
// editable surface.
export function hasMixedSections(record) {
  return splitMeetingRecord(record).internal.length > 0;
}
