import { describe, it, expect } from 'vitest';
import { computePctChange, isSignificantTrend, describeTrend } from '../lib/trendDetection';

describe('computePctChange', () => {
  it('computes a positive percentage increase', () => {
    expect(computePctChange(13, 10)).toBe(30);
  });

  it('computes a negative percentage for a decrease', () => {
    expect(computePctChange(7, 10)).toBe(-30);
  });

  it('returns null when there is no comparable prior period but current cases exist', () => {
    expect(computePctChange(5, 0)).toBeNull();
  });

  it('returns 0 when both periods are zero', () => {
    expect(computePctChange(0, 0)).toBe(0);
  });
});

describe('isSignificantTrend', () => {
  it('is not significant below the minimum sample size, even with a huge percentage', () => {
    expect(isSignificantTrend({ currentCount: 2, previousCount: 1 })).toBe(false);
  });

  it('is significant when the increase meets the threshold and sample size', () => {
    expect(isSignificantTrend({ currentCount: 13, previousCount: 10 })).toBe(true);
  });

  it('is not significant when the increase is below the threshold', () => {
    expect(isSignificantTrend({ currentCount: 11, previousCount: 10 })).toBe(false);
  });

  it('is significant for a genuinely new pattern with no prior period, above the sample floor', () => {
    expect(isSignificantTrend({ currentCount: 4, previousCount: 0 })).toBe(true);
  });

  it('is not significant for a new pattern below the sample floor', () => {
    expect(isSignificantTrend({ currentCount: 2, previousCount: 0 })).toBe(false);
  });

  it('handles a missing entry', () => {
    expect(isSignificantTrend(null)).toBe(false);
  });
});

describe('describeTrend', () => {
  it('never states or implies causation, and names concentrated locations', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: { Manchester: 6, Leeds: 4, 'Not specified': 3 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('Compass has identified a pattern');
    expect(text).toContain('30%');
    expect(text).toContain('Manchester');
    expect(text).toContain('Leeds');
    expect(text).not.toContain('Not specified');
    expect(text.toLowerCase()).not.toContain('caused');
  });

  it('describes a decrease', () => {
    const entry = { currentCount: 7, previousCount: 10, byLocation: {} };
    expect(describeTrend(entry, 'Absence')).toContain('decreased 30%');
  });

  it('describes an emerging pattern with no prior period', () => {
    const entry = { currentCount: 5, previousCount: 0, byLocation: {} };
    const text = describeTrend(entry, 'Workload');
    expect(text).toContain('no recorded cases in the previous comparison period');
    expect(text).toContain('5 in the current period');
  });

  it('notes when no location breakdown is available', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: {} };
    expect(describeTrend(entry, 'Grievance')).toContain('no location breakdown available yet');
  });
});
