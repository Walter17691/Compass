// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — identity for live meeting suggestions.
//
// Found in human UAT (2026-09-25): Review showed the same proposed evidence
// update twice — "Evidence: Evidence previously submitted by the employee
// (nature/format unspecified)".
//
// ROOT CAUSE. The merge guard seeded its seen-set from the EXISTING list and then
// never updated it while building the new batch:
//
//     const known = new Set(existing.map(s => s.description.trim().toLowerCase()));
//     const fresh = parsed.evidenceMentioned.filter(m => !known.has(...))
//
// So a model response containing the same description twice passed both copies
// through — duplicates ACROSS calls were caught, duplicates WITHIN one call were
// not. The comparison was also bare exact-string, so a re-extraction that changed
// only spacing, a trailing full stop, or a "Evidence: " label read as new.
//
// Deliberately conservative. This normalises presentation, not meaning: no
// stemming, no fuzzy distance, no synonym matching. Two genuinely different
// pieces of evidence must never collapse into one just because their wording is
// similar — a missed duplicate is a cosmetic annoyance, a wrongly-merged pair is
// lost information.
// ─────────────────────────────────────────────────────────────────────────

// Labels the model sometimes prefixes to a description, which carry no meaning
// beyond the category the item already has in its own `kind` field.
const LEADING_LABEL = /^(?:evidence|witness|action|follow[-\s]?up|note)\s*[:\-–—]\s*/i;

// The comparison key for a suggestion description.
//
// Normalisation, in order:
//   1. non-string        -> ""
//   2. lowercase
//   3. leading category label removed ("Evidence: x" === "x")
//   4. all whitespace runs collapsed to one space (newlines included)
//   5. surrounding quotes and trailing sentence punctuation removed
//   6. trimmed
//
// Anything left is compared literally. "the employee's payslip" and "a payslip"
// remain DIFFERENT, which is intended.
export function suggestionKey(description) {
  if (typeof description !== "string") return "";
  return description
    .toLowerCase()
    .replace(LEADING_LABEL, "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s.;,!?]+$/g, "")
    .trim();
}

// True when two descriptions are the same substantive item.
export function isSameSuggestion(a, b) {
  const ka = suggestionKey(a);
  return !!ka && ka === suggestionKey(b);
}

// Merges freshly extracted suggestions into an existing list.
//
// The seen-set grows as the batch is consumed, which is the actual fix: a batch
// containing the same item twice now yields one entry. Existing items always win,
// so an accept/dismiss decision the user has already made is never re-surfaced by
// a later extraction.
//
// `build` maps an accepted incoming item to its stored shape, so this stays free
// of id minting and of either caller's field set.
export function mergeSuggestions(existing, incoming, build) {
  const list = Array.isArray(existing) ? existing : [];
  const batch = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(list.map(s => suggestionKey(s?.description)).filter(Boolean));

  const fresh = [];
  for (const item of batch) {
    const key = suggestionKey(item?.description);
    if (!key || seen.has(key)) continue;
    seen.add(key);                    // ← the batch dedupes against itself too
    fresh.push(build(item));
  }
  return fresh.length ? [...list, ...fresh] : list;
}
