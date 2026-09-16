// Insights Visual Upgrade, Phase 1 — pure, unit-testable logic behind the
// new Reports dashboard (ErReportScreen.jsx). No React, no I/O: every
// aggregation here reads only the already-loaded, RLS-scoped `cases`
// array (plus employeeRecords/caseThemes/organisationThemes, also
// already loaded) — no new Supabase query, no new RPC, no AI call.
//
// Two families of metric, deliberately kept separate throughout this
// module (see the Insights Product & UX Review, §10/§14):
//   - CURRENT STATE (point-in-time): "how many cases are open right now",
//     "how many are overdue right now". Never affected by the selected
//     date range.
//   - PERIOD (activity during a window): "how many opened", "how many
//     closed", "average/median duration of cases closed in this window".
//     These respond to the date range.
// Getting this distinction wrong (the common analytics defect where
// changing "last 30 days" makes today's open-case count disappear) is
// exactly what this module's own function names are split to prevent —
// callers should never need to remember which bucket a metric belongs to.

import { parseFlexDate, daysBetween } from './dateMath.js';

// Same sample-size floor used everywhere else in Insights
// (trendDetection.js, needsAttention.js, appealIntelligence.js, etc.) —
// reused here rather than inventing a second threshold for the same
// "is there enough data to say anything reliable" question.
export const MIN_SAMPLE_SIZE = 3;

// ============================================================================
// Date range
// ============================================================================

export const DATE_RANGE_PRESETS = [
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "6m", label: "Last 6 months", days: 182 },
  { id: "12m", label: "Last 12 months", days: 365 },
];
export const DEFAULT_DATE_RANGE_ID = "90d";

// Resolves a preset id (or "custom" with explicit from/to) into concrete
// {from, to} Date boundaries, half-open [from, to) — matching
// trendDetection.js/caseFilters.js's own createdFrom/createdTo convention
// exactly, so a case is never double-counted or dropped at a boundary
// just because this module used a different edge convention.
export function resolveDateRange(rangeId, custom, now = new Date()) {
  if (rangeId === "custom" && custom?.from && custom?.to) {
    const from = parseFlexDate(custom.from);
    const to = parseFlexDate(custom.to);
    if (from && to && from < to) return { from, to, days: daysBetween(from, to) };
  }
  const preset = DATE_RANGE_PRESETS.find(p => p.id === rangeId) || DATE_RANGE_PRESETS.find(p => p.id === DEFAULT_DATE_RANGE_ID);
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - preset.days);
  return { from, to, days: preset.days };
}

// Short ranges bucket weekly (a 30-day range as daily points is exactly
// the "misleading daily noise" the spec warns against — most days would
// show 0/1 case); longer ranges bucket monthly, so a 12-month view still
// reads as ~12 points, not ~52.
export function bucketGranularityForRange(days) {
  return days <= 90 ? "week" : "month";
}

// ============================================================================
// Filtering — location/case-type, applied before every breakdown/KPI that
// should honour them. Deliberately NOT date-scoped here: date range is
// applied per-metric (current-state metrics never take it; period metrics
// take it explicitly via their own from/to params) rather than by
// pre-filtering the whole `cases` array once, so a caller can never
// accidentally apply the date filter to a current-state metric merely by
// reusing a "filteredCases" variable.
//
// Location is intentionally the same free-text `employeeRecords.location`
// field org_insights_overview()/ErReportScreen's own pre-existing
// breakdown already group by — NOT cases.locationId (a real FK to a
// separate `locations` table Cases' own filter bar uses). These are two
// different "location" concepts in this schema; conflating them would
// silently misfilter. See caseLocationName's own comment.
export function caseLocationName(cs, employeeRecordsByName) {
  return employeeRecordsByName?.[cs.employeeName]?.location || "Not specified";
}

export function applyReportFilters(cases, employeeRecordsByName, filters = {}) {
  return (cases || []).filter(cs => {
    if (filters.caseType && (cs.caseType || "Not specified") !== filters.caseType) return false;
    if (filters.location && caseLocationName(cs, employeeRecordsByName) !== filters.location) return false;
    return true;
  });
}

export function buildEmployeeRecordsByName(employeeRecords) {
  const map = {};
  (employeeRecords || []).forEach(r => { map[r.name] = r; });
  return map;
}

// ============================================================================
// KPIs
// ============================================================================

// CURRENT STATE — never takes a date range. getStage is accepted as a
// param (not imported) to guarantee this always agrees with whichever
// getCaseStage variant the calling screen already receives as its own
// prop — ErReportScreen.jsx has never imported caseStage.js directly.
export function countOpenCases(cases, getStage) {
  return (cases || []).filter(cs => getStage(cs) !== "closed").length;
}

