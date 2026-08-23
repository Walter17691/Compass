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
import { APPEAL_MIN_SAMPLE_SIZE } from './appealIntelligence';

// Phase 6.5 hardening (product-principles review) — reused as a real
// system-prompt clause (not just documentation) on the final answer
// call, not only the classifier: the data passed to the model already
// excludes any per-manager breakdown (see cases_by_manager below), but
// an explicit instruction is defense-in-depth against the model
// answering a "how is manager X doing" question from its own general
// reasoning when no manager data was ever in context, or misreading
// ordinary volume/duration numbers as a performance judgment.
export const GLOBAL_CHAT_SYSTEM_PROMPT = "You are Compass, an organisation-wide Employee Relations copilot. Answer only using the data provided below — if a specific number or fact isn't in it, say so rather than guessing or estimating. Never recommend a sanction, disciplinary outcome, or final decision on any specific case. Never rank, score, or evaluate a named manager's or employee's performance, even if asked directly — say that Compass reports on organisational patterns, support needs and process quality only, not individual performance judgments. When discussing statistics, cite only the real numbers given, and never state or imply that a pattern was caused by a named manager, team, or individual — describe correlations as \"a pattern worth reviewing\" or \"appears associated with,\" never as a proven cause. Plain text only — no asterisks, no markdown headers.";

export function buildGlobalStatsContext(caseStats, overview, trendData, appealData) {
  const parts = ["ORG-WIDE CASE STATISTICS (live database query, scoped to cases you have access to):\n" + JSON.stringify(caseStats)];

  if (overview) {
    // cases_by_manager is deliberately excluded — this phase's own
    // cross-cutting constraint is "never score or rank an individual
    // employee or manager," and handing a per-manager case-count
    // breakdown to the assistant would let it answer "which manager has
    // the most cases" directly, the exact thing every other insight in
    // this phase (managerInsights.js, riskMap.js, caseQualityAnalytics.js)
    // is deliberately built to avoid.
    parts.push("ORG-WIDE BREAKDOWN — last 90 days (by site/department, avg case duration):\n" + JSON.stringify({
      opened_in_period: overview.opened_in_period,
      closed_in_period: overview.closed_in_period,
      cases_by_location: overview.cases_by_location,
      cases_by_department: overview.cases_by_department,
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

  // Phase 6.5 hardening (product-principles review) — was `totalFindings
  // > 0`, which handed the model a raw 1-or-2-finding "distribution" (a
  // single appeal outcome/ground presented as if it were a real pattern)
  // with no sample-size signal at all. appealIntelligence.js's own panel
  // already gates each of its three breakdowns behind this same
  // threshold (outcomeSampleSize/stageSampleSize/groundSampleSize) —
  // this brings the AI-facing context in line with the UI's own floor.
  if (appealData && appealData.totalFindings >= APPEAL_MIN_SAMPLE_SIZE) {
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
