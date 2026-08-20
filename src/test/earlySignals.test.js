import { describe, it, expect } from 'vitest';
import { describeEarlySignal, buildSuggestedReview, EARLY_SIGNAL_WINDOW_DAYS } from '../lib/earlySignals';

describe('EARLY_SIGNAL_WINDOW_DAYS', () => {
  it('is 6 weeks', () => {
    expect(EARLY_SIGNAL_WINDOW_DAYS).toBe(42);
  });
});

describe('describeEarlySignal', () => {
  it('matches the spec\'s own example shape', () => {
    const entry = { themeName: 'shift changes', currentCount: 5, previousCount: 1, byLocation: { Manchester: 2, London: 2, Leeds: 1 } };
    const text = describeEarlySignal(entry);
    expect(text).toContain('Emerging theme: 5 cases across 3 locations in the last six weeks refer to "shift changes"');
    expect(text).toContain('Previous six-week period: 1 case.');
  });

  it('handles a singular case count and singular location', () => {
    const entry = { themeName: 'X', currentCount: 1, previousCount: 1, byLocation: { Manchester: 1 } };
    const text = describeEarlySignal(entry);
    expect(text).toContain('1 case across 1 location');
  });

  it('handles no previous cases at all', () => {
    const entry = { themeName: 'X', currentCount: 4, previousCount: 0, byLocation: {} };
    const text = describeEarlySignal(entry);
    expect(text).toContain('Previous six-week period: no recorded cases.');
  });

  it('omits the location clause when there is no location breakdown', () => {
    const entry = { themeName: 'X', currentCount: 4, previousCount: 1, byLocation: {} };
    const text = describeEarlySignal(entry);
    expect(text).toContain('4 cases in the last six weeks');
    expect(text).not.toContain('across');
  });

  it('never states or implies causation', () => {
    const entry = { themeName: 'X', currentCount: 5, previousCount: 1, byLocation: {} };
    expect(describeEarlySignal(entry).toLowerCase()).not.toContain('caused');
  });
});

describe('buildSuggestedReview', () => {
  it('frames the suggestion generically, without inventing a specific named process', () => {
    const text = buildSuggestedReview('shift changes');
    expect(text).toBe('Suggested review: processes or communication related to "shift changes".');
  });
});
