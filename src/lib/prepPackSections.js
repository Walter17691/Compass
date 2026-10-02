// ─────────────────────────────────────────────────────────────────────────
// WAVE C2 CORRECTION — the prep pack, in pieces a manager can choose between.
//
// Human UAT: "The manager must scroll through several screens of AI output
// before reaching the Start meeting button." That was true. The pack is one
// markdown blob of nine sections — Objectives, Agenda, Opening Script, Evidence
// to Explore, Unanswered Issues, Potential Inconsistencies, Closing Points,
// Legal Checklist, Risk Flags — rendered whole, with Start beneath it.
//
// This splits the blob on its own "## " headings so each section can be reached
// on its own. It parses; it does not summarise, reorder, rewrite or drop
// anything. An unrecognised heading is kept as-is, and anything before the first
// heading is kept too, because discarding model output we did not predict would
// be a silent loss of content.
//
// ┌─ CLASSIFICATION THIS SUPPORTS ──────────────────────────────────────────┐
// │ Nothing here decides what a manager reads. The ordering below is the     │
// │ order the model was asked for, preserved exactly; `whenUseful` is a hint │
// │ for presentation only and never hides a section.                         │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

// When each section is genuinely of use. Presentation hint only — every section
// remains available at every point. Derived from what the section IS:
// "Closing Points" lists what to cover before ending a meeting, so it is of no
// use while preparing to start one.
const WHEN_USEFUL = Object.freeze({
  "Objectives": "before",
  "Agenda": "before",
  "Opening Script": "during",
  "Evidence to Explore": "during",
  "Unanswered Issues": "during",
  "Potential Inconsistencies": "during",
  "Closing Points": "during",
  "Legal Checklist": "before",
  "Risk Flags": "before",
});

export const PREP_SECTION_ORDER = Object.freeze([
  "Objectives", "Agenda", "Opening Script", "Evidence to Explore",
  "Unanswered Issues", "Potential Inconsistencies", "Closing Points",
  "Legal Checklist", "Risk Flags",
]);

// Split on markdown H2s. Tolerant of "##" with or without a trailing space and
// of leading whitespace, because this is model output rather than a fixture.
const HEADING = /^[ \t]*##[ \t]*(.+?)[ \t]*$/;

export function splitPrepPack(markdown) {
  if (!markdown || typeof markdown !== "string" || !markdown.trim()) return [];
  const lines = markdown.split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      if (current) sections.push(current);
      const title = m[1].replace(/^#+\s*/, "").trim();
      current = { title, body: [], whenUseful: WHEN_USEFUL[title] || "before" };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      // Content before the first heading is still content. Kept under a neutral
      // title rather than thrown away.
      current = { title: "Preparation notes", body: [line], whenUseful: "before" };
    }
  }
  if (current) sections.push(current);

  return sections
    .map(s => ({ ...s, body: s.body.join("\n").trim() }))
    .filter(s => s.title || s.body);
}

// One short line the manager can read without opening anything.
export function prepPackSummary(markdown) {
  const sections = splitPrepPack(markdown);
  if (!sections.length) return null;
  return `${sections.length} section${sections.length === 1 ? "" : "s"}`;
}
