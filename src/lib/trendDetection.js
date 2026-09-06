// Organisational ER Intelligence (Phase 6, OP7, §2) — trend detection.
// Pure logic over org_trend_detection()'s (OP2/OP7's RPC) raw counts.
// Same MIN_SAMPLE_SIZE floor used everywhere else in this phase — a
// trend built on 1-2 cases is either noise or effectively identifying.
// Design System Convergence pass, Phase 5 — exported (value unchanged)
// so empty states can honestly distinguish "not enough case volume yet"
// from "checked, nothing significant" — isSignificantTrend below
// collapses both into a single false, but they're genuinely different
// things to tell HR. Presentation-only use; the threshold itself and
// every calculation using it are untouched.
import { parseFlexDate } from './dateMath.js';

export const MIN_SAMPLE_SIZE = 3;
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

// Insights Phase 3 (Emerging Patterns) — a deliberate SIBLING to
// isSignificantTrend above, not a generalisation of it: that function
// stays increase-only because TrendsPanel/EarlySignalsPanel already
// depend on that exact behaviour and must not change meaning underneath
// them. Same threshold magnitude, symmetric direction — a decrease is
// "significant" past the same 20% the product owner already approved
// for increases.
//
// The sample floor is deliberately on previousCount, not currentCount —
// the mirror image of isSignificantTrend's own floor. A genuine decline
// SHOULD still be flagged even when the current count is small or zero
// (that's the whole point of a decline); what needs to be large enough
// to trust is the BASELINE the decline is measured against. A case type
// that had 2 cases before and 0 now isn't a "material decline," it's
// noise at a tiny scale — MIN_SAMPLE_SIZE on the prior period catches
// exactly that, the same way MIN_SAMPLE_SIZE on the current period
// catches the equivalent noise case for an increase.
export const SIGNIFICANT_DECREASE_PCT = -20;

export function isSignificantDecrease(entry) {
  if (!entry || entry.previousCount < MIN_SAMPLE_SIZE) return false;
  const pct = computePctChange(entry.currentCount, entry.previousCount);
  return pct !== null && pct <= SIGNIFICANT_DECREASE_PCT;
}

// Never assumes causation — the spec's own required phrasing
// ("Compass has identified a pattern…", never "X caused Y"). Describes
// what the aggregate data shows (volume, direction, concentration),
// nothing about why.
export function describeTrend(entry, label) {
  const pct = computePctChange(entry.currentCount, entry.previousCount);
  // Phase 6.5 hardening (closes Prompt 11 audit finding 8.5, MEDIUM) —
  // isSignificantTrend above only floors the TOTAL currentCount; this
  // location breakdown had no per-location floor of its own, so naming
  // "concentrated at Manchester" for a small site directly implies that
  // site's own case count is close to the (small) org-wide total — the
  // same small-cell disclosure risk H18 already closed for the
  // type/site/department/outcome breakdown bars elsewhere in this phase.
  // Same MIN_SAMPLE_SIZE floor this file already uses for the trend as a
  // whole, applied per location too.
  const locations = Object.entries(entry.byLocation || {})
    .filter(([loc, count]) => loc !== "Not specified" && count >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b[1] - a[1]);
  // "Concentrated ACROSS 1 location" doesn't read as English — "across"
  // implies spread over multiple locations. A single location reads
  // naturally as "concentrated at X" instead.
  const locationText = locations.length === 0
    ? "with no location breakdown available yet"
    : locations.length === 1
      ? `concentrated at ${locations[0][0]}`
      : `concentrated across ${locations.length} locations (${locations.map(([loc]) => loc).join(", ")})`;

  if (pct === null) {
    return `Compass has identified a pattern: ${label} had no recorded cases in the previous comparison period, and ${entry.currentCount} in the current period, ${locationText}.`;
  }
  const direction = pct >= 0 ? "increased" : "decreased";
  return `Compass has identified a pattern: ${label} cases ${direction} ${Math.abs(pct)}% compared with the previous period, ${locationText}.`;
}

