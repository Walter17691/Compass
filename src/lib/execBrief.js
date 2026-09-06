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
//
// Insights Phase 6 (Actionability + Executive Reporting) — extends the
// above with the validated Phases 2-5 client-side signals (Needs
// Attention, overall case-volume movement, theme movements including
// declines, HR-review queue, first-pass approval, case-quality issues,
// appeal summary), reusing each phase's own pure calculation exactly as
// already shipped — never a re-derived or duplicated formula. Every new
// field is additive only: a supporting_data row persisted before this
// change simply lacks these keys, and both buildExecutiveBriefPrompt
// below and ExecutiveBriefPanel's own SupportingData renderer already
// treat an absent/empty field as "nothing to report" rather than an
// error (see each new clause's own null/empty guard).
import { isSignificantTrend, isSignificantDecrease, computeOverallVolumeTrend, rankSignificantCaseTypeChanges, rankSignificantThemeTrends } from './trendDetection.js';
import { computeNeedsAttentionSignals, medianOpenCaseAge } from './needsAttention.js';
import { computePendingHrReview, computeFirstPassApprovalRate } from './hrReviewIntelligence.js';
import { computeCaseQualityAnalytics, CASE_QUALITY_MIN_SAMPLE_SIZE } from './caseQualityAnalytics.js';
import { computeAppealIntelligence } from './appealIntelligence.js';

// Exported (not just used locally) so periodicReview.js's own prompt
// shares the exact same guardrail text rather than maintaining an
// independently-editable copy — the same "one authoritative source, no
// duplicated predicate to drift" discipline already applied throughout
// this session's RLS work, here applied to prompt safety wording
// instead of SQL. Insights Phase 6, §17 — strengthened with explicit
// bans on: inventing numbers, causal inference, workforce-incidence
// claims without a supplied denominator, using "risk" for anything
// other than a genuine Risk Map flag, restating a sample-limited/not-
// applicable rate as a percentage anyway, rephrasing an appeal rate's
// actual (findings-based) denominator, and referencing any individual
// case's content.
export const ANTI_ATTRIBUTION_CLAUSE = "Treat every figure above as a supplied fact — never invent, estimate, or round a number that wasn't given. Do not infer causation from correlation. If the theme or trend data points to a genuine pattern worth flagging, introduce it with wording like \"Compass has identified a correlation between…\" — never state or imply that a pattern was *caused* by a named manager, team, or individual, and never attribute any figure to a specific person. Do not infer workforce-wide incidence, prevalence, or a rate without an explicit denominator being supplied above. Only use the word \"risk\" for a figure explicitly described as a Risk Map flag — describe every other change as a fact or a pattern (e.g. \"cases increased\", never \"risk increased\"). Where a rate is marked as not meaningful due to limited sample size, say so plainly rather than stating a percentage anyway. Where an appeal figure is described as \"of recorded findings\", report it exactly that way — never rephrase it as \"of cases\" or \"of the caseload\". Do not reference or imply access to any individual case's content, employee name, allegation text, evidence, or review comments — only the aggregate counts supplied.";

