import { describe, it, expect } from 'vitest';
import { computeAppealIntelligence } from '../lib/appealIntelligence';

function finding(id, caseId, extra = {}) {
  return { id, caseId, status: 'substantiated', ...extra };
}

describe('computeAppealIntelligence', () => {
  it('computes appeal rate only once the sample size floor is met', () => {
    const allegations = [finding('a1', 'c1'), finding('a2', 'c1'), finding('a3', 'c1', { appealOutcome: 'upheld' })];
    const result = computeAppealIntelligence(allegations, [], []);
    expect(result.totalFindings).toBe(3);
    expect(result.appealedCount).toBe(1);
    expect(result.appealRate).toBe(33);
  });

  it('returns a null appeal rate below the sample size floor', () => {
    const allegations = [finding('a1', 'c1', { appealOutcome: 'upheld' })];
    const result = computeAppealIntelligence(allegations, [], []);
    expect(result.appealRate).toBeNull();
  });

  it('tallies outcomes, including outcomes with zero occurrences', () => {
    const allegations = [
      finding('a1', 'c1'), finding('a2', 'c1'), finding('a3', 'c1'),
      finding('a4', 'c1', { appealOutcome: 'upheld' }),
      finding('a5', 'c1', { appealOutcome: 'upheld' }),
      finding('a6', 'c1', { appealOutcome: 'not_upheld' }),
    ];
    const result = computeAppealIntelligence(allegations, [], []);
    expect(result.outcomeCounts.upheld).toBe(2);
    expect(result.outcomeCounts.not_upheld).toBe(1);
    expect(result.outcomeCounts.partially_upheld).toBe(0);
    expect(result.outcomeCounts.further_investigation_required).toBe(0);
  });

  it('excludes non-finding statuses from the appeal rate denominator', () => {
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'unreviewed' },
      finding('a2', 'c1'), finding('a3', 'c1'), finding('a4', 'c1'),
    ];
    const result = computeAppealIntelligence(allegations, [], []);
    expect(result.totalFindings).toBe(3);
  });

  it('derives the original stage from the appeal meeting type, stripping the "Appeal" suffix', () => {
    const allegations = [finding('a1', 'c1', { appealOutcome: 'upheld' })];
    const cases = [{ id: 'c1', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] }];
    const result = computeAppealIntelligence(allegations, cases, []);
    expect(result.stageCounts).toEqual({ Disciplinary: 1 });
  });

  it('excludes not_upheld and further_investigation_required from the stage breakdown', () => {
    const allegations = [
      finding('a1', 'c1', { appealOutcome: 'not_upheld' }),
      finding('a2', 'c2', { appealOutcome: 'further_investigation_required' }),
    ];
    const cases = [
      { id: 'c1', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] },
      { id: 'c2', meetings: [{ type: 'Grievance Appeal', record: 'notes' }] },
    ];
    const result = computeAppealIntelligence(allegations, cases, []);
    expect(result.stageCounts).toEqual({});
  });

  it('contributes nothing to the stage breakdown when there is no appeal meeting record', () => {
    const allegations = [finding('a1', 'c1', { appealOutcome: 'upheld' })];
    const cases = [{ id: 'c1', meetings: [] }];
    const result = computeAppealIntelligence(allegations, cases, []);
    expect(result.stageCounts).toEqual({});
  });

  it('aggregates common appeal grounds from case_signals, across cases', () => {
    const caseSignals = [
      { caseId: 'c1', type: 'process_risk', title: 'Appeal ground: The sanction was disproportionate' },
      { caseId: 'c2', type: 'process_risk', title: 'Appeal ground: The sanction was disproportionate' },
      { caseId: 'c1', type: 'process_risk', title: 'Appeal ground: New evidence not considered' },
      { caseId: 'c1', type: 'process_risk', title: 'Something unrelated' },
      { caseId: 'c1', type: 'inconsistency', title: 'Appeal ground: should not count, wrong type' },
    ];
    const result = computeAppealIntelligence([], [], caseSignals);
    expect(result.commonGrounds).toEqual([
      { ground: 'The sanction was disproportionate', count: 2 },
      { ground: 'New evidence not considered', count: 1 },
    ]);
  });

  it('handles empty input', () => {
    const result = computeAppealIntelligence([], [], []);
    expect(result.totalFindings).toBe(0);
    expect(result.appealedCount).toBe(0);
    expect(result.appealRate).toBeNull();
    expect(result.commonGrounds).toEqual([]);
    expect(result.stageCounts).toEqual({});
  });
});