// Insights Phase 3 (Emerging Patterns), Signal 1 — overall case-volume
// trend. Deliberately NOT built from org_trend_detection's by_type_trend
// above: that RPC's own SQL excludes any case with a null/blank
// case_type from both its current and previous counts
// (`where case_type is not null and case_type <> ''` — see
// supabase/multi_tenant_analytics_invariant_2026-08-25.sql), and a
// case_type can genuinely be blank in real data — the "+ New meeting"
// quick-start flow (App.jsx's saveMeetingToCase) creates a brand-new
// case with no caseType at all unless it's linked to a referral, saved
// as case_type: "" via saveCaseToDB's own `caseObj.caseType || ""`
// mapping. Summing by_type_trend would silently undercount every case
// created that way. "Overall volume" instead counts every case in the
// already-loaded, RLS-scoped `cases` array by cases.createdAt alone —
// no case_type filter, no stage filter (a case opened in the period
// still counts even if it has since closed; this metric measures case
// CREATION, not current open/closed status).
//
// Window boundaries deliberately mirror org_trend_detection's own SQL
// exactly:
//   current period  = [now - periodDays days, now)
//   previous period = [now - periodDays*2 days, now - periodDays days)
// i.e. half-open (lower bound inclusive, upper bound exclusive), both
// windows anchored on the same instant so they tile with no gap and no
// overlap — identical in shape to the RPC's own cur_start/cur_end/
// prev_start/prev_end CTEs. `now` defaults to the real current time;
// pass it explicitly in tests for determinism. This is a plain
// millisecond-interval subtraction, matching the RPC's own
// `now() - interval 'N days'` to the precision that matters for a
// 20%-threshold, day-granularity comparison — it is not a calendar-day/
// timezone-aware reconstruction, because the RPC itself isn't one
// either (it runs on the database's own now() instant).
//
// Exported separately (Insights Phase 3, drill-down stage) so a caller
// that needs the exact same boundaries computeOverallVolumeTrend used —
// e.g. to build a Cases drill-down date-range filter that must return
// precisely the cases counted in the displayed number — can get them
// without reconstructing the arithmetic a second time. Always call this
// with the SAME `now` value used for the calculation itself (freeze it
// once per component render/lifecycle) — computing a fresh `new Date()`
// separately for the drill-down would very rarely disagree with the
// displayed count at the exact boundary instant.
export function getTrendPeriodBounds(now = new Date(), periodDays = 90) {
  const curEnd = now.getTime();
  const curStart = curEnd - periodDays * 24 * 60 * 60 * 1000;
  const prevEnd = curStart;
  const prevStart = curEnd - periodDays * 2 * 24 * 60 * 60 * 1000;
  return {
    curStart: new Date(curStart), curEnd: new Date(curEnd),
    prevStart: new Date(prevStart), prevEnd: new Date(prevEnd),
  };
}

export function computeOverallVolumeTrend(cases, { now = new Date(), periodDays = 90 } = {}) {
  const { curStart, curEnd, prevStart, prevEnd } = getTrendPeriodBounds(now, periodDays);
  const curStartMs = curStart.getTime(), curEndMs = curEnd.getTime();
  const prevStartMs = prevStart.getTime(), prevEndMs = prevEnd.getTime();

  let currentCount = 0;
  let previousCount = 0;
  (cases || []).forEach(cs => {
    const created = parseFlexDate(cs.createdAt);
    if (!created) return;
    const t = created.getTime();
    if (t >= curStartMs && t < curEndMs) currentCount++;
    else if (t >= prevStartMs && t < prevEndMs) previousCount++;
  });

  return { currentCount, previousCount, pctChange: computePctChange(currentCount, previousCount) };
}

// Insights Phase 3 (Emerging Patterns) — wording sibling to describeTrend
// above, for computeOverallVolumeTrend's output specifically. Originally
// lived in OrganisationalIntelligenceOverview.jsx (Overview-specific
// sentence, separate from this module's calculation/gating); moved here
// in Insights Phase 4 so TrendsPanel.jsx can reuse the exact same wording
// for its own overall-volume headline without a second, independently-
// drifting copy — and so a component file exporting it doesn't trip the
// "only export components" fast-refresh lint rule. Deliberately measures
// case CREATION only ("were opened") — never "risk", "incidence", or
// "deteriorated"/"improved", since no headcount denominator or causal
// evidence exists anywhere in this data to support those words.
export function describeVolumeSignal({ currentCount, previousCount, pctChange, subject }) {
  const noun = `${subject ? subject + " " : ""}case${currentCount === 1 ? "" : "s"}`;
  const verb = currentCount === 1 ? "was" : "were";
  if (pctChange === null) {
    return `${currentCount} ${noun} ${verb} opened in the last 90 days, compared with none in the previous 90 days.`;
  }
  const direction = pctChange >= 0 ? "up" : "down";
  return `${currentCount} ${noun} ${verb} opened in the last 90 days, ${direction} ${Math.abs(pctChange)}% from ${previousCount} in the previous 90 days.`;
}

