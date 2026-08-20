import { describe, it, expect } from 'vitest';
import { buildExecutiveBriefInputs } from '../lib/execBrief';
import { PERIOD_TYPES, periodTypeLabel, buildPeriodicReviewPrompt } from '../lib/periodicReview';

const overview = {
  total_cases: 50, open_cases: 20, opened_in_period: 5, closed_in_period: 3,
  cases_by_type: { misconduct: 30 }, cases_by_outcome: {}, avg_case_duration_days: 9,
};

describe('PERIOD_TYPES', () => {
  it('covers weekly, monthly, and quarterly with the spec\'s own naming', () => {
    expect(PERIOD_TYPES.map(p => p.label)).toEqual(['Weekly ER Review', 'Monthly People Risk Review', 'Quarterly ER Review']);
  });

  it('gives each period type a distinct window in days', () => {
    expect(PERIOD_TYPES.find(p => p.id === 'weekly').days).toBe(7);
    expect(PERIOD_TYPES.find(p => p.id === 'monthly').days).toBe(30);
    expect(PERIOD_TYPES.find(p => p.id === 'quarterly').days).toBe(90);
  });
});

describe('periodTypeLabel', () => {
  it('resolves a known period type', () => {
    expect(periodTypeLabel('weekly')).toBe('Weekly ER Review');
  });

  it('falls back to the raw value for an unknown type', () => {
    expect(periodTypeLabel('daily')).toBe('daily');
  });
});

describe('buildPeriodicReviewPrompt', () => {
  it('includes the period label and real case movement figures', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', 4);
    expect(prompt).toContain('Weekly ER Review');
    expect(prompt).toContain('Opened this period: 5');
    expect(prompt).toContain('Closed this period: 3');
    expect(prompt).toContain('High-priority active cases (org-wide, not period-scoped): 4');
  });

  it('includes the anti-attribution clause', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'monthly', 0);
    expect(prompt).toContain('never state or imply that a pattern was *caused* by a named manager');
  });

  it('requests a recommended-actions list', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'quarterly', null);
    expect(prompt).toContain('Recommended actions for next period');
  });

  it('notes when there are no significant trends, rather than omitting the section silently', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toContain('No significant case-type trends this period.');
    expect(prompt).toContain('No significant emerging themes this period.');
  });

  it('omits the high-priority line when the count is not provided', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).not.toContain('High-priority active cases');
  });
});
