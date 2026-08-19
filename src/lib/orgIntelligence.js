// Phase 18 of the reasoning-layer build-out (scale/commercialisation
// wave, after outcome consistency). Pure theme-keyword extraction over
// case descriptions/titles — the other half of what ErReportScreen's
// "Generate AI summary" needed: the month-over-month deltas it feeds the
// prompt already existed (ErReportScreen.jsx's own casesDelta/
// resolutionDelta), just never actually reached the prompt. This adds
// the second signal (recurring themes) so the AI has genuine
// pattern-finding material instead of only headline counts.
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","without","was","were","is","are",
  "been","being","this","that","these","those","he","she","they","them","his","her","their","its","him",
  "employee","employees","manager","managers","staff","case","cases","issue","issues","matter","matters",
  "during","after","before","from","into","over","under","about","between","against","also","there","here",
  "have","has","had","will","would","could","should","not","did","does",
]);

// Only counts words appearing in 2+ different cases' text — a single
// case's own wording (a name, a specific date written out, a one-off
// detail) shouldn't read as an organisational "theme" on its own.
const MIN_CASE_COUNT = 2;

export function extractThemeKeywords(cases, limit = 8) {
  const caseCountByWord = {};
  (cases || []).forEach(cs => {
    const text = ((cs.description || "") + " " + (cs.title || "")).toLowerCase();
    const wordsInThisCase = new Set((text.match(/[a-z]{4,}/g) || []).filter(w => !STOP_WORDS.has(w)));
    wordsInThisCase.forEach(w => { caseCountByWord[w] = (caseCountByWord[w] || 0) + 1; });
  });
  return Object.entries(caseCountByWord)
    .filter(([, count]) => count >= MIN_CASE_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

// Organisational ER Intelligence (Phase 6, OP3, §1) — "informal vs formal
// resolution". org_insights_overview_2026-08-19.sql deliberately doesn't
// compute this in SQL: a meeting's `type` is free text matching
// MEETING_TYPES' `label` (e.g. "Investigation", "Informal / 1-1"), not a
// fixed enum, so a SQL classifier would silently break on a future label
// rename. Kept here instead, next to the app's one other source-of-truth
// mapping for meeting labels (constants.js's MEETING_TYPES itself), so
// the two stay easy to keep in sync by inspection.
const INFORMAL_MEETING_LABEL = "Informal / 1-1";

// A case resolves "informally" only if every meeting it has ever had was
// an Informal / 1-1 — one Investigation/Disciplinary/Grievance/etc.
// meeting at any point means the case escalated to a formal process,
// even if it later closes without a sanction. A case with no meetings
// yet has no resolution type at all.
export function classifyCaseResolutionType(cs) {
  const meetings = cs?.meetings || [];
  if (meetings.length === 0) return null;
  return meetings.every(m => m.type === INFORMAL_MEETING_LABEL) ? "informal" : "formal";
}

export function computeInformalFormalSplit(cases) {
  const split = { informal: 0, formal: 0 };
  (cases || []).forEach(cs => {
    const type = classifyCaseResolutionType(cs);
    if (type) split[type]++;
  });
  return split;
}