// CURRENT STATE — never takes a date range. overdueCaseIds is the same
// Set needsAttention.js's own computeNeedsAttentionSignals already
// produces; accepted as a param rather than recomputed here so this
// module never risks a second, silently-different definition of
// "overdue" from the one the rest of Insights already trusts.
export function countOverdueCases(overdueCaseIds) {
  return overdueCaseIds ? overdueCaseIds.size : 0;
}

// PERIOD — cases created within [from, to).
export function casesCreatedInRange(cases, from, to) {
  return (cases || []).filter(cs => {
    const created = parseFlexDate(cs.createdAt);
    return created && created >= from && created < to;
  });
}

// PERIOD — same closed-date approximation org_insights_overview() already
// uses in production (updated_at, gated to stage==='closed') — cases.
// has no dedicated closed_at column, so this reuses the existing,
// already-trusted approximation rather than inventing a second one.
export function casesClosedInRange(cases, from, to, getStage) {
  return (cases || []).filter(cs => {
    if (getStage(cs) !== "closed") return false;
    const updated = parseFlexDate(cs.updatedAt);
    return updated && updated >= from && updated < to;
  });
}

// Duration definition unchanged from the existing ErReportScreen/
// OrganisationalIntelligenceOverview convention: closed cases with 2+
// meetings, span = last meeting date minus first. Only the aggregate
// statistic changes (median preferred over mean where the spec allows —
// "prefer MEDIAN... otherwise average, label explicitly, never mislabel
// an average as a median").
function caseDurationDays(cs) {
  const meetings = cs.meetings || [];
  if (meetings.length < 2) return null;
  const dates = meetings.map(m => parseFlexDate(m.savedAt || m.date)).filter(Boolean).sort((a, b) => a - b);
  if (dates.length < 2) return null;
  return daysBetween(dates[0], dates[dates.length - 1]);
}

// PERIOD — restricted to cases closed within [from, to). Returns a
// {stat:"median"|"average", value, sampleSize, caseIds} shape so a caller
// can never accidentally render `value` under the wrong label — the stat
// actually used travels with the number.
export function computeDurationStats(cases, from, to, getStage) {
  const closedInRange = casesClosedInRange(cases, from, to, getStage);
  const withDuration = closedInRange
    .map(cs => ({ cs, days: caseDurationDays(cs) }))
    .filter(d => d.days != null && d.days >= 0);
  if (withDuration.length < MIN_SAMPLE_SIZE) {
    return { stat: null, value: null, sampleSize: withDuration.length, caseIds: withDuration.map(d => d.cs.id) };
  }
  const sorted = withDuration.map(d => d.days).slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { stat: "median", value: median, sampleSize: withDuration.length, caseIds: withDuration.map(d => d.cs.id) };
}

// ============================================================================
// Case ageing — CURRENT STATE, open cases only. Buckets per the approved
// spec (0-30/31-60/61-90/90+) — deliberately a NEW, separate function from
// needsAttention.js's own ageingBands/AGE_BANDS (0-7/8-14/15-30/31-60/61+),
// which uses different bucket edges for a different, already-shipped
// purpose and is left untouched (Phase 1 is bounded to Reports only).
// "Age" here is a fact (days since createdAt), same as needsAttention.js's
// own caseAgeDays — never an SLA claim, and never "time in stage" (Compass
// has no reliable stage-transition history to compute that from).
// ============================================================================

export const AGEING_BUCKETS = [
  { id: "0-30", label: "0–30 days", min: 0, max: 30 },
  { id: "31-60", label: "31–60 days", min: 31, max: 60 },
  { id: "61-90", label: "61–90 days", min: 61, max: 90 },
  { id: "90+", label: "90+ days", min: 91, max: Infinity },
];

export function caseAgeingBucketId(cs, now = new Date()) {
  const created = parseFlexDate(cs.createdAt);
  if (!created) return null;
  const age = daysBetween(created, now);
  if (age == null || age < 0) return null;
  const bucket = AGEING_BUCKETS.find(b => age >= b.min && age <= b.max);
  return bucket ? bucket.id : null;
}

// Open cases only (closed cases have no meaningful "ageing" — they're
// done). Each bucket carries its own caseIds so a click can drill into
// exactly the cases it represents via the existing caseIds deep-link
// mechanism (CasesScreen.jsx), never an approximation.
export function computeAgeingDistribution(cases, getStage, now = new Date()) {
  const open = (cases || []).filter(cs => getStage(cs) !== "closed");
  const byBucket = {};
  AGEING_BUCKETS.forEach(b => { byBucket[b.id] = []; });
  open.forEach(cs => {
    const bucketId = caseAgeingBucketId(cs, now);
    if (bucketId) byBucket[bucketId].push(cs.id);
  });
  return AGEING_BUCKETS.map(b => ({ id: b.id, label: b.label, count: byBucket[b.id].length, caseIds: byBucket[b.id] }));
}