function topEntries(obj, limit = 5) {
  return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// orgData carries the same already-loaded, already-authorised client
// arrays every other Insights Phase 2-5 surface already reads (cases,
// dueSoon, hrReviewRequests, allegations, caseSignals, caseTasks,
// policies, caseAccess, orgMembers) — no new query. periodDays lets a
// caller (PeriodicReviewPanel) match the overall-volume window to the
// SAME period its own org_trend_detection call already used; defaults
// to 90 to match ExecutiveBriefPanel's own existing hardcoded trend
// window. Every derived block is independently null/empty-guarded so a
// caller that omits orgData entirely (or omits one array within it)
// degrades to "nothing to report" for that block, never a crash.
export function buildExecutiveBriefInputs(overview, trendData, orgData = {}) {
  const { cases, dueSoon, hrReviewRequests, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers, periodDays = 90, now = new Date() } = orgData;

  // Insights Phase 6 — upgrades both fields in place to the Phase 3/4
  // ranking functions (magnitude-ranked, decrease-aware) rather than the
  // original increase-only isSignificantTrend filter. Field NAME and
  // stripped {caseType/themeName, currentCount, previousCount} shape are
  // unchanged, so both SupportingData's existing rendering and any
  // historical persisted row (built by the old, increase-only filter)
  // keep rendering exactly as before — this is a one-time upgrade of
  // what gets computed going forward, not a breaking shape change.
  const significantTypeTrends = rankSignificantCaseTypeChanges(trendData?.by_type_trend);
  const significantThemeTrends = rankSignificantThemeTrends(trendData?.by_theme_trend);

  // The ONE aggregate "how is overall case volume moving" fact — Phase 3
  // named it "overall volume trend", Phase 4 named the identical concept
  // its own "overall-volume headline"; included once here under one name
  // rather than duplicated under both, per the Phase 6 audit's own §14
  // finding.
  const overallVolumeRaw = cases ? computeOverallVolumeTrend(cases, { now, periodDays }) : null;
  const overallVolume = overallVolumeRaw && (isSignificantTrend(overallVolumeRaw) || isSignificantDecrease(overallVolumeRaw))
    ? { currentCount: overallVolumeRaw.currentCount, previousCount: overallVolumeRaw.previousCount, pctChange: overallVolumeRaw.pctChange }
    : null;

  const needsAttentionRaw = cases ? computeNeedsAttentionSignals({ cases, dueSoon, now }) : null;
  const medianAge = cases ? medianOpenCaseAge(cases, now) : { applicable: false };
  const needsAttention = needsAttentionRaw ? {
    overdueCount: needsAttentionRaw.overdueCount,
    olderThan30Count: needsAttentionRaw.olderThan30Count,
    concentration: needsAttentionRaw.concentration,
    medianOpenCaseAgeDays: medianAge.applicable ? medianAge.median : null,
  } : null;

  const pendingHrReview = hrReviewRequests ? computePendingHrReview(hrReviewRequests, now) : null;
  const firstPassApproval = hrReviewRequests ? computeFirstPassApprovalRate(hrReviewRequests) : null;
  // Top 3 issues only, and only once the panel's own whole-surface
  // sample floor is cleared — matches CaseQualityAnalyticsPanel's own
  // gating exactly. label/count/pct only, never the underlying caseIds
  // (which exist purely for the UI's own "View cases" drill-down and
  // have no place in a narrative report).
  const caseQualityIssues = (cases && allegations) ? (() => {
    const analytics = computeCaseQualityAnalytics(cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers);
    if (analytics.totalCases < CASE_QUALITY_MIN_SAMPLE_SIZE) return [];
    return analytics.issues.slice(0, 3).map(i => ({ label: i.label, count: i.count, pct: i.pct }));
  })() : [];

  // Insights Phase 6, §14 — deliberately does NOT read
  // managerInsights.js's own investigationsReturnedForRework (the
  // cruder, non-case-deduplicated, denominator-less duplicate of this
  // same underlying fact); firstPassApproval above is the one
  // authoritative source for "cases returned for further work."
  const appealRaw = allegations ? computeAppealIntelligence(allegations, cases, caseSignals) : null;
  const appealSummary = appealRaw && appealRaw.appealRate !== null
    ? { appealRate: appealRaw.appealRate, appealedCount: appealRaw.appealedCount, totalFindings: appealRaw.totalFindings }
    : null;

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
    overallVolume,
    needsAttention,
    processQuality: { pendingHrReview, firstPassApproval, caseQualityIssues },
    appealSummary,
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

  // Insights Phase 6 additions — every clause below is conditional on
  // its own signal actually being present, matching the existing
  // typeTrendText/themeTrendText convention above: silence over filler.
  const overallVolumeText = inputs.overallVolume
    ? "Overall case volume: " + inputs.overallVolume.currentCount + " cases opened in the current period" + (inputs.overallVolume.previousCount != null ? " vs " + inputs.overallVolume.previousCount + " in the previous period" : "") + ". "
    : "";

  const na = inputs.needsAttention;
  const needsAttentionText = na && (na.overdueCount > 0 || na.olderThan30Count > 0 || na.concentration || na.medianOpenCaseAgeDays != null)
    ? "Needs attention: " + [
        na.overdueCount > 0 && na.overdueCount + " case" + (na.overdueCount === 1 ? "" : "s") + " with an overdue action",
        na.olderThan30Count > 0 && na.olderThan30Count + " open case" + (na.olderThan30Count === 1 ? "" : "s") + " older than 30 days",
        na.concentration && na.concentration.caseType + " accounts for " + na.concentration.pct + "% of the open caseload (" + na.concentration.count + " of " + na.concentration.totalOpen + ")",
        na.medianOpenCaseAgeDays != null && "median open case age " + na.medianOpenCaseAgeDays + " days",
      ].filter(Boolean).join(", ") + ". "
    : "";

  const pq = inputs.processQuality;
  const pendingText = pq?.pendingHrReview?.count > 0
    ? pq.pendingHrReview.count + " case" + (pq.pendingHrReview.count === 1 ? " is" : "s are") + " currently awaiting HR review of its investigation" + (pq.pendingHrReview.oldestPendingDays != null ? " (oldest waiting " + pq.pendingHrReview.oldestPendingDays + " days)" : "") + ". "
    : "";
  const firstPassText = pq?.firstPassApproval?.applicable
    ? pq.firstPassApproval.rate + "% of investigation submissions were approved without being returned for further work (" + pq.firstPassApproval.numerator + " of " + pq.firstPassApproval.denominator + " reviewed cases). "
    : (pq?.firstPassApproval && !pq.firstPassApproval.applicable && pq.firstPassApproval.denominator > 0
      ? "Insufficient completed review volume (" + pq.firstPassApproval.denominator + " reviewed case" + (pq.firstPassApproval.denominator === 1 ? "" : "s") + ") for a meaningful first-pass approval rate. "
      : "");
  const caseQualityText = pq?.caseQualityIssues?.length
    ? "Case quality: " + pq.caseQualityIssues.map(i => i.count + " case" + (i.count === 1 ? "" : "s") + " — " + i.label.toLowerCase()).join("; ") + ". "
    : "";

  const appealText = inputs.appealSummary
    ? inputs.appealSummary.appealRate + "% of recorded findings were later appealed (" + inputs.appealSummary.appealedCount + " of " + inputs.appealSummary.totalFindings + " findings). "
    : "";

  return "You are a senior HR director writing an ER Executive Brief for People Directors and senior leadership. Be factual and highlight key patterns and recommendations. "
    + "Current position: Total cases: " + inputs.totalCases + ". Open: " + inputs.openCases + ". Opened this period: " + inputs.openedInPeriod + ". Closed this period: " + inputs.closedInPeriod + ". " + typeText + outcomeText + durationText
    + needsAttentionText
    + overallVolumeText + typeTrendText + themeTrendText
    + pendingText + firstPassText + caseQualityText + appealText
    + ANTI_ATTRIBUTION_CLAUSE
    + " Structure the brief as: a short paragraph on the current position, a short paragraph on what needs attention (only if any was supplied), a short paragraph on meaningful changes/trends (only if any were supplied), a short paragraph on process quality and HR review (only if any was supplied), then end with a short 'Recommended areas for leadership attention' list (2-4 bullet points, prefixed with \"- \"). Omit any paragraph with nothing to report rather than padding it. Write 3-4 paragraphs before the list. No markdown headers.";
}
