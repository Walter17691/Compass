// Insights Phase 2, Overview Intelligence — pure calculations behind the
// Executive Summary / Needs Attention / Cases Requiring Attention sections
// of OrganisationalIntelligenceOverview.jsx. No React, no I/O, so every
// rule here is unit-testable in isolation and reusable if a future phase
// needs the same figures elsewhere.
//
// "Open" is deliberately not redefined here: getCaseStage(cs) !== "closed"
// is the same authoritative definition deadlines.js's computeDueSoon and
// CasesScreen's own "attention"/"closed" segments already use — see
// caseStage.js. Overdue status is likewise never recomputed: it is read
// from the dueSoon array computeDueSoon() already produces, exactly as
// OrganisationalIntelligenceOverview.jsx's own headline sentence already
// does (`dueSoon.filter(d => d.overdue && d.caseId)`).
//
// Age is a FACT (days since cases.created_at, the one reliable creation
// timestamp — see lib/caseMapping.js). Nothing here labels a case "late",
// "at risk", or "stalled" from age alone; OLD_CASE_THRESHOLD_DAYS names an
// ageing bucket, not an SLA breach.
import { getCaseStage } from './caseStage.js';
import { daysBetween, parseFlexDate } from './dateMath.js';
import { MIN_SAMPLE_SIZE } from './trendDetection.js';

export const OLD_CASE_THRESHOLD_DAYS = 30;

// Product decision (Insights Phase 2 approval): a case-type concentration
// is only surfaced as an outright majority of the open caseload, not
// merely the largest category — 50% is a clear, defensible "more than
// everything else combined" bar. No existing repo convention covered a
// share-of-total threshold (MIN_SAMPLE_SIZE elsewhere only gates "is there
// enough data to say anything at all"), so this was confirmed with the
// product owner rather than invented silently.
export const CONCENTRATION_THRESHOLD_PCT = 50;

export const AGE_BANDS = [
  { id: "0-7", label: "0–7 days", min: 0, max: 7 },
  { id: "8-14", label: "8–14 days", min: 8, max: 14 },
  { id: "15-30", label: "15–30 days", min: 15, max: 30 },
  { id: "31-60", label: "31–60 days", min: 31, max: 60 },
  { id: "61+", label: "61+ days", min: 61, max: Infinity },
];

export function isOpenCase(cs) {
  return getCaseStage(cs) !== "closed";
}

export function openCases(cases) {
  return (cases || []).filter(isOpenCase);
}

// null for a missing/unparseable creation date or a case whose recorded
// creation date is in the future (bad data) — callers filter these out
// rather than let a negative age corrupt a median or band count.
export function caseAgeDays(cs, now = new Date()) {
  const created = parseFlexDate(cs.createdAt);
  if (!created) return null;
  const age = daysBetween(created, now);
  return age != null && age >= 0 ? age : null;
}

function openCaseAges(cases, now) {
  return openCases(cases)
    .map(cs => caseAgeDays(cs, now))
    .filter(age => age != null)
    .sort((a, b) => a - b);
}

// Same MIN_SAMPLE_SIZE=3 floor used throughout Insights (trendDetection.js,
// appealIntelligence.js, outcomeConsistency.js, etc.) for "is there enough
// data to say anything reliable" — reused here rather than inventing a
// second threshold for the same kind of question.
export function medianOpenCaseAge(cases, now = new Date()) {
  const ages = openCaseAges(cases, now);
  if (ages.length < MIN_SAMPLE_SIZE) return { applicable: false, total: ages.length };
  const mid = Math.floor(ages.length / 2);
  const median = ages.length % 2 !== 0 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2);
  return { applicable: true, median, total: ages.length };
}

export function ageingBands(cases, now = new Date()) {
  const bands = AGE_BANDS.map(b => ({ ...b, count: 0 }));
  openCases(cases).forEach(cs => {
    const age = caseAgeDays(cs, now);
    if (age == null) return;
    const band = bands.find(b => age >= b.min && age <= b.max);
    if (band) band.count++;
  });
  return bands;
}

function overdueOpenCaseIds(cases, dueSoon) {
  const overdueIds = new Set((dueSoon || []).filter(d => d.overdue && d.caseId).map(d => d.caseId));
  return new Set(openCases(cases).filter(cs => overdueIds.has(cs.id)).map(cs => cs.id));
}

// The three deterministic, explainable Needs Attention signals approved
// for this phase. "No recorded task activity in the last N days" (a
// fourth candidate signal) was deliberately NOT implemented — see this
// module's own test file and the Phase 2 implementation report for why:
// case_tasks.updated_at exists in the database but App.jsx's loadCaseTasks
// never maps it into client state (only created_at survives into
// caseTasks[].createdAt), so no reliable "last touched" timestamp is
// currently available client-side to support that statement.
export function computeNeedsAttentionSignals({ cases, dueSoon, now = new Date() }) {
  const open = openCases(cases);
  const overdueIds = overdueOpenCaseIds(cases, dueSoon);

  const olderThan30 = open.filter(cs => {
    const age = caseAgeDays(cs, now);
    return age != null && age > OLD_CASE_THRESHOLD_DAYS;
  });

  const typeCounts = {};
  open.forEach(cs => {
    const type = cs.caseType || "Not specified";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  let concentration = null;
  if (open.length >= MIN_SAMPLE_SIZE) {
    const [topType, topCount] = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0] || [];
    const pct = topType ? Math.round((topCount / open.length) * 100) : 0;
    if (topType && pct >= CONCENTRATION_THRESHOLD_PCT) {
      concentration = { caseType: topType, count: topCount, totalOpen: open.length, pct };
    }
  }

  return {
    overdueCount: overdueIds.size,
    overdueCaseIds: overdueIds,
    olderThan30Count: olderThan30.length,
    olderThan30CaseIds: new Set(olderThan30.map(cs => cs.id)),
    concentration,
  };
}

// Deterministic top-N (default 5) list of open cases most worth surfacing:
// overdue cases first (most days overdue first), then the oldest remaining
// open cases — matching the priority order approved for this phase. Ties
// break on case id so the list never reorders itself between renders for
// reasons a reader couldn't see.
export function casesRequiringAttention({ cases, dueSoon, now = new Date(), limit = 5 }) {
  const open = openCases(cases);
  const daysOverdueByCase = new Map();
  (dueSoon || []).forEach(d => {
    if (!d.overdue || !d.caseId) return;
    const prev = daysOverdueByCase.get(d.caseId);
    if (prev == null || d.daysOverdue > prev) daysOverdueByCase.set(d.caseId, d.daysOverdue);
  });

  const rows = open
    .map(cs => {
      const age = caseAgeDays(cs, now);
      const overdue = daysOverdueByCase.has(cs.id);
      const daysOverdue = daysOverdueByCase.get(cs.id) || 0;
      const reason = overdue
        ? `Overdue action (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue)`
        : (age != null && age > OLD_CASE_THRESHOLD_DAYS ? `Open ${age} days` : null);
      return { caseId: cs.id, employeeName: cs.employeeName, caseType: cs.caseType || "Not specified", age, overdue, daysOverdue, reason };
    })
    .filter(row => row.reason);

  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.overdue) { if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue; }
    else { if ((b.age || 0) !== (a.age || 0)) return (b.age || 0) - (a.age || 0); }
    return String(a.caseId).localeCompare(String(b.caseId));
  });

  return rows.slice(0, limit);
}
