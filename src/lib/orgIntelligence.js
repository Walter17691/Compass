// Phase 18 of the reasoning-layer build-out (scale/commercialisation
// wave, after outcome consistency).
//
// extractThemeKeywords (raw regex word-extraction over case description/
// title text) used to live here — retired in Phase 6.5 hardening
// (Batch 5) in favour of themes.js's themeFrequency, which counts
// HR-curated case_themes tags instead of raw case text. The old
// approach had no defence against a real person's name appearing 2+
// times across different cases' descriptions and surfacing as an
// org-wide "recurring theme," including inside AI-generated executive-
// summary prose (ErReportScreen's "Generate AI summary").

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
