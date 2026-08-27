// Organisational ER Intelligence (Phase 6, OP18, §15) — ER Executive
// Brief. Reuses ErReportScreen.jsx's own existing anti-attribution
// prompt wording verbatim (the exact sentence already proven in
// production since Phase 18), grounded in real, RPC-backed data:
// org_insights_overview() (OP2/OP4, correct across an org's FULL case
// table, not the client-side array's own row cap) plus
// org_trend_detection()'s significant trends (OP7). "Drill-down" is a
// deterministic listing of what actually grounded the brief —
// supporting_data below is exactly what got fed into the prompt, not
// an AI-guessed per-sentence link.
import { isSignificantTrend } from './trendDetection.js';

const ANTI_ATTRIBUTION_CLAUSE = "If the theme or trend data points to a genuine pattern worth flagging, introduce it with wording like \"Compass has identified a correlation between…\" — never state or imply that a pattern was *caused* by a named manager, team, or individual; only describe what the aggregate, anonymised data shows.";

function topEntries(obj, limit = 5) {
  return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function buildExecutiveBriefInputs(overview, trendData) {
  const significantTypeTrends = (trendData?.by_type_trend || []).filter(isSignificantTrend);
  const significantThemeTrends = (trendData?.by_theme_trend || []).filter(isSignificantTrend);
  return {
    totalCases: overview?.total_cases ?? 0,
    openCases: overview?.open_cases ?? 0,
    openedInPeriod: overview?.opened_in_period ?? 0,
    closedInPeriod: overview?.closed_in_period ?? 0,
    casesByType: topEntries(overview?.cases_by_type),
    casesByOutcome: topEntries(overview?.cases_by_outcome),
    avgCaseDurationDays: overview?.avg_case_duration_days ?? null,
    significantTypeTrends: significantTypeTrends.map(t => ({ caseType: t.caseType, currentCount: t.currentCount, previousCount: t.previousCount })),
    significantThemeTrends: significantThemeTrends.map(t => ({ themeName: t.themeName, currentCount: t.currentCount, previousCount: t.previousCount })),
  };
}

export function buildExecutiveBriefPrompt(inputs) {
  const typeText = inputs.casesByType.length ? "Case types: " + inputs.casesByType.map(([t, n]) => t + ": " + n).join(", ") + ". " : "";
  const outcomeText = inputs.casesByOutcome.length ? "Outcomes: " + inputs.casesByOutcome.map(([o, n]) => o + ": " + n).join(", ") + ". " : "";
  const durationText = inputs.avgCaseDurationDays != null ? "Average case duration: " + inputs.avgCaseDurationDays + " days. " : "";
  const typeTrendText = inputs.significantTypeTrends.length
    ? "Significant case-type trends (current period count vs previous period count): " + inputs.significantTypeTrends.map(t => t.caseType + ": " + t.currentCount + " vs " + t.previousCount).join(", ") + ". "
    : "";
  const themeTrendText = inputs.significantThemeTrends.length
    ? "Significant theme trends (current period count vs previous period count): " + inputs.significantThemeTrends.map(t => t.themeName + ": " + t.currentCount + " vs " + t.previousCount).join(", ") + ". "
    : "";

  return "You are a senior HR director writing an ER Executive Brief for People Directors and senior leadership. Be factual and highlight key risks, patterns and recommendations. Data: Total cases: " + inputs.totalCases + ". Open: " + inputs.openCases + ". Opened this period: " + inputs.openedInPeriod + ". Closed this period: " + inputs.closedInPeriod + ". " + typeText + outcomeText + durationText + typeTrendText + themeTrendText + ANTI_ATTRIBUTION_CLAUSE + " End with a short 'Recommended areas for leadership attention' list (2-4 bullet points, prefixed with \"- \"). Write 3-4 paragraphs before the list. No markdown headers.";
}
