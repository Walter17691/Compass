import { describe, it, expect } from 'vitest';
import {
  caseAgeDays,
  medianOpenCaseAge,
  ageingBands,
  computeNeedsAttentionSignals,
  casesRequiringAttention,
  OLD_CASE_THRESHOLD_DAYS,
  CONCENTRATION_THRESHOLD_PCT,
} from '../lib/needsAttention';

const NOW = new Date('2026-09-05T12:00:00Z');
const daysAgoIso = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function makeCase(overrides = {}) {
  return {
    id: 'case-1',
    employeeName: 'A Employee',
    caseType: 'misconduct',
    stage: undefined,
    createdAt: daysAgoIso(10),
    ...overrides,
  };
}

describe('caseAgeDays', () => {
  it('computes whole-day age from createdAt', () => {
    expect(caseAgeDays(makeCase({ createdAt: daysAgoIso(9) }), NOW)).toBe(9);
  });

  it('returns null for a missing createdAt', () => {
    expect(caseAgeDays(makeCase({ createdAt: null }), NOW)).toBeNull();
  });

  it('returns null for an unparseable createdAt', () => {
    expect(caseAgeDays(makeCase({ createdAt: 'not-a-date' }), NOW)).toBeNull();
  });

  it('returns null for a creation date in the future (bad data), not a negative age', () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(caseAgeDays(makeCase({ createdAt: future }), NOW)).toBeNull();
  });
});

describe('medianOpenCaseAge', () => {
  it('is not applicable below the shared MIN_SAMPLE_SIZE floor', () => {
    const cases = [makeCase({ id: '1', createdAt: daysAgoIso(5) }), makeCase({ id: '2', createdAt: daysAgoIso(10) })];
    const result = medianOpenCaseAge(cases, NOW);
    expect(result.applicable).toBe(false);
    expect(result.total).toBe(2);
  });

  it('computes the middle value for an odd number of open cases', () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(3) }),
      makeCase({ id: '2', createdAt: daysAgoIso(9) }),
      makeCase({ id: '3', createdAt: daysAgoIso(20) }),
    ];
    const result = medianOpenCaseAge(cases, NOW);
    expect(result).toEqual({ applicable: true, median: 9, total: 3 });
  });

  it('averages the two middle values for an even number of open cases', () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(2) }),
      makeCase({ id: '2', createdAt: daysAgoIso(8) }),
      makeCase({ id: '3', createdAt: daysAgoIso(10) }),
      makeCase({ id: '4', createdAt: daysAgoIso(40) }),
    ];
    const result = medianOpenCaseAge(cases, NOW);
    expect(result).toEqual({ applicable: true, median: 9, total: 4 });
  });

  it('excludes closed cases from both the median and the sample count', () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(3) }),
      makeCase({ id: '2', createdAt: daysAgoIso(9) }),
      makeCase({ id: '3', createdAt: daysAgoIso(20) }),
      makeCase({ id: '4', createdAt: daysAgoIso(500), stage: 'closed' }),
    ];
    const result = medianOpenCaseAge(cases, NOW);
    expect(result).toEqual({ applicable: true, median: 9, total: 3 });
  });

  it('safely handles missing/invalid createdAt values by excluding them, not crashing or producing NaN', () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(3) }),
      makeCase({ id: '2', createdAt: null }),
      makeCase({ id: '3', createdAt: 'garbage' }),
      makeCase({ id: '4', createdAt: daysAgoIso(20) }),
    ];
    const result = medianOpenCaseAge(cases, NOW);
    expect(result.applicable).toBe(false); // only 2 valid ages remain, below MIN_SAMPLE_SIZE
    expect(Number.isNaN(result.total)).toBe(false);
  });
});

