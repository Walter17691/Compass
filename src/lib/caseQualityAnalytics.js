// Organisational ER Intelligence (Phase 6, OP12, §9) — case quality
// analytics. Aggregates the SAME two per-case quality-check engines
// already used live on every case (CaseViewScreen's own Overview tab):
// caseReadiness.js's computeCaseReadiness (5 completeness checks) and
// guardrails.js's computeGuardrailChecks (8 procedural/natural-justice
// checks, e.g. witness evidence gaps, missing employee response, thin
// decision reasoning, missing appeal clause). Both already produce
// stable, categorical results — guardrails.js's checks gained a stable
// `id` field alongside their existing `title` specifically for this
// aggregation (additive only; App.jsx's own signal-dedup still matches
// on `title`, unchanged) — so no free-text gap-string parsing is needed
// (deliberately NOT aggregating investigationQuality.js/
// decisionQuality.js's own gaps, which embed per-case allegation titles
// inline in the string and have no stable category to group by without
// fragile regex).
import { computeCaseReadiness } from './caseReadiness.js';
import { computeGuardrailChecks } from './guardrails.js';

export const CASE_QUALITY_MIN_SAMPLE_SIZE = 3;

export function computeCaseQualityAnalytics(cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers) {
  const tally = {};
  // Insights Phase 5 (Process Quality drill-down) — caseIds is tracked
  // as a Set purely alongside the pre-existing count, never in place of
  // it: count keeps its exact original meaning (incremented once per
  // bump call, unchanged formula/denominator), while caseIds
  // deduplicates which cases contributed at all, for a "View cases"
  // drill-down. The two can only ever diverge if a single check could
  // legitimately fire more than once for the very same case (none of
  // the current readiness/guardrail checks do) — this doesn't assume
  // that never happens, it just doesn't let it corrupt case-id dedup.
  const bump = (id, label, source, caseId) => {
    if (!tally[id]) tally[id] = { id, label, count: 0, source, caseIds: new Set() };
    tally[id].count++;
    tally[id].caseIds.add(caseId);
  };

  // computeCaseReadiness is only applicable to cases with allegations
  // recorded (readiness.applicable = caseAllegations.length > 0) — a
  // case with no allegations yet has nothing to check readiness
  // against. computeGuardrailChecks has no such gate; it runs (and
  // legitimately returns zero findings) for every case. Readiness-
  // derived issues therefore need their own denominator (cases where
  // readiness was actually applicable), not totalCases — dividing by
  // totalCases understated every readiness-gap percentage whenever some
  // cases had no allegations yet, sometimes drastically.
  let applicableForReadiness = 0;
  (cases || []).forEach(cs => {
    const readiness = computeCaseReadiness(cs, allegations, caseSignals, caseTasks);
    if (readiness.applicable) {
      applicableForReadiness++;
      readiness.gaps.forEach(g => bump(g.id, g.label, 'readiness', cs.id));
    }
    computeGuardrailChecks(cs, allegations, policies, caseAccess, orgMembers).forEach(g => bump(g.id, g.title, 'guardrail', cs.id));
  });

  const totalCases = (cases || []).length;
  const issues = Object.values(tally)
    .map(t => {
      const denominator = t.source === 'readiness' ? applicableForReadiness : totalCases;
      return { ...t, caseIds: Array.from(t.caseIds), pct: denominator > 0 ? Math.round((t.count / denominator) * 100) : 0 };
    })
    .sort((a, b) => b.count - a.count);

  return { totalCases, issues };
}
