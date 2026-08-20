import { describe, it, expect } from 'vitest';
import { buildExecutiveBriefInputs, buildExecutiveBriefPrompt } from '../lib/execBrief';

const overview = {
  total_cases: 100, open_cases: 30, opened_in_period: 10, closed_in_period: 8,
  cases_by_type: { misconduct: 60, grievance: 40 },
  cases_by_outcome: { 'No further action': 20 },
  avg_case_duration_days: 12,
};

describe('buildExecutiveBriefInputs', () => {
  it('extracts real overview figures', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    expect(inputs.totalCases).toBe(100);
    expect(inputs.openCases).toBe(30);
    expect(inputs.casesByType).toEqual([['misconduct', 60], ['grievance', 40]]);
  });

  it('only includes significant trends, filtering out flat ones', () => {
    const trendData = {
      by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }, { caseType: 'flat', currentCount: 11, previousCount: 10, byLocation: {} }],
      by_theme_trend: [],
    };
    const inputs = buildExecutiveBriefInputs(overview, trendData);
    expect(inputs.significantTypeTrends).toEqual([{ caseType: 'grievance', currentCount: 13, previousCount: 10 }]);
  });

  it('handles missing overview/trend data gracefully', () => {
    const inputs = buildExecutiveBriefInputs(null, null);
    expect(inputs.totalCases).toBe(0);
    expect(inputs.casesByType).toEqual([]);
    expect(inputs.significantTypeTrends).toEqual([]);
  });
});

describe('buildExecutiveBriefPrompt', () => {
  it('includes the exact anti-attribution wording from ErReportScreen', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildExecutiveBriefPrompt(inputs);
    expect(prompt).toContain('Compass has identified a correlation between…');
    expect(prompt).toContain('never state or imply that a pattern was *caused* by a named manager, team, or individual');
  });

  it('includes real case counts and requests a recommendations list', () => {
    const inputs = buildExecutiveBriefInputs(overview, { by_type_trend: [], by_theme_trend: [] });
    const prompt = buildExecutiveBriefPrompt(inputs);
    expect(prompt).toContain('Total cases: 100');
    expect(prompt).toContain('Recommended areas for leadership attention');
  });

  it('includes significant trend data in the prompt when present', () => {
    const trendData = { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] };
    const inputs = buildExecutiveBriefInputs(overview, trendData);
    const prompt = buildExecutiveBriefPrompt(inputs);
    expect(prompt).toContain('grievance: 13 vs 10');
  });
});
