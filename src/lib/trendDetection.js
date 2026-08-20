// Organisational ER Intelligence (Phase 6, OP7, §2) — trend detection.
// Pure logic over org_trend_detection()'s (OP2/OP7's RPC) raw counts.
// Same MIN_SAMPLE_SIZE floor used everywhere else in this phase — a
// trend built on 1-2 cases is either noise or effectively identifying.
const MIN_SAMPLE_SIZE = 3;
const SIGNIFICANT_INCREASE_PCT = 20;

// null means "no comparable prior-period data" (previousCount was 0),
// distinct from a real 0% change — describeTrend below treats these
// differently ("no recorded cases previously" vs "unchanged").
export function computePctChange(currentCount, previousCount) {
  if (previousCount === 0) return currentCount > 0 ? null : 0;
  return Math.round(((currentCount - previousCount) / previousCount) * 100);
}

export function isSignificantTrend(entry) {
  if (!entry || entry.currentCount < MIN_SAMPLE_SIZE) return false;
  const pct = computePctChange(entry.currentCount, entry.previousCount);
  return pct === null || pct >= SIGNIFICANT_INCREASE_PCT;
}

// Never assumes causation — the spec's own required phrasing
// ("Compass has identified a pattern…", never "X caused Y"). Describes
// what the aggregate data shows (volume, direction, concentration),
// nothing about why.
export function describeTrend(entry, label) {
  const pct = computePctChange(entry.currentCount, entry.previousCount);
  const locations = Object.entries(entry.byLocation || {})
    .filter(([loc]) => loc !== "Not specified")
    .sort((a, b) => b[1] - a[1]);
  const locationText = locations.length
    ? `concentrated across ${locations.length} location${locations.length === 1 ? "" : "s"} (${locations.map(([loc]) => loc).join(", ")})`
    : "with no location breakdown available yet";

  if (pct === null) {
    return `Compass has identified a pattern: ${label} had no recorded cases in the previous comparison period, and ${entry.currentCount} in the current period, ${locationText}.`;
  }
  const direction = pct >= 0 ? "increased" : "decreased";
  return `Compass has identified a pattern: ${label} cases ${direction} ${Math.abs(pct)}% compared with the previous period, ${locationText}.`;
}
