// Organisational ER Intelligence (Phase 6, OP8, §4) — root-cause
// exploration. Pure formatting over org_theme_root_cause()'s (OP8's
// RPC) raw counts/co-occurring-theme list. Deliberately does NOT map a
// theme name to a specific recommended action (an HR-defined taxonomy
// can have any name; a hardcoded name->action table would be fabricated
// precision) — "potential areas for review" is a generic, honest
// transformation of what the data actually shows: which OTHER themes
// keep showing up alongside this one.

export function formatLocationConcentration(byLocation) {
  return Object.entries(byLocation || {})
    .filter(([loc]) => loc !== "Not specified")
    .sort((a, b) => b[1] - a[1])
    .map(([location, count]) => ({ location, count }));
}

// Never a proven cause — framed as an area to investigate, matching the
// spec's own required framing exactly.
export function buildReviewAreas(coOccurringThemes) {
  return (coOccurringThemes || []).map(t => ({
    themeId: t.themeId,
    themeName: t.themeName,
    count: t.count,
    suggestion: `${t.themeName} — worth reviewing as a potential contributing area (appeared alongside this theme in ${t.count} case${t.count === 1 ? "" : "s"}).`,
  }));
}

export function buildRootCauseSummary(themeName, data) {
  const locations = formatLocationConcentration(data?.by_location);
  const count = data?.current_count ?? 0;
  const locationText = locations.length
    ? `Concentration: ${locations.map(l => `${l.location} — ${l.count}`).join(", ")}.`
    : "No location breakdown available yet.";
  return `"${themeName}" appears in ${count} case${count === 1 ? "" : "s"} this period. ${locationText}`;
}