describe('ageingBands', () => {
  it('places boundary values in the correct band', () => {
    const cases = [
      makeCase({ id: 'a', createdAt: daysAgoIso(0) }),
      makeCase({ id: 'b', createdAt: daysAgoIso(7) }),
      makeCase({ id: 'c', createdAt: daysAgoIso(8) }),
      makeCase({ id: 'd', createdAt: daysAgoIso(14) }),
      makeCase({ id: 'e', createdAt: daysAgoIso(15) }),
      makeCase({ id: 'f', createdAt: daysAgoIso(30) }),
      makeCase({ id: 'g', createdAt: daysAgoIso(31) }),
      makeCase({ id: 'h', createdAt: daysAgoIso(60) }),
      makeCase({ id: 'i', createdAt: daysAgoIso(61) }),
      makeCase({ id: 'j', createdAt: daysAgoIso(9999) }),
    ];
    const bands = ageingBands(cases, NOW);
    const byId = Object.fromEntries(bands.map(b => [b.id, b.count]));
    expect(byId['0-7']).toBe(2);
    expect(byId['8-14']).toBe(2);
    expect(byId['15-30']).toBe(2);
    expect(byId['31-60']).toBe(2);
    expect(byId['61+']).toBe(2);
  });

  it('produces totals that sum to the number of valid open cases', () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(1) }),
      makeCase({ id: '2', createdAt: daysAgoIso(100), stage: 'closed' }),
      makeCase({ id: '3', createdAt: null }),
      makeCase({ id: '4', createdAt: daysAgoIso(45) }),
    ];
    const bands = ageingBands(cases, NOW);
    const total = bands.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(2);
  });
});

describe('computeNeedsAttentionSignals', () => {
  it('counts only open cases with an overdue dueSoon entry', () => {
    const cases = [
      makeCase({ id: '1' }),
      makeCase({ id: '2' }),
      makeCase({ id: '3', stage: 'closed' }),
    ];
    const dueSoon = [
      { caseId: '1', overdue: true, daysOverdue: 5 },
      { caseId: '3', overdue: true, daysOverdue: 100 }, // closed case — must not count
      { caseId: '2', overdue: false, daysOverdue: 0 },
    ];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon, now: NOW });
    expect(signals.overdueCount).toBe(1);
    expect(signals.overdueCaseIds.has('1')).toBe(true);
    expect(signals.overdueCaseIds.has('3')).toBe(false);
  });

  it(`flags cases older than ${OLD_CASE_THRESHOLD_DAYS} days as an ageing fact, not an SLA breach label`, () => {
    const cases = [
      makeCase({ id: '1', createdAt: daysAgoIso(31) }),
      makeCase({ id: '2', createdAt: daysAgoIso(30) }), // exactly the threshold — not "more than"
      makeCase({ id: '3', createdAt: daysAgoIso(5) }),
    ];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon: [], now: NOW });
    expect(signals.olderThan30Count).toBe(1);
    expect(signals.olderThan30CaseIds.has('1')).toBe(true);
    expect(signals.olderThan30CaseIds.has('2')).toBe(false);
  });

  it('excludes closed cases from the ageing signal even when very old', () => {
    const cases = [makeCase({ id: '1', createdAt: daysAgoIso(900), stage: 'closed' })];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon: [], now: NOW });
    expect(signals.olderThan30Count).toBe(0);
  });

  it(`surfaces a concentration fact only at or above ${CONCENTRATION_THRESHOLD_PCT}% of the open caseload`, () => {
    const cases = [
      makeCase({ id: '1', caseType: 'misconduct' }),
      makeCase({ id: '2', caseType: 'misconduct' }),
      makeCase({ id: '3', caseType: 'misconduct' }),
      makeCase({ id: '4', caseType: 'grievance' }),
      makeCase({ id: '5', caseType: 'grievance' }),
    ];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon: [], now: NOW });
    expect(signals.concentration).toEqual({ caseType: 'misconduct', count: 3, totalOpen: 5, pct: 60 });
  });

  it('does not surface a concentration fact when no type reaches the threshold', () => {
    const cases = [
      makeCase({ id: '1', caseType: 'misconduct' }),
      makeCase({ id: '2', caseType: 'misconduct' }),
      makeCase({ id: '3', caseType: 'grievance' }),
      makeCase({ id: '4', caseType: 'grievance' }),
      makeCase({ id: '5', caseType: 'capability' }),
    ];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon: [], now: NOW });
    expect(signals.concentration).toBeNull();
  });

  it('does not surface a concentration fact below the minimum open-case sample', () => {
    const cases = [
      makeCase({ id: '1', caseType: 'misconduct' }),
      makeCase({ id: '2', caseType: 'misconduct' }),
    ];
    const signals = computeNeedsAttentionSignals({ cases, dueSoon: [], now: NOW });
    expect(signals.concentration).toBeNull();
  });
});

