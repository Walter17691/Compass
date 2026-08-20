// Organisational ER Intelligence (Phase 6, OP19, §16) — Weekly/Monthly/
// Quarterly ER Review. Reuses execBrief.js's buildExecutiveBriefInputs
// for the shared data (both read the same org_insights_overview()/
// org_trend_detection() RPCs) — this module only adds the period-type
// framing and the richer §16-specific content list (case movements,
// closures, appeals, emerging themes, process delays, manager support
// needs, upcoming risks, recommended actions) on top of it, plus the
// same anti-attribution wording every AI-generated org insight in this
// phase already reuses.
export const PERIOD_TYPES = [
  { id: "weekly", label: "Weekly ER Review", days: 7 },
  { id: "monthly", label: "Monthly People Risk Review", days: 30 },
  { id: "quarterly", label: "Quarterly ER Review", days: 90 },
];

export function periodTypeLabel(periodType) {
  return PERIOD_TYPES.find(p => p.id === periodType)?.label || periodType;
}

const ANTI_ATTRIBUTION_CLAUSE = "If the theme or trend data points to a genuine pattern worth flagging, introduce it with wording like \"Compass has identified a correlation between…\" — never state or imply that a pattern was *caused* by a named manager, team, or individual; only describe what the aggregate, anonymised data shows.";

export function buildPeriodicReviewPrompt(inputs, periodType, highPriorityActive) {
  const label = periodTypeLabel(periodType);
  const typeText = inputs.casesByType.length ? "Case types: " + inputs.casesByType.map(([t, n]) => t + ": " + n).join(", ") + ". " : "";
  const outcomeText = inputs.casesByOutcome.length ? "Outcomes: " + inputs.casesByOutcome.map(([o, n]) => o + ": " + n).join(", ") + ". " : "";
  const durationText = inputs.avgCaseDurationDays != null ? "Average case duration: " + inputs.avgCaseDurationDays + " days. " : "";
  const typeTrendText = inputs.significantTypeTrends.length
    ? "Significant case-type trends this period (current vs previous): " + inputs.significantTypeTrends.map(t => t.caseType + ": " + t.currentCount + " vs " + t.previousCount).join(", ") + ". "
    : "No significant case-type trends this period. ";
  const themeTrendText = inputs.significantThemeTrends.length
    ? "Emerging/significant theme trends this period (current vs previous): " + inputs.significantThemeTrends.map(t => t.themeName + ": " + t.currentCount + " vs " + t.previousCount).join(", ") + ". "
    : "No significant emerging themes this period. ";
  const highPriorityText = highPriorityActive != null ? "High-priority active cases (org-wide, not period-scoped): " + highPriorityActive + ". " : "";

  return "You are a senior HR director preparing a " + label + " for People leadership. Cover: case movements (opened/closed this period), new high-priority cases, key trends, emerging themes, and close with recommended organisational actions for the next period. Be factual, ground every statement in the data given, and never invent a number not provided. Data for this period: Total cases: " + inputs.totalCases + ". Open: " + inputs.openCases + ". Opened this period: " + inputs.openedInPeriod + ". Closed this period: " + inputs.closedInPeriod + ". " + highPriorityText + typeText + outcomeText + durationText + typeTrendText + themeTrendText + ANTI_ATTRIBUTION_CLAUSE + " Structure as: a short paragraph on case movements, a short paragraph on trends/emerging themes, then a 'Recommended actions for next period' list (2-4 bullet points, prefixed with \"- \"). No markdown headers.";
}
