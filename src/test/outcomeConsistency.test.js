import { describe, it, expect } from 'vitest';
import { computeOutcomeDistribution } from '../lib/outcomeConsistency';

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
