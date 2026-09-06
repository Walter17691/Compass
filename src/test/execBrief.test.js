import { describe, it, expect } from 'vitest';
import { buildExecutiveBriefInputs, buildExecutiveBriefPrompt, ANTI_ATTRIBUTION_CLAUSE } from '../lib/execBrief';

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

// Insights Phase 6 (Actionability + Executive Reporting) — validated
// Phases 2-5 metrics threaded into buildExecutiveBriefInputs's own
// orgData param. Every fixture below builds only the minimum shape each
// underlying, already-tested calculation function needs (see
// needsAttention.js/trendDetection.js/hrReviewIntelligence.js/
// caseQualityAnalytics.js/appealIntelligence.js's own test files for
// exhaustive coverage of those functions themselves) — these tests are
// about the WIRING into the brief, not re-testing each calculation.
const noTrend = { by_type_trend: [], by_theme_trend: [] };

describe('buildExecutiveBriefInputs — Phase 2-5 enrichment (Insights Phase 6)', () => {
  it('no orgData at all: every new field degrades to null/empty, never a crash', () => {
    const inputs = buildExecutiveBriefInputs(overview, noTrend);
    expect(inputs.overallVolume).toBeNull();
    expect(inputs.needsAttention).toBeNull();
    expect(inputs.processQuality).toEqual({ pendingHrReview: null, firstPassApproval: null, caseQualityIssues: [] });
    expect(inputs.appealSummary).toBeNull();
  });

  it('Phase 2: needs-attention signals present when cases/dueSoon are supplied', () => {
    const cases = [
      { id: 'c1', stage: 'open', createdAt: new Date().toISOString() },
      { id: 'c2', stage: 'open', createdAt: new Date().toISOString() },
    ];
    const dueSoon = [{ caseId: 'c1', overdue: true, daysOverdue: 3 }];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, dueSoon });
    expect(inputs.needsAttention.overdueCount).toBe(1);
  });

  it('Phase 3: a significant case-volume increase is included once, under overallVolume', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const cases = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: new Date(now.getTime() - 100 * 86400000).toISOString() })));
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, now, periodDays: 90 });
    expect(inputs.overallVolume).toEqual({ currentCount: 13, previousCount: 10, pctChange: 30 });
  });

  it('Phase 3: a significant case-volume DECREASE is also included (not increase-only)', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const cases = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: new Date(now.getTime() - 100 * 86400000).toISOString() })));
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, now, periodDays: 90 });
    expect(inputs.overallVolume.pctChange).toBe(-20);
  });

  it('a non-significant volume change is omitted entirely (no fabricated pattern from noise)', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const cases = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: new Date(now.getTime() - 100 * 86400000).toISOString() })));
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, now, periodDays: 90 });
    expect(inputs.overallVolume).toBeNull();
  });

  it('Phase 4: a significant theme INCREASE is included in significantThemeTrends', () => {
    const trendData = { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }] };
    const inputs = buildExecutiveBriefInputs(overview, trendData);
    expect(inputs.significantThemeTrends).toEqual([{ themeName: 'Rota changes', currentCount: 13, previousCount: 10 }]);
  });

  it('Phase 4: a significant theme DECREASE is also included (upgraded from the old increase-only filter)', () => {
    const trendData = { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Communication', currentCount: 6, previousCount: 10, byLocation: {} }] };
    const inputs = buildExecutiveBriefInputs(overview, trendData);
    expect(inputs.significantThemeTrends).toEqual([{ themeName: 'Communication', currentCount: 6, previousCount: 10 }]);
  });

  it('Phase 5: pending HR review is included when hrReviewRequests are supplied', () => {
    const hrReviewRequests = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-01T00:00:00.000Z' }];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { hrReviewRequests, now: new Date('2026-08-05T00:00:00.000Z') });
    expect(inputs.processQuality.pendingHrReview).toEqual({ count: 1, caseIds: ['c1'], oldestPendingDays: 4 });
  });

  it('Phase 5: first-pass rate applicable once the sample floor is met', () => {
    const hrReviewRequests = Array.from({ length: 3 }, (_, i) => ({ case_id: `c${i}`, step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }));
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { hrReviewRequests });
    expect(inputs.processQuality.firstPassApproval.applicable).toBe(true);
    expect(inputs.processQuality.firstPassApproval.rate).toBe(100);
  });

  it('Phase 5: first-pass BELOW sample floor is marked not applicable, never a raw percentage', () => {
    const hrReviewRequests = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { hrReviewRequests });
    expect(inputs.processQuality.firstPassApproval).toEqual({ applicable: false, denominator: 1, numerator: 1, rate: null, reworkCaseIds: [] });
  });

  it('Phase 5: case-quality issue counts are included, capped at the top 3, once the panel sample floor is met', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X', description: 'd' },
      { id: 'a2', caseId: 'c2', title: 'X', description: 'd' },
      { id: 'a3', caseId: 'c3', title: 'X', description: 'd' },
    ];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, allegations });
    expect(inputs.processQuality.caseQualityIssues.length).toBeLessThanOrEqual(3);
    expect(inputs.processQuality.caseQualityIssues[0]).toHaveProperty('label');
    expect(inputs.processQuality.caseQualityIssues[0]).toHaveProperty('count');
    expect(inputs.processQuality.caseQualityIssues[0]).toHaveProperty('pct');
    // no caseIds — those exist only for the UI's own drill-down, never
    // useful (or appropriate) in a narrative report.
    expect(inputs.processQuality.caseQualityIssues[0]).not.toHaveProperty('caseIds');
  });

  it('appeal denominator wording is preserved: appealedCount/totalFindings, never rephrased as a case count', () => {
    const allegations = Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, caseId: `c${i}`, status: 'substantiated', appealOutcome: 'upheld' }));
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { allegations, cases: [] });
    expect(inputs.appealSummary).toEqual({ appealRate: 100, appealedCount: 3, totalFindings: 3 });
  });

  it('does not duplicate the Manager Insights rework metric — only Phase 5\'s authoritative model is read', () => {
    const hrReviewRequests = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c3', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { hrReviewRequests });
    // exactly one rework-shaped field exists, sourced from
    // computeFirstPassApprovalRate — no separate/duplicate
    // investigationsReturnedForRework-style raw count anywhere.
    expect(inputs.processQuality.firstPassApproval.reworkCaseIds).toEqual(['c1']);
    expect(inputs).not.toHaveProperty('investigationsReturnedForRework');
  });

  it('never includes case-level content: no employee names, case ids, allegation text, or review comments anywhere in the output', () => {
    const cases = [{ id: 'c1', employeeName: 'Real Person Name' }];
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'Confidential allegation text', description: 'sensitive detail', status: 'substantiated' }];
    const hrReviewRequests = [{ case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z', comments: 'SENSITIVE COMMENT', record_snapshot: 'SENSITIVE SNAPSHOT' }];
    const inputs = buildExecutiveBriefInputs(overview, noTrend, { cases, allegations, hrReviewRequests });
    const serialised = JSON.stringify(inputs);
    expect(serialised).not.toContain('Real Person Name');
    expect(serialised).not.toContain('Confidential allegation text');
    expect(serialised).not.toContain('SENSITIVE COMMENT');
    expect(serialised).not.toContain('SENSITIVE SNAPSHOT');
  });

  it('an old, pre-Phase-6 persisted supporting_data shape (missing every new field) still builds a valid prompt without crashing', () => {
    const historicalInputs = {
      totalCases: 100, openCases: 30, openedInPeriod: 10, closedInPeriod: 8,
      casesByType: [['misconduct', 60]], casesByOutcome: [], avgCaseDurationDays: 12,
      significantTypeTrends: [{ caseType: 'grievance', currentCount: 13, previousCount: 10 }],
      significantThemeTrends: [],
      // deliberately no overallVolume/needsAttention/processQuality/appealSummary keys
    };
    expect(() => buildExecutiveBriefPrompt(historicalInputs)).not.toThrow();
    const prompt = buildExecutiveBriefPrompt(historicalInputs);
    expect(prompt).toContain('Total cases: 100');
  });
});

