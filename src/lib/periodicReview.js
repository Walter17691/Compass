// Organisational ER Intelligence (Phase 6, OP19, §16) — Weekly/Monthly/
// Quarterly ER Review. Reuses execBrief.js's buildExecutiveBriefInputs
// for the shared data (both read the same org_insights_overview()/
// org_trend_detection() RPCs) — this module only adds the period-type
// framing and the richer §16-specific content list (case movements,
// closures, appeals, emerging themes, process delays, manager support
// needs, upcoming risks, recommended actions) on top of it, plus the
// same anti-attribution wording every AI-generated org insight in this
// phase already reuses.
//
// Insights Phase 6 (Actionability + Executive Reporting) — imports the
// SAME ANTI_ATTRIBUTION_CLAUSE execBrief.js exports rather than keeping
// a second, independently-editable copy of identical text (the two were
// byte-identical before this change; drift between them would be the
// exact "duplicated predicate" failure mode this session has repeatedly
// closed elsewhere, just in prompt wording instead of SQL).
import { ANTI_ATTRIBUTION_CLAUSE } from './execBrief.js';

export const PERIOD_TYPES = [
  { id: "weekly", label: "Weekly ER Review", days: 7 },
  { id: "monthly", label: "Monthly People Risk Review", days: 30 },
  { id: "quarterly", label: "Quarterly ER Review", days: 90 },
];

export function periodTypeLabel(periodType) {
  return PERIOD_TYPES.find(p => p.id === periodType)?.label || periodType;
}

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

  // Insights Phase 6 additions. overallVolume genuinely reflects the
  // selected period (computed with that same periodDays — see
  // PeriodicReviewPanel's own call site), so it's phrased as a period
  // fact like the trend clauses above. pendingHrReview/firstPassApproval/
  // caseQualityIssues/appealSummary are NOT period-windowed (computed
  // over the full current hrReviewRequests/allegations history) —
  // explicitly phrased as "at the time of this review" so the reader
  // never mistakes an all-time/current-state fact for something that
  // occurred only during the selected week/month/quarter (§19).
  const overallVolumeText = inputs.overallVolume
    ? "Overall case volume this period: " + inputs.overallVolume.currentCount + " cases opened" + (inputs.overallVolume.previousCount != null ? " vs " + inputs.overallVolume.previousCount + " in the previous period" : "") + ". "
    : "";

  const pq = inputs.processQuality;
  const pendingText = pq?.pendingHrReview?.count > 0
    ? "At the time of this review, " + pq.pendingHrReview.count + " case" + (pq.pendingHrReview.count === 1 ? " was" : "s were") + " awaiting HR review of its investigation" + (pq.pendingHrReview.oldestPendingDays != null ? " (oldest waiting " + pq.pendingHrReview.oldestPendingDays + " days)" : "") + ". "
    : "";
  const firstPassText = pq?.firstPassApproval?.applicable
    ? "At the time of this review, " + pq.firstPassApproval.rate + "% of investigation submissions had been approved without being returned for further work (" + pq.firstPassApproval.numerator + " of " + pq.firstPassApproval.denominator + " reviewed cases). "
    : (pq?.firstPassApproval && !pq.firstPassApproval.applicable && pq.firstPassApproval.denominator > 0
      ? "Insufficient completed review volume (" + pq.firstPassApproval.denominator + " reviewed case" + (pq.firstPassApproval.denominator === 1 ? "" : "s") + ") for a meaningful first-pass approval rate. "
      : "");
  const caseQualityText = pq?.caseQualityIssues?.length
    ? "At the time of this review, case quality showed: " + pq.caseQualityIssues.map(i => i.count + " case" + (i.count === 1 ? "" : "s") + " — " + i.label.toLowerCase()).join("; ") + ". "
    : "";
  const appealText = inputs.appealSummary
    ? "Across recorded history, " + inputs.appealSummary.appealRate + "% of recorded findings were later appealed (" + inputs.appealSummary.appealedCount + " of " + inputs.appealSummary.totalFindings + " findings). "
    : "";

  return "You are a senior HR director preparing a " + label + " for People leadership. Cover: case movements (opened/closed this period), new high-priority cases, key trends, emerging themes, process quality/HR review state, and close with recommended organisational actions for the next period. Be factual, ground every statement in the data given, never invent a number not provided, and clearly distinguish figures that occurred DURING this period from figures that reflect the CURRENT position at the time this review was generated (marked \"at the time of this review\"). Data for this period: Total cases: " + inputs.totalCases + ". Open: " + inputs.openCases + ". Opened this period: " + inputs.openedInPeriod + ". Closed this period: " + inputs.closedInPeriod + ". " + highPriorityText + typeText + outcomeText + durationText + overallVolumeText + typeTrendText + themeTrendText + pendingText + firstPassText + caseQualityText + appealText + ANTI_ATTRIBUTION_CLAUSE + " Structure as: a short paragraph on case movements, a short paragraph on trends/emerging themes, a short paragraph on process quality/HR review state (only if supplied, clearly marked as the current position at the time of this review), then a 'Recommended actions for next period' list (2-4 bullet points, prefixed with \"- \"). Omit any paragraph with nothing to report. No markdown headers.";
}
