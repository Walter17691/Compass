import { describe, it, expect } from 'vitest';
import { computeOutcomeDistribution, computeSanctionDistribution, comparableCaseSummaries } from '../lib/outcomeConsistency';

const closedMisconductCase = (id, overrides = {}) => ({ id, caseType: 'misconduct', stage: 'closed', meetings: [], ...overrides });

describe('computeOutcomeDistribution', () => {
  it('is not applicable when no caseType is given', () => {
    expect(computeOutcomeDistribution([], [], null, 'case1').applicable).toBe(false);
  });

  it('is not applicable with fewer than 3 prior findings of the same case type', () => {
    const cases = [closedMisconductCase('c1'), closedMisconductCase('c2')];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'not_substantiated' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('computes a distribution once at least 3 findings exist for the case type', () => {
    const cases = [closedMisconductCase('c1'), closedMisconductCase('c2'), closedMisconductCase('c3')];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'not_substantiated' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(true);
    expect(result.total).toBe(3);
    expect(result.distribution).toEqual([
      { status: 'substantiated', label: 'Substantiated', count: 2, pct: 67 },
      { status: 'not_substantiated', label: 'Not substantiated', count: 1, pct: 33 },
    ]);
  });

  it('excludes the current case itself from the comparison', () => {
    const cases = [closedMisconductCase('c1'), closedMisconductCase('c2'), closedMisconductCase('current-case')];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'current-case', status: 'substantiated' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('ignores cases that are not yet closed', () => {
    const cases = [
      closedMisconductCase('c1'), closedMisconductCase('c2'),
      { id: 'c3', caseType: 'misconduct', stage: 'investigation', meetings: [] },
    ];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'substantiated' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('ignores cases of a different case type', () => {
    const cases = [
      closedMisconductCase('c1'), closedMisconductCase('c2'),
      { id: 'c3', caseType: 'attendance', stage: 'closed', meetings: [] },
    ];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'substantiated' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('ignores allegations still in a procedural (non-finding) status', () => {
    const cases = [closedMisconductCase('c1'), closedMisconductCase('c2'), closedMisconductCase('c3')];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'unreviewed' },
    ];
    const result = computeOutcomeDistribution(cases, allegations, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });
});

describe('computeSanctionDistribution (P14)', () => {
  it('is not applicable when no caseType is given', () => {
    expect(computeSanctionDistribution([], null, 'current-case').applicable).toBe(false);
  });

  it('is not applicable with fewer than 3 closed cases with a recorded outcome', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'First written warning' }),
      closedMisconductCase('c2', { outcome: 'Final written warning' }),
    ];
    const result = computeSanctionDistribution(cases, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('computes a distribution once at least 3 closed cases have a recorded outcome', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Final written warning' }),
      closedMisconductCase('c3', { outcome: 'Dismissal with notice' }),
    ];
    const result = computeSanctionDistribution(cases, 'misconduct', 'current-case');
    expect(result.applicable).toBe(true);
    expect(result.total).toBe(3);
    expect(result.distribution).toEqual([
      { outcome: 'Final written warning', count: 2, pct: 67 },
      { outcome: 'Dismissal with notice', count: 1, pct: 33 },
    ]);
  });

  it('excludes the current case itself', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Final written warning' }),
      closedMisconductCase('current-case', { outcome: 'Final written warning' }),
    ];
    const result = computeSanctionDistribution(cases, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('ignores closed cases with no recorded outcome yet', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Final written warning' }),
      closedMisconductCase('c3', { outcome: null }),
    ];
    const result = computeSanctionDistribution(cases, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('ignores cases of a different case type or that are not yet closed', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Final written warning' }),
      { id: 'c3', caseType: 'attendance', stage: 'closed', outcome: 'Final written warning' },
      { id: 'c4', caseType: 'misconduct', stage: 'investigation', outcome: 'Final written warning' },
    ];
    const result = computeSanctionDistribution(cases, 'misconduct', 'current-case');
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });
});

describe('comparableCaseSummaries (P14)', () => {
  it('returns an empty array when no caseType is given', () => {
    expect(comparableCaseSummaries([], [], null, 'current-case')).toEqual([]);
  });

  // Phase 6.5 hardening (Batch 7) — comparableCaseSummaries now enforces
  // the same MIN_SAMPLE_SIZE floor as its siblings (computeOutcomeDistribution/
  // computeSanctionDistribution): an individual anonymised summary is
  // trivially re-identifiable when it's the only closed case of that
  // type, even with no name/id shown. Every positive-path test below
  // needs 3+ closed comparable cases to stay above that floor.
  it('is empty below the sample-size floor, even for a single genuine comparable case', () => {
    const cases = [closedMisconductCase('c1', { outcome: 'Final written warning' })];
    const allegations = [{ id: 'a1', caseId: 'c1', status: 'substantiated', decisionReasoning: 'x' }];
    expect(comparableCaseSummaries(cases, allegations, 'misconduct', 'current-case')).toEqual([]);
  });

  it('summarises each closed comparable case by finding, never by employee name, once 3+ exist', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning', employeeName: 'Should Never Appear' }),
      closedMisconductCase('c2', { outcome: 'Verbal warning' }),
      closedMisconductCase('c3', { outcome: 'Dismissal' }),
    ];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated', decisionReasoning: 'CCTV footage confirmed the conduct.' },
      { id: 'a2', caseId: 'c2', status: 'substantiated', decisionReasoning: 'x' },
      { id: 'a3', caseId: 'c3', status: 'substantiated', decisionReasoning: 'x' },
    ];
    const result = comparableCaseSummaries(cases, allegations, 'misconduct', 'current-case');
    const c1Summary = result.find(r => r.key === 'c1');
    expect(c1Summary).toEqual({
      key: 'c1',
      outcome: 'Final written warning',
      findings: [{ status: 'substantiated', label: 'Substantiated', reasoningExcerpt: 'CCTV footage confirmed the conduct.' }],
    });
    expect(JSON.stringify(result)).not.toContain('Should Never Appear');
  });

  it('excludes the current case itself', () => {
    const cases = [
      closedMisconductCase('current-case', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Verbal warning' }),
      closedMisconductCase('c3', { outcome: 'Dismissal' }),
    ];
    const allegations = [
      { id: 'a1', caseId: 'current-case', status: 'substantiated' },
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'substantiated' },
    ];
    expect(comparableCaseSummaries(cases, allegations, 'misconduct', 'current-case').some(r => r.key === 'current-case')).toBe(false);
  });

  it('excludes closed cases with no recorded findings yet', () => {
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Verbal warning' }),
      closedMisconductCase('c3', { outcome: 'Dismissal' }),
    ];
    const allegations = [
      { id: 'a2', caseId: 'c2', status: 'substantiated' },
      { id: 'a3', caseId: 'c3', status: 'substantiated' },
    ];
    expect(comparableCaseSummaries(cases, allegations, 'misconduct', 'current-case').some(r => r.key === 'c1')).toBe(false);
  });

  it('truncates a long reasoning excerpt to 220 characters', () => {
    const longReasoning = 'x'.repeat(500);
    const cases = [
      closedMisconductCase('c1', { outcome: 'Final written warning' }),
      closedMisconductCase('c2', { outcome: 'Verbal warning' }),
      closedMisconductCase('c3', { outcome: 'Dismissal' }),
    ];
    const allegations = [
      { id: 'a1', caseId: 'c1', status: 'substantiated', decisionReasoning: longReasoning },
      { id: 'a2', caseId: 'c2', status: 'substantiated', decisionReasoning: 'x' },
      { id: 'a3', caseId: 'c3', status: 'substantiated', decisionReasoning: 'x' },
    ];
    const result = comparableCaseSummaries(cases, allegations, 'misconduct', 'current-case');
    expect(result.find(r => r.key === 'c1').findings[0].reasoningExcerpt).toHaveLength(220);
  });
});
