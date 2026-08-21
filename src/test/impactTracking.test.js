import { describe, it, expect } from 'vitest';
import { daysSince, findMetricTrendEntry, hasEnoughDataForImpact, describeImpact, MIN_DAYS_SINCE_COMPLETION } from '../lib/impactTracking';

describe('daysSince', () => {
  it('computes whole days between a past date and now', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(daysSince('2026-08-14T12:00:00Z', now)).toBe(7);
  });

  it('never returns a negative number for a date in the future (clock skew safety)', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(daysSince('2026-08-22T12:00:00Z', now)).toBe(0);
  });

  it('returns null when there is no date', () => {
    expect(daysSince(null)).toBeNull();
  });
});

describe('findMetricTrendEntry', () => {
  const trendData = {
    by_type_trend: [{ caseType: 'grievance', currentCount: 3, previousCount: 8, byLocation: {} }],
    by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 1, previousCount: 6, byLocation: {} }],
  };

  it('finds a case-type entry by caseType', () => {
    expect(findMetricTrendEntry(trendData, 'case_type', 'grievance')).toMatchObject({ currentCount: 3, previousCount: 8 });
  });

  it('finds a theme entry by themeId', () => {
    expect(findMetricTrendEntry(trendData, 'theme', 't1')).toMatchObject({ currentCount: 1, previousCount: 6 });
  });

  it('returns null when nothing matches, or inputs are missing', () => {
    expect(findMetricTrendEntry(trendData, 'case_type', 'redundancy')).toBeNull();
    expect(findMetricTrendEntry(null, 'case_type', 'grievance')).toBeNull();
    expect(findMetricTrendEntry(trendData, null, 'grievance')).toBeNull();
  });
});

describe('hasEnoughDataForImpact', () => {
  it('requires a real prior baseline, gated on the BEFORE count', () => {
    expect(hasEnoughDataForImpact({ previousCount: 3, currentCount: 0 })).toBe(true);
    expect(hasEnoughDataForImpact({ previousCount: 2, currentCount: 10 })).toBe(false);
  });

  it('is honest that a success case (volume dropped to near-zero) is not itself suppressed', () => {
    // The best-case outcome of a working initiative is currentCount
    // dropping toward zero — that must never be what disqualifies it.
    expect(hasEnoughDataForImpact({ previousCount: 8, currentCount: 0 })).toBe(true);
  });

  it('returns false for a missing entry', () => {
    expect(hasEnoughDataForImpact(null)).toBe(false);
  });
});

describe('describeImpact', () => {
  it('describes a decrease with the required non-causal disclaimer', () => {
    const text = describeImpact('grievance', { currentCount: 3, previousCount: 8 }, 30);
    expect(text).toContain('grievance rates decreased 62%');
    expect(text).toContain('8 in the 30 days before');
    expect(text).toContain('3 in the 30 days since');
    expect(text).toContain('not a confirmed causal outcome');
  });

  it('describes an increase honestly too, not just improvements', () => {
    const text = describeImpact('grievance', { currentCount: 10, previousCount: 4 }, 14);
    expect(text).toContain('grievance rates increased 150%');
  });

  it('describes an unchanged rate without the disclaimer (no pattern to caution about)', () => {
    const text = describeImpact('grievance', { currentCount: 5, previousCount: 5 }, 20);
    expect(text).toContain('unchanged');
    expect(text).not.toContain('confirmed causal');
  });

  it('describes a newly-emerging count when there were no prior cases', () => {
    const text = describeImpact('grievance', { currentCount: 2, previousCount: 0 }, 10);
    expect(text).toContain('no recorded cases in the 10 days before');
    expect(text).toContain('2 in the 10 days since');
  });
});

describe('MIN_DAYS_SINCE_COMPLETION', () => {
  it('is a real, positive floor', () => {
    expect(MIN_DAYS_SINCE_COMPLETION).toBeGreaterThan(0);
  });
});
