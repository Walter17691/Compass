// Organisational ER Intelligence (Phase 6, OP23, §19) — impact tracking.
// Pure logic over org_trend_detection()'s (OP7's RPC) raw counts, called
// with p_period_days set to the real number of days since an
// improvement_initiatives (OP22) row's completed_at — see
// supabase/improvement_initiative_impact_2026-08-21.sql's own header for
// why that genuinely reuses OP7's trend engine rather than needing a new
// RPC. Deliberately a separate module from trendDetection.js:
// isSignificantTrend only flags increases (Trends/Early Signals exist to
// surface emerging problems), but impact tracking's whole point is
// noticing a DECREASE following an intervention — the opposite
// direction — so it needs its own significance gate, not a reused one
// that would filter out the very outcome this is looking for.
import { computePctChange } from './trendDetection.js';
import { daysBetween } from './dateMath.js';

export const MIN_DAYS_SINCE_COMPLETION = 7;
// A real prior baseline is needed to say anything meaningful about
// change — gated on the BEFORE count, not the after count, since the
// best-case outcome of a successful initiative is the after count
// dropping toward zero, which must never itself suppress the result.
const MIN_PRIOR_SAMPLE = 3;

// Was its own Math.floor((now-then)/DAY_MS): an unparseable/invalid
// dateIso silently produced NaN (Math.max(0, NaN) is NaN, not 0), which
// defeated ImpactView's own `if (days === null) return null` guard and
// rendered "Not enough time has passed... (NaN of 7 days)". Delegating
// to the shared, DST-safe dateMath.daysBetween restores the
// null-on-invalid contract every other consumer in this phase relies on.
export function daysSince(dateIso, now = new Date()) {
  const diff = daysBetween(dateIso, now);
  return diff === null ? null : Math.max(0, diff);
}

export function findMetricTrendEntry(trendData, metricKind, metricValue) {
  if (!trendData || !metricKind || !metricValue) return null;
  if (metricKind === "theme") {
    return (trendData.by_theme_trend || []).find(e => e.themeId === metricValue) || null;
  }
  return (trendData.by_type_trend || []).find(e => e.caseType === metricValue) || null;
}

export function hasEnoughDataForImpact(entry) {
  return !!entry && entry.previousCount >= MIN_PRIOR_SAMPLE;
}

// Required framing throughout: "rates decreased/increased following
// [this initiative]," and an explicit non-causal disclaimer — never "X
// caused Y", matching this phase's own cross-cutting constraint.
export function describeImpact(label, entry, windowDays) {
  const pct = computePctChange(entry.currentCount, entry.previousCount);
  const disclaimer = "Compass has identified a pattern worth reviewing — this is not a confirmed causal outcome.";
  if (pct === null) {
    return `${label} had no recorded cases in the ${windowDays} days before this initiative's completion, and ${entry.currentCount} in the ${windowDays} days since. ${disclaimer}`;
  }
  if (pct === 0) {
    return `${label} case volume was unchanged following this initiative's completion (${entry.previousCount} in the ${windowDays} days before, ${entry.currentCount} in the ${windowDays} days since).`;
  }
  const direction = pct < 0 ? "decreased" : "increased";
  return `${label} rates ${direction} ${Math.abs(pct)}% following this initiative's completion (${entry.previousCount} in the ${windowDays} days before, ${entry.currentCount} in the ${windowDays} days since). ${disclaimer}`;
}
