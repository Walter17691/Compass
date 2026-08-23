// Organisational ER Intelligence (Phase 6, OP8, §4) — root-cause
// exploration. Pure formatting over org_theme_root_cause()'s (OP8's
// RPC) raw counts/co-occurring-theme list. Deliberately does NOT map a
// theme name to a specific recommended action (an HR-defined taxonomy
// can have any name; a hardcoded name->action table would be fabricated
// precision) — "potential areas for review" is a generic, honest
// transformation of what the data actually shows: which OTHER themes
// keep showing up alongside this one.

// Organisational ER Intelligence (Phase 6.5 hardening, product-principles
// review) — same MIN_SAMPLE_SIZE floor used throughout this phase
// (trendDetection.js, outcomeConsistency.js, orgEvents.js, riskMap.js).
// The parent theme itself is already gated (this panel only opens from a
// TrendsPanel card that cleared isSignificantTrend's own >=3 floor), but
// a CO-OCCURRING theme or a LOCATION within it can still be built on far
// fewer cases than the parent — e.g. a theme with 5 cases where only 1
// happens to also carry a given other theme, or happens to sit at a
// given site. Without this, that single case got surfaced as a named
// "potential area for review" or a named site "concentration," either
// of which risks reading as a real pattern (or identifying a lone case)
// when it's really just noise.
const MIN_SAMPLE_SIZE = 3;

export function formatLocationConcentration(byLocation) {
  return Object.entries(byLocation || {})
    .filter(([loc, count]) => loc !== "Not specified" && count >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b[1] - a[1])
    .map(([location, count]) => ({ location, count }));
}

// Never a proven cause — framed as an area to investigate, matching the
// spec's own required framing exactly. Co-occurring themes below the
// sample-size floor are dropped entirely rather than shown as a weak
// "review area" — a single shared case isn't a pattern.
export function buildReviewAreas(coOccurringThemes) {
  return (coOccurringThemes || [])
    .filter(t => t.count >= MIN_SAMPLE_SIZE)
    .map(t => ({
      themeId: t.themeId,
      themeName: t.themeName,
      count: t.count,
      suggestion: `${t.themeName} — worth reviewing as a potential contributing area (appeared alongside this theme in ${t.count} cases).`,
    }));
}

export function buildRootCauseSummary(themeName, data) {
  const locations = formatLocationConcentration(data?.by_location);
  const count = data?.current_count ?? 0;
  const locationText = locations.length
    ? `Concentration: ${locations.map(l => `${l.location} — ${l.count}`).join(", ")}.`
    : "No single location accounts for enough cases to show a reliable concentration.";
  return `"${themeName}" appears in ${count} case${count === 1 ? "" : "s"} this period. ${locationText}`;
}
