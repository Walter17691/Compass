// Organisational ER Intelligence (Phase 6, OP9, §12) — early signals.
// Reuses org_trend_detection() (OP7's RPC) with a shorter, fixed 6-week
// window instead of a new RPC — the underlying mechanic (current window
// vs immediately preceding window of equal length) is identical, only
// the period length and the framing language differ. Deliberately
// theme-only, not case types — §12's own title is "Emerging theme" and
// its example is theme-based; an organisational-theme lens, explicitly
// not individual-employee risk scoring (this phase's own cross-cutting
// constraint).
export const EARLY_SIGNAL_WINDOW_DAYS = 42; // 6 weeks

export function describeEarlySignal(entry) {
  const locations = Object.entries(entry.byLocation || {})
    .filter(([loc]) => loc !== "Not specified");
  const locationText = locations.length
    ? ` across ${locations.length} location${locations.length === 1 ? "" : "s"}`
    : "";
  const previousText = entry.previousCount > 0
    ? `Previous six-week period: ${entry.previousCount} case${entry.previousCount === 1 ? "" : "s"}.`
    : "Previous six-week period: no recorded cases.";
  return `Emerging theme: ${entry.currentCount} case${entry.currentCount === 1 ? "" : "s"}${locationText} in the last six weeks refer to "${entry.themeName}". ${previousText}`;
}

// Same discipline as rootCauseExploration.js's buildReviewAreas — no
// hardcoded theme-name-to-action mapping, since an HR-defined taxonomy
// can have any name at all. A generic, honest "suggested review" framed
// as an area to investigate, never a proven cause.
export function buildSuggestedReview(themeName) {
  return `Suggested review: processes or communication related to "${themeName}".`;
}
