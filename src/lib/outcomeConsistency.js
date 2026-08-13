// Phase 17 of the reasoning-layer build-out (scale/commercialisation wave,
// after manager investigation mode). Read-only and entirely client-side —
// cases/allegations are already loaded org-wide (whatever the current
// user's RLS/confidentiality scope permits), so this needs no new
// backend, no new table, no server-side aggregation. Grouped only by
// case type (misconduct/attendance/etc.) — never by anything employee-
// identifying or protected-characteristic-adjacent, per the spec's own
// hard constraint. No such field exists in the schema today; this stays
// that way deliberately.
import { getCaseStage } from './caseStage';
import { isFindingStatus, allegationStatusMeta } from './allegations';

// Below this, a distribution risks being either statistically meaningless
// or effectively identifying (a "1 of 1 substantiated" comparison isn't
// a comparison) — so nothing is shown at all rather than a misleading
// one built on too few closed cases.
const MIN_SAMPLE_SIZE = 3;

export function computeOutcomeDistribution(cases, allegations, caseType, excludeCaseId) {
  if (!caseType) return { applicable: false, total: 0 };
  const closedCaseIds = new Set(
    (cases || [])
      .filter(c => c.caseType === caseType && c.id !== excludeCaseId && getCaseStage(c) === "closed")
      .map(c => c.id)
  );
  const findings = (allegations || []).filter(a => closedCaseIds.has(a.caseId) && isFindingStatus(a.status));
  if (findings.length < MIN_SAMPLE_SIZE) return { applicable: false, total: findings.length };

  const tally = {};
  findings.forEach(a => { tally[a.status] = (tally[a.status] || 0) + 1; });
  const distribution = Object.entries(tally)
    .map(([status, count]) => ({ status, label: allegationStatusMeta(status).label, count, pct: Math.round((count / findings.length) * 100) }))
    .sort((a, b) => b.count - a.count);

  return { applicable: true, total: findings.length, distribution };
}

// Process Intelligence (P14, §11) — computeOutcomeDistribution above
// buckets by allegation FINDING (substantiated/not substantiated/etc.);
// this buckets the same closed, same-case-type population by the
// SANCTION actually issued (cs.outcome — OutcomeModal's own dropdown
// values), a genuinely different question ("once substantiated, what
// sanction followed?"). Same MIN_SAMPLE_SIZE floor, same reasoning for
// it: a distribution built on too few cases is either meaningless or
// effectively identifying.
export function computeSanctionDistribution(cases, caseType, excludeCaseId) {
  if (!caseType) return { applicable: false, total: 0 };
  const closed = (cases || []).filter(c => c.caseType === caseType && c.id !== excludeCaseId && getCaseStage(c) === "closed" && c.outcome);
  if (closed.length < MIN_SAMPLE_SIZE) return { applicable: false, total: closed.length };

  const tally = {};
  closed.forEach(c => { tally[c.outcome] = (tally[c.outcome] || 0) + 1; });
  const distribution = Object.entries(tally)
    .map(([outcome, count]) => ({ outcome, count, pct: Math.round((count / closed.length) * 100) }))
    .sort((a, b) => b.count - a.count);

  return { applicable: true, total: closed.length, distribution };
}

// Process Intelligence (P14, §12) — the anonymised individual case
// summaries the spec asks HR be able to open: case type + finding(s) +
// a reasoning excerpt, and nothing else — no employeeName, no case id
// exposed beyond a stable React key. Same hard constraint as the module
// header: never group or describe by anything protected-characteristic-
// adjacent. The schema holds no such field, so there's nothing here to
// accidentally carry over — this function's own shape is the guard.
export function comparableCaseSummaries(cases, allegations, caseType, excludeCaseId) {
  if (!caseType) return [];
  const closedCases = (cases || []).filter(c => c.caseType === caseType && c.id !== excludeCaseId && getCaseStage(c) === "closed");
  return closedCases.map(c => {
    const findings = (allegations || []).filter(a => a.caseId === c.id && isFindingStatus(a.status));
    if (!findings.length) return null;
    return {
      key: c.id,
      outcome: c.outcome || null,
      findings: findings.map(a => ({ status: a.status, label: allegationStatusMeta(a.status).label, reasoningExcerpt: (a.decisionReasoning || "").slice(0, 220) })),
    };
  }).filter(Boolean);
}
