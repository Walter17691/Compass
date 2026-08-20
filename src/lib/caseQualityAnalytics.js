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
import { computeCaseReadiness } from './caseReadiness';
import { computeGuardrailChecks } from './guardrails';

export const CASE_QUALITY_MIN_SAMPLE_SIZE = 3;

export function computeCaseQualityAnalytics(cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers) {
  const tally = {};
  const bump = (id, label) => {
    if (!tally[id]) tally[id] = { id, label, count: 0 };
    tally[id].count++;
  };

  (cases || []).forEach(cs => {
    const readiness = computeCaseReadiness(cs, allegations, caseSignals, caseTasks);
    if (readiness.applicable) {
      readiness.gaps.forEach(g => bump(g.id, g.label));
    }
    computeGuardrailChecks(cs, allegations, policies, caseAccess, orgMembers).forEach(g => bump(g.id, g.title));
  });

  const totalCases = (cases || []).length;
  const issues = Object.values(tally)
    .map(t => ({ ...t, pct: totalCases > 0 ? Math.round((t.count / totalCases) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  return { totalCases, issues };
}
