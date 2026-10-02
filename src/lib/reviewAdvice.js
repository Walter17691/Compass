// ─────────────────────────────────────────────────────────────────────────
// WAVE C4.1 — the advisory rail says what it actually knows.
//
// Human UAT found the rail reporting "LOW tribunal risk" as a coloured verdict
// while the analysis beside it said the subject matter, the evidence and the
// employee's account were all still unresolved. A three-state verdict about
// legal exposure, rendered in a traffic-light colour, is far more conclusive
// than incomplete information can support — and it is the one thing on the
// screen a reader will take away.
//
// ┌─ WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────┐
// │ Presentation only. The rating is still generated, still carries the same │
// │ {rating, summary, historyContext} shape, is still persisted on the       │
// │ meeting and in the review draft, and every other consumer — Dashboard    │
// │ counts, the ER report's HIGH filter, the meetings badge, caseStage's     │
// │ case-level rating, the CSV and PDF exports — is untouched and still sees │
// │ HIGH/MEDIUM/LOW exactly as before.                                       │
// │                                                                          │
// │ Nothing is deleted, no persisted history is rewritten, and the generation │
// │ prompt and its epistemic contract (reviewAdvisoryBoundary.test.js) are    │
// │ unchanged. What goes is the VERDICT PRESENTATION in the normal Review     │
// │ rail: the word, the colour, and the phrase "tribunal risk".              │
// └─────────────────────────────────────────────────────────────────────────┘
//
// No new AI call, no new classification, no new persistence. Everything below
// is a deterministic reading of text the screen already had.
// ─────────────────────────────────────────────────────────────────────────

// ── 1. AI headings that sound mandatory ──
//
// The triage summary is generated under a fixed heading list that includes
// "Actions Required". That heading is advisory output, not a deterministic
// workflow requirement, and it must not read as one. Renamed at RENDER, which
// also covers summaries already persisted — the prompt and the contract tests
// that pin its heading list are deliberately left alone.
//
// Deterministic workflow requirements elsewhere in Compass are untouched and
// may still say "required"; this map applies only to the advisory summary.
const ADVISORY_HEADING_RENAMES = Object.freeze({
  "actions required": "Things to check",
  "action required": "Things to check",
  "required actions": "Things to check",
});

const HEADING = /^([ \t]*#{1,6}[ \t]*)(.+?)([ \t]*)$/;

export function neutraliseSummaryHeadings(markdown) {
  if (!markdown || typeof markdown !== "string") return markdown || "";
  return markdown
    .split("\n")
    .map(line => {
      const m = HEADING.exec(line.replace(/\r$/, ""));
      if (!m) return line;
      const replacement = ADVISORY_HEADING_RENAMES[m[2].trim().toLowerCase()];
      return replacement ? `${m[1]}${replacement}` : line;
    })
    .join("\n");
}

// ── 2. The risk rating, reframed ──
//
// `summary` is two or three plain sentences of genuinely useful process
// commentary — that is the part worth keeping. The rating itself is returned so
// callers that legitimately need it still can, but `showVerdict` is false for
// the normal Review rail: this module never hands back a label to colour.
//
// `unassessable` is the honest state. UNKNOWN means generation failed outright;
// deterministic gaps in the record (computeMeetingQualityGaps, not an AI
// judgement) mean the record is incomplete and any assessment of it is
// provisional. Where either holds, uncertainty must stay visible rather than
// being resolved into a reassuring word.
export function processConsiderations({ riskScore = null, reviewGaps = [] } = {}) {
  const gaps = Array.isArray(reviewGaps) ? reviewGaps.filter(Boolean) : [];
  const rating = riskScore?.rating || null;
  const prose = typeof riskScore?.summary === "string" ? riskScore.summary.trim() : "";
  const failed = rating === "UNKNOWN";

  return {
    // Retained for compatibility with anything that legitimately needs it.
    // Never rendered as a verdict by the Review rail.
    rating,
    showVerdict: false,
    prose: failed ? "" : prose,
    historyContext: riskScore?.historyContext || null,
    // Why the reader should not treat what follows as settled.
    unassessable: failed
      ? "Compass could not assess this record."
      : gaps.length
        ? "This record is still incomplete, so anything below is provisional."
        : null,
    hasContent: !!(failed || (prose && !failed) || gaps.length || riskScore?.historyContext),
  };
}

// ── 3. Making the advisory narrative scannable ──
//
// HR Advisor Notes is generated as flowing prose — frequently one long
// paragraph, which is what UAT found hard to read. This splits it WITHOUT
// interpreting it: the generation contract already requires anything to be
// checked to be written as "Confirm…", "Check…", "Verify…", "Establish…",
// "Review…", "Consider…" or "Record…", so those sentences are separable by
// their own grammatical form rather than by a judgement about their meaning.
//
// If the text already has headings, they are used as-is and nothing is
// regrouped. If no sentence takes that form, the prose is returned as a single
// block — the headings are never forced onto content that does not support
// them, because a heading asserting something the text does not say would be a
// worse defect than a long paragraph.
const CHECK_VERB = /^(Confirm|Check|Verify|Establish|Review|Consider|Record|Ensure|Obtain|Clarify)\b/;

// splitMeetingRecord returns the advisory half INCLUDING its own "## HR Advisor
// Notes" heading line — so every real advisorNotes value starts with one.
//
// Found by opening an actual production record rather than by a test: treating
// that heading as evidence the model had structured the content meant the
// "already structured, leave it alone" branch fired on EVERY real record and the
// split never ran at all. The unit tests passed because their fixtures were
// bare prose, which is not the shape this function is ever given.
//
// It is the section's own label, not structure within it, and the rail already
// labels this block — so it is dropped before anything else is decided.
const ADVISORY_SECTION_HEADING = /^[ \t]*#{1,6}[ \t]*HR Advis(?:o|e)r\b/i;

export function adviceSections(advisorNotes) {
  const raw = typeof advisorNotes === "string" ? advisorNotes.trim() : "";
  if (!raw) return [];

  const lines = raw.split("\n");
  const text = (ADVISORY_SECTION_HEADING.test(lines[0].replace(/\r$/, ""))
    ? lines.slice(1).join("\n")
    : raw).trim();
  if (!text) return [];

  // Structured by the model BENEATH its own section heading — leave as it is.
  if (text.split("\n").some(l => HEADING.test(l.replace(/\r$/, "")) && /^[ \t]*#/.test(l))) {
    return [{ title: null, prose: text, items: [] }];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const items = sentences.filter(s => CHECK_VERB.test(s));
  // One sentence per line. MDRenderer gives each line its own paragraph, so a
  // six-sentence wall becomes six short paragraphs — purely typographic, and
  // the only honest scannability win available here.
  //
  // Measured on a real record rather than assumed: HR Advisor Notes is
  // generated as "flowing prose - one paragraph", and the check-verb
  // instruction governs the SUMMARY's action list, not this field. A real
  // record's six sentences opened "This / Those / The / Before / The / The" —
  // none of them a check verb — so the grouping below is correct to decline,
  // but it is inert on this field in practice. Segmentation is what actually
  // improves it, and it claims nothing about the content.
  const asParagraphs = list => list.join("\n").trim();

  if (!items.length) return [{ title: null, prose: asParagraphs(sentences), items: [] }];

  const out = [];
  const prose = asParagraphs(sentences.filter(s => !CHECK_VERB.test(s)));
  if (prose) out.push({ title: null, prose, items: [] });
  out.push({ title: "Before you continue", prose: "", items });
  return out;
}
