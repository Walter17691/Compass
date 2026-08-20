// Organisational ER Intelligence (Phase 6, OP20, §20) — natural language
// analytics upgrade. sendGlobalChat's "stats" intent previously only
// called org_case_stats() (basic counts by type/stage). This adds real
// data for the spec's own example questions ("Why are grievances
// increasing?", "Which locations have the most overdue investigations?",
// "What are the most common reasons appeals succeed?") by folding in
// org_insights_overview() (OP2/OP4), org_trend_detection() (OP7), and
// appealIntelligence.js's own computeAppealIntelligence (OP11, already
// pure client-side over already-loaded allegations/caseSignals — no new
// RPC needed for that one). Pure formatting only — the actual RPC calls
// stay in App.jsx, matching how org_case_stats() itself is called
// inline there rather than wrapped in a lib function.
import { isSignificantTrend } from './trendDetection';

export function buildGlobalStatsContext(caseStats, overview, trendData, appealData) {
  const parts = ["ORG-WIDE CASE STATISTICS (live database query, scoped to cases you have access to):\n" + JSON.stringify(caseStats)];

  if (overview) {
    parts.push("ORG-WIDE BREAKDOWN — last 90 days (by site/department/manager, avg case duration):\n" + JSON.stringify({
      opened_in_period: overview.opened_in_period,
      closed_in_period: overview.closed_in_period,
      cases_by_location: overview.cases_by_location,
      cases_by_department: overview.cases_by_department,
      cases_by_manager: overview.cases_by_manager,
      avg_case_duration_days: overview.avg_case_duration_days,
      avg_duration_by_location: overview.avg_duration_by_location,
    }));
  }

  if (trendData) {
    const significantTypeTrends = (trendData.by_type_trend || []).filter(isSignificantTrend);
    const significantThemeTrends = (trendData.by_theme_trend || []).filter(isSignificantTrend);
    if (significantTypeTrends.length || significantThemeTrends.length) {
      parts.push("SIGNIFICANT TRENDS — current 90-day period vs previous 90-day period (never state or imply a trend was caused by a named manager, team, or individual — only describe what the data shows):\n" + JSON.stringify({
        by_case_type: significantTypeTrends.map(t => ({ caseType: t.caseType, currentCount: t.currentCount, previousCount: t.previousCount, byLocation: t.byLocation })),
        by_theme: significantThemeTrends.map(t => ({ themeName: t.themeName, currentCount: t.currentCount, previousCount: t.previousCount, byLocation: t.byLocation })),
      }));
    }
  }

  if (appealData && appealData.totalFindings > 0) {
    parts.push("APPEAL INTELLIGENCE (org-wide):\n" + JSON.stringify(appealData));
  }

  return parts.join("\n\n");
}

// Which Insights tab the answer actually drew on — a real reflection of
// what data was used, not a guess. Trend/theme data (if present and
// significant) points to Trends & Themes; every other case (including
// appeal-grounded answers — Appeal Intelligence lives on the
// Organisational Intelligence overview, not its own tab) points to the
// overview dashboard itself.
export function inferInsightsTab(trendData) {
  const hasSignificantTrend = (trendData?.by_type_trend || []).some(isSignificantTrend) || (trendData?.by_theme_trend || []).some(isSignificantTrend);
  if (hasSignificantTrend) return "trends";
  return "overview";
}