// ============================================================================
// Opened vs closed trend series
// ============================================================================

function startOfWeek(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday-start weeks
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildBucketBounds(from, to, granularity) {
  const bounds = [];
  if (granularity === "week") {
    let cur = startOfWeek(from);
    while (cur < to) {
      const next = new Date(cur);
      next.setDate(next.getDate() + 7);
      bounds.push({ start: new Date(Math.max(cur, from)), end: new Date(Math.min(next, to)), label: cur.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
      cur = next;
    }
  } else {
    let cur = startOfMonth(from);
    while (cur < to) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      bounds.push({ start: new Date(Math.max(cur, from)), end: new Date(Math.min(next, to)), label: cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) });
      cur = next;
    }
  }
  return bounds;
}

// Two-series time trend: opened (by createdAt) vs closed (by the same
// updated_at approximation computeDurationStats/casesClosedInRange use).
// Each point carries its own caseIds for an exact, non-approximated
// drill-down into that bucket via the existing createdFrom/createdTo (for
// opened) or caseIds (for closed, since there is no closedFrom/closedTo
// filter on Cases) deep-link mechanisms.
export function computeOpenedClosedSeries(cases, from, to, granularity, getStage) {
  const bounds = buildBucketBounds(from, to, granularity);
  return bounds.map(b => {
    const opened = casesCreatedInRange(cases, b.start, b.end);
    const closed = casesClosedInRange(cases, b.start, b.end, getStage);
    return {
      label: b.label,
      periodStart: b.start.toISOString(),
      periodEnd: b.end.toISOString(),
      opened: opened.length,
      openedCaseIds: opened.map(cs => cs.id),
      closed: closed.length,
      closedCaseIds: closed.map(cs => cs.id),
    };
  });
}

// ============================================================================
// Generic breakdowns (type/stage/outcome/location/theme) — one shared
// shape so every breakdown chart component can be driven by the same
// {id,label,count,caseIds}[] contract regardless of what it's grouping by.
// Sample-floor suppression (never fabrication) matches the existing
// MIN_BAR_SAMPLE convention in OrganisationalIntelligenceOverview.jsx —
// a bar for a category with under minSample cases is held back, and the
// suppressed count is surfaced as a plain caption, never the category's
// own name.
// ============================================================================

export function computeBreakdown(cases, keyFn, { minSample = MIN_SAMPLE_SIZE, labelFn } = {}) {
  const byKey = {};
  (cases || []).forEach(cs => {
    const key = keyFn(cs);
    if (key == null) return;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(cs.id);
  });
  const all = Object.entries(byKey)
    .map(([key, caseIds]) => ({ id: key, label: labelFn ? labelFn(key) : key, count: caseIds.length, caseIds }))
    .sort((a, b) => b.count - a.count);
  const visible = all.filter(e => e.count >= minSample);
  const suppressedCount = all.length - visible.length;
  return { visible, suppressedCount };
}

export function breakdownByType(cases) {
  return computeBreakdown(cases, cs => cs.caseType || "Not specified");
}
export function breakdownByStage(cases, getStage) {
  return computeBreakdown(cases, cs => getStage(cs));
}
export function breakdownByOutcome(cases) {
  return computeBreakdown((cases || []).filter(cs => cs.outcome), cs => cs.outcome);
}
export function breakdownByLocation(cases, employeeRecordsByName) {
  return computeBreakdown(cases, cs => caseLocationName(cs, employeeRecordsByName));
}

// Theme breakdown — case_themes rows are always HR-confirmed before they
// exist at all (see themes.js's own header on themeFrequency; there is no
// separate "unconfirmed AI suggestion" layer to exclude here), so this
// only needs to scope counts to the currently-filtered `cases` set and
// apply the same sample floor every other breakdown uses. Deliberately
// does NOT call themes.js's own themeFrequency() here: that function
// counts across the full, unfiltered caseThemes table, which would apply
// the minCaseCount floor to the wrong (unfiltered) number whenever a
// location/case-type filter is active — computeBreakdown applies the
// floor to the actual, filtered count instead, matching every other
// breakdown in this module.
export function breakdownByTheme(cases, caseThemes, organisationThemes) {
  const visibleCaseIds = new Set((cases || []).map(cs => cs.id));
  const relevantCaseThemes = (caseThemes || []).filter(ct => visibleCaseIds.has(ct.caseId));
  const nameById = {};
  (organisationThemes || []).forEach(t => { nameById[t.id] = t.name; });
  return computeBreakdown(relevantCaseThemes.map(ct => ({ id: ct.caseId, themeId: ct.themeId })), row => row.themeId, {
    labelFn: themeId => nameById[themeId] || "Unknown theme",
  });
}
