// Prep pack completion checking (Human UAT — Issue C).
//
// A prep pack that stops mid-sentence is not a prep pack. The AUTHORITATIVE
// signal is the provider's own end reason, surfaced by streamClaude's
// onComplete callback (stop_reason === "max_tokens" means the model was cut
// off). Nothing here tries to infer truncation from text length.
//
// missingPrepSections is only a secondary sanity check, for the narrow case
// where the completion event never arrived (e.g. an SSE line split across
// network chunks). It checks section PRESENCE only. It deliberately does not
// inspect, score or validate the CONTENT of any section — that would be a
// deterministic content validator, which is not what this is for, and would
// start failing good packs the moment the model phrased something unusually.

// The section list the prep prompt asks for, in order. "Key Questions" is
// deliberately absent: the narrative pack no longer has one (the interactive
// question cards replaced it) and it must not come back.
export const REQUIRED_PREP_SECTIONS = Object.freeze([
  "Objectives",
  "Agenda",
  "Opening Script",
  "Evidence to Explore",
  "Unanswered Issues",
  "Potential Inconsistencies",
  "Closing Points",
  "Legal Checklist",
  "Risk Flags",
]);

const normalise = (s) => String(s || "").trim().toLowerCase();

// Headings the model actually produced. Lenient on purpose: matching is
// case-insensitive and by prefix, so "## Risk Flags" and "## Risk flags:"
// both count. A truncated pack is missing whole trailing sections, so
// leniency costs nothing in detection and avoids failing a good pack over
// punctuation.
const headingsIn = (text) =>
  String(text || "")
    .split("\n")
    .filter((line) => line.trim().startsWith("##"))
    .map((line) => normalise(line.trim().replace(/^#+/, "")));

export function missingPrepSections(text) {
  const headings = headingsIn(text);
  return REQUIRED_PREP_SECTIONS.filter(
    (section) => !headings.some((h) => h.startsWith(normalise(section)))
  );
}

// truncated comes from the provider and takes precedence: if the model says
// it was cut off, the pack is incomplete regardless of which headings made it
// out. Only when the provider reported clean completion do we fall back to
// the structural check.
export function isPrepPackComplete({ text, truncated }) {
  if (truncated) return false;
  return missingPrepSections(text).length === 0;
}
