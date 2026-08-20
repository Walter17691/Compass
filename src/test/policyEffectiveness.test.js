import { describe, it, expect } from 'vitest';
import { computePolicyReferenceCounts, countClarificationRequests } from '../lib/policyEffectiveness';

describe('computePolicyReferenceCounts', () => {
  it('counts distinct cases referencing each policy, by name not id', () => {
    const caseSignals = [
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', id: 'local-id-1', label: 'Flexible Working Policy' }] },
      { caseId: 'c2', sourceRefs: [{ kind: 'policy', id: 'a-totally-different-local-id', label: 'Flexible Working Policy' }] },
      { caseId: 'c3', sourceRefs: [{ kind: 'policy', id: 'x', label: 'Disciplinary Policy' }] },
    ];
    const result = computePolicyReferenceCounts(caseSignals);
    expect(result).toEqual([
      { policyName: 'Flexible Working Policy', caseCount: 2 },
      { policyName: 'Disciplinary Policy', caseCount: 1 },
    ]);
  });

  it('counts a case only once even if it has multiple signals citing the same policy', () => {
    const caseSignals = [
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'Disciplinary Policy' }] },
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'Disciplinary Policy' }] },
    ];
    const result = computePolicyReferenceCounts(caseSignals);
    expect(result).toEqual([{ policyName: 'Disciplinary Policy', caseCount: 1 }]);
  });

  it('ignores non-policy sourceRefs', () => {
    const caseSignals = [{ caseId: 'c1', sourceRefs: [{ kind: 'meeting', label: 'Investigation' }] }];
    expect(computePolicyReferenceCounts(caseSignals)).toEqual([]);
  });

  it('ignores a policy sourceRef with no label', () => {
    const caseSignals = [{ caseId: 'c1', sourceRefs: [{ kind: 'policy', id: 'x' }] }];
    expect(computePolicyReferenceCounts(caseSignals)).toEqual([]);
  });

  it('returns an empty array for no signals', () => {
    expect(computePolicyReferenceCounts([])).toEqual([]);
  });
});

describe('countClarificationRequests', () => {
  it('counts hrReviewRequests rows with status clarification_requested', () => {
    const hrReviewRequests = [
      { status: 'clarification_requested' },
      { status: 'clarification_requested' },
      { status: 'approved' },
    ];
    expect(countClarificationRequests(hrReviewRequests)).toBe(2);
  });

  it('returns 0 for no requests', () => {
    expect(countClarificationRequests([])).toBe(0);
  });
});