describe('buildExecutiveBriefPrompt — AI prompt safety (Insights Phase 6, §17)', () => {
  it('exports the guardrail clause for periodicReview.js to share, rather than a second independently-editable copy', () => {
    expect(typeof ANTI_ATTRIBUTION_CLAUSE).toBe('string');
    expect(ANTI_ATTRIBUTION_CLAUSE.length).toBeGreaterThan(0);
  });

  it('instructs the model never to invent a number', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/never invent, estimate, or round a number/i);
  });

  it('instructs the model not to infer causation', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/do not infer causation/i);
  });

  it('instructs the model never to attribute a pattern to a named individual/manager', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/never state or imply that a pattern was \*caused\* by a named manager, team, or individual/i);
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/never attribute any figure to a specific person/i);
  });

  it('instructs the model not to infer workforce-wide incidence without a supplied denominator', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/do not infer workforce-wide incidence, prevalence, or a rate without an explicit denominator/i);
  });

  it('reserves the word "risk" for an actual Risk Map flag', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/only use the word "risk" for a figure explicitly described as a risk map flag/i);
  });

  it('instructs the model not to state a percentage when a rate is marked not meaningful', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/say so plainly rather than stating a percentage anyway/i);
  });

  it('preserves the appeal-rate denominator discipline', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/never rephrase it as "of cases" or "of the caseload"/i);
  });

  it('instructs the model never to reference individual case content', () => {
    expect(ANTI_ATTRIBUTION_CLAUSE).toMatch(/do not reference or imply access to any individual case's content, employee name, allegation text, evidence, or review comments/i);
  });

  it('the built prompt for a real brief contains the full guardrail clause verbatim', () => {
    const inputs = buildExecutiveBriefInputs(overview, noTrend);
    const prompt = buildExecutiveBriefPrompt(inputs);
    expect(prompt).toContain(ANTI_ATTRIBUTION_CLAUSE);
  });
});