// Insights Phase 3 (Emerging Patterns), Signal 2 — deterministic ranking
// of case-type entries from org_trend_detection's by_type_trend that
// clear either significance gate (isSignificantTrend for an increase,
// isSignificantDecrease for a decline). Deliberately does not recompute
// or duplicate either gate's own logic — this only selects and orders
// entries that already passed one of them.
//
// Ranked by magnitude of change, strongest first: a brand-new pattern
// (previousCount=0, pctChange=null) is treated as the strongest possible
// signal — a category that didn't exist last period and now does is more
// decision-relevant than any bounded percentage — then the rest by
// |pctChange| descending. Ties (including multiple null-pctChange
// entries) break alphabetically by caseType, so the ordering never
// depends on object/array insertion order and is stable across renders.
export function rankSignificantCaseTypeChanges(byTypeTrend) {
  return (byTypeTrend || [])
    .filter(entry => isSignificantTrend(entry) || isSignificantDecrease(entry))
    .map(entry => ({
      caseType: entry.caseType,
      currentCount: entry.currentCount,
      previousCount: entry.previousCount,
      pctChange: computePctChange(entry.currentCount, entry.previousCount),
      direction: computePctChange(entry.currentCount, entry.previousCount) === null || computePctChange(entry.currentCount, entry.previousCount) >= 0 ? "increase" : "decrease",
    }))
    .sort((a, b) => {
      const magA = a.pctChange === null ? Infinity : Math.abs(a.pctChange);
      const magB = b.pctChange === null ? Infinity : Math.abs(b.pctChange);
      if (magA !== magB) return magB - magA;
      return String(a.caseType).localeCompare(String(b.caseType));
    });
}

// Insights Phase 4 (Trends & Themes) — same significance gate and
// magnitude-descending/alphabetical-tie-break ordering as
// rankSignificantCaseTypeChanges above, but deliberately does NOT remap
// the entry shape: TrendsPanel's existing "Explore"/"Show evidence"/
// describeTrend consumers need the original themeId/themeName/byLocation
// fields intact, not a caseType-shaped projection. This is a genuine
// scope extension of what TrendsPanel already rendered (isSignificantTrend
// only, in RPC current-count order) to also surface material declines
// (isSignificantDecrease), in a stable, decision-relevant order instead
// of the RPC's own raw current-count ordering — the deep-dive tab
// deliberately shows the complete significant list, never a top-N slice.
export function rankSignificantThemeTrends(byThemeTrend) {
  return (byThemeTrend || [])
    .filter(entry => isSignificantTrend(entry) || isSignificantDecrease(entry))
    .slice()
    .sort((a, b) => {
      const pctA = computePctChange(a.currentCount, a.previousCount);
      const pctB = computePctChange(b.currentCount, b.previousCount);
      const magA = pctA === null ? Infinity : Math.abs(pctA);
      const magB = pctB === null ? Infinity : Math.abs(pctB);
      if (magA !== magB) return magB - magA;
      return String(a.themeName).localeCompare(String(b.themeName));
    });
}

// Insights Phase 4 (Trends & Themes drill-down) — resolves a theme
// trend's currentCount back into the exact case ids it counted, so a
// theme signal is never a dead end. Deliberately mirrors
// org_trend_detection's own by_theme_trend semantics exactly (see
// supabase/multi_tenant_analytics_invariant_2026-08-25.sql's
// current_theme_cases/theme_current CTEs): a case counts if ITS OWN
// created_at falls in the period — case_themes carries no timestamp the
// RPC ever filters on, so the theme LINK's own age is irrelevant here,
// only the case's. Deduplicates by case id, mirroring the RPC's own
// `count(distinct case_id)` — a case tagged via more than one case_themes
// row for the same theme must still surface as one case. Only ever
// consults the `cases` array already passed in (the caller's own
// RLS-scoped, already-authorised data) — a case_themes row referencing a
// case absent from that array (never visible to this caller) is silently
// skipped, never reconstructed.
export function themeCaseIdsInPeriod(cases, caseThemes, themeId, { curStart, curEnd }) {
  const curStartMs = curStart.getTime(), curEndMs = curEnd.getTime();
  const taggedCaseIds = new Set(
    (caseThemes || []).filter(t => t.themeId === themeId).map(t => t.caseId)
  );
  const ids = new Set();
  (cases || []).forEach(cs => {
    if (!taggedCaseIds.has(cs.id)) return;
    const created = parseFlexDate(cs.createdAt);
    if (!created) return;
    const t = created.getTime();
    if (t >= curStartMs && t < curEndMs) ids.add(cs.id);
  });
  return Array.from(ids);
}