describe('casesRequiringAttention', () => {
  it('orders overdue cases before ageing-only cases', () => {
    const cases = [
      makeCase({ id: 'old', createdAt: daysAgoIso(40) }),
      makeCase({ id: 'overdue', createdAt: daysAgoIso(5) }),
    ];
    const dueSoon = [{ caseId: 'overdue', overdue: true, daysOverdue: 2 }];
    const rows = casesRequiringAttention({ cases, dueSoon, now: NOW });
    expect(rows.map(r => r.caseId)).toEqual(['overdue', 'old']);
  });

  it('orders multiple overdue cases by most days overdue first', () => {
    const cases = [
      makeCase({ id: 'a' }),
      makeCase({ id: 'b' }),
    ];
    const dueSoon = [
      { caseId: 'a', overdue: true, daysOverdue: 3 },
      { caseId: 'b', overdue: true, daysOverdue: 10 },
    ];
    const rows = casesRequiringAttention({ cases, dueSoon, now: NOW });
    expect(rows.map(r => r.caseId)).toEqual(['b', 'a']);
  });

  it('orders non-overdue ageing cases oldest first', () => {
    const cases = [
      makeCase({ id: 'newer-old', createdAt: daysAgoIso(31) }),
      makeCase({ id: 'oldest', createdAt: daysAgoIso(90) }),
    ];
    const rows = casesRequiringAttention({ cases, dueSoon: [], now: NOW });
    expect(rows.map(r => r.caseId)).toEqual(['oldest', 'newer-old']);
  });

  it('breaks ties deterministically by case id', () => {
    const cases = [
      makeCase({ id: 'zzz', createdAt: daysAgoIso(50) }),
      makeCase({ id: 'aaa', createdAt: daysAgoIso(50) }),
    ];
    const rows = casesRequiringAttention({ cases, dueSoon: [], now: NOW });
    expect(rows.map(r => r.caseId)).toEqual(['aaa', 'zzz']);
  });

  it('excludes cases with neither an overdue action nor >30 days age', () => {
    const cases = [makeCase({ id: '1', createdAt: daysAgoIso(5) })];
    const rows = casesRequiringAttention({ cases, dueSoon: [], now: NOW });
    expect(rows).toEqual([]);
  });

  it('excludes closed cases even if overdue or old', () => {
    const cases = [makeCase({ id: '1', createdAt: daysAgoIso(900), stage: 'closed' })];
    const dueSoon = [{ caseId: '1', overdue: true, daysOverdue: 500 }];
    const rows = casesRequiringAttention({ cases, dueSoon, now: NOW });
    expect(rows).toEqual([]);
  });

  it('respects the limit parameter and only ever operates on the cases supplied to it (no cross-scope reconstruction)', () => {
    const cases = Array.from({ length: 10 }, (_, i) => makeCase({ id: `c${i}`, createdAt: daysAgoIso(40 + i) }));
    const rows = casesRequiringAttention({ cases, dueSoon: [], now: NOW, limit: 5 });
    expect(rows.length).toBe(5);
    expect(rows.every(r => cases.some(cs => cs.id === r.caseId))).toBe(true);
  });
});
