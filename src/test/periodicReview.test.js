import { describe, it, expect } from 'vitest';
import { buildExecutiveBriefInputs, ANTI_ATTRIBUTION_CLAUSE } from '../lib/execBrief';
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

// Insights Phase 6 (Actionability + Executive Reporting), §19 — snapshot
// (current-state) metrics must never be phrased as if they occurred
// during the selected period; period-specific metrics (trends, computed
// with that same periodDays) are phrased as period facts.
describe('buildPeriodicReviewPrompt — snapshot vs period wording (Insights Phase 6, §19)', () => {
  it('phrases a period-specific overall-volume movement as a period fact', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const cases = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, createdAt: new Date(now.getTime() - 3 * 86400000).toISOString() }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() })));
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] }, { cases, now, periodDays: 7 });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toContain('Overall case volume this period: 13 cases opened vs 10 in the previous period.');
  });

  it('phrases pending HR review as "at the time of this review", never as a period-during fact', () => {
    const hrReviewRequests = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-01T00:00:00.000Z' }];
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] }, { hrReviewRequests, now: new Date('2026-08-05T00:00:00.000Z') });
    const prompt = buildPeriodicReviewPrompt(inputs, 'monthly', null);
    expect(prompt).toContain('At the time of this review, 1 case was awaiting HR review of its investigation (oldest waiting 4 days).');
    expect(prompt).not.toContain('this period was awaiting HR review');
  });

  it('phrases first-pass approval as "at the time of this review" when applicable', () => {
    const hrReviewRequests = Array.from({ length: 3 }, (_, i) => ({ case_id: `c${i}`, step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }));
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] }, { hrReviewRequests });
    const prompt = buildPeriodicReviewPrompt(inputs, 'quarterly', null);
    expect(prompt).toContain('At the time of this review, 100% of investigation submissions had been approved without being returned for further work (3 of 3 reviewed cases).');
  });

  it('states insufficient sample rather than a raw percentage when first-pass is below the floor', () => {
    const hrReviewRequests = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] }, { hrReviewRequests });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toContain('Insufficient completed review volume (1 reviewed case) for a meaningful first-pass approval rate.');
    expect(prompt).not.toMatch(/100%.*approv/);
  });

  it('phrases case-quality issues as "at the time of this review"', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X', description: 'd' },
      { id: 'a2', caseId: 'c2', title: 'X', description: 'd' },
      { id: 'a3', caseId: 'c3', title: 'X', description: 'd' },
    ];
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] }, { cases, allegations });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toContain('At the time of this review, case quality showed:');
  });

  it('instructs the model to distinguish DURING-period figures from CURRENT-position figures', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toMatch(/distinguish figures that occurred DURING this period from figures that reflect the CURRENT position/);
  });

  it('shares the exact same guardrail clause execBrief.js exports, not a second copy', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildPeriodicReviewPrompt(inputs, 'weekly', null);
    expect(prompt).toContain(ANTI_ATTRIBUTION_CLAUSE);
  });

  it('old persisted review inputs (missing every new field) still build a valid prompt without crashing', () => {
    const historicalInputs = {
      totalCases: 50, openCases: 20, openedInPeriod: 5, closedInPeriod: 3,
      casesByType: [['misconduct', 30]], casesByOutcome: [], avgCaseDurationDays: 9,
      significantTypeTrends: [], significantThemeTrends: [],
    };
    expect(() => buildPeriodicReviewPrompt(historicalInputs, 'weekly', null)).not.toThrow();
  });
});
