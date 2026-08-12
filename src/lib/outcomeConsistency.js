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
