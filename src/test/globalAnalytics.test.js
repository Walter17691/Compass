import { describe, it, expect } from 'vitest';
import { buildGlobalStatsContext, inferInsightsTab, GLOBAL_CHAT_SYSTEM_PROMPT } from '../lib/globalAnalytics';

const caseStats = { total_cases: 100, active_cases: 30 };

describe('buildGlobalStatsContext', () => {
  it('always includes the base org_case_stats data', () => {
    const context = buildGlobalStatsContext(caseStats, null, null, null);
    expect(context).toContain('ORG-WIDE CASE STATISTICS');
    expect(context).toContain('"total_cases":100');
  });

  it('includes the overview breakdown when provided', () => {
    const overview = { opened_in_period: 5, closed_in_period: 3, cases_by_location: { Manchester: 10 }, cases_by_department: {}, cases_by_manager: {}, avg_case_duration_days: 12, avg_duration_by_location: {} };
    const context = buildGlobalStatsContext(caseStats, overview, null, null);
    expect(context).toContain('ORG-WIDE BREAKDOWN');
    expect(context).toContain('Manchester');
  });

  // Phase 6.5, Batch 5 — a per-manager case-count breakdown would let
  // the assistant answer "which manager has the most cases" directly,
  // the exact thing this phase's own cross-cutting constraint ("never
  // score or rank an individual employee or manager") prohibits.
  it('never includes a per-manager breakdown, even when the RPC data has one', () => {
    const overview = { opened_in_period: 5, closed_in_period: 3, cases_by_location: {}, cases_by_department: {}, cases_by_manager: { 'Jo Smith': 12 }, avg_case_duration_days: 12, avg_duration_by_location: {} };
    const context = buildGlobalStatsContext(caseStats, overview, null, null);
    expect(context).not.toContain('cases_by_manager');
    expect(context).not.toContain('Jo Smith');
  });

  it('includes only significant trends, with the anti-attribution instruction', () => {
    const trendData = {
      by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }, { caseType: 'flat', currentCount: 11, previousCount: 10, byLocation: {} }],
      by_theme_trend: [],
    };
    const context = buildGlobalStatsContext(caseStats, null, trendData, null);
    expect(context).toContain('SIGNIFICANT TRENDS');
    expect(context).toContain('grievance');
    expect(context).not.toContain('"caseType":"flat"');
    expect(context).toContain('never state or imply a trend was caused');
  });

  it('omits the trends section entirely when nothing is significant', () => {
    const trendData = { by_type_trend: [{ caseType: 'flat', currentCount: 11, previousCount: 10, byLocation: {} }], by_theme_trend: [] };
    const context = buildGlobalStatsContext(caseStats, null, trendData, null);
    expect(context).not.toContain('SIGNIFICANT TRENDS');
  });

  it('includes appeal intelligence when at least one breakdown clears its own sample-size floor', () => {
    const appealData = { totalFindings: 5, appealedCount: 3, appealRate: 60, outcomeSampleSize: 3, outcomeCounts: { upheld: 3 }, stageSampleSize: 0, stageCounts: {}, groundSampleSize: 0, commonGrounds: [] };
    const context = buildGlobalStatsContext(caseStats, null, null, appealData);
    expect(context).toContain('APPEAL INTELLIGENCE');
    expect(context).toContain('outcomeCounts');
  });

  it('omits appeal intelligence when there are no findings yet', () => {
    const appealData = { totalFindings: 0, appealedCount: 0, appealRate: null, outcomeSampleSize: 0, outcomeCounts: {}, stageSampleSize: 0, stageCounts: {}, groundSampleSize: 0, commonGrounds: [] };
    const context = buildGlobalStatsContext(caseStats, null, null, appealData);
    expect(context).not.toContain('APPEAL INTELLIGENCE');
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 8.2, MEDIUM) — was
  // gated on totalFindings (an org-wide total unrelated to any specific
  // breakdown's own sample size), so an org with plenty of total findings
  // but only ONE ever-appealed case still shipped that single case's own
  // outcome/ground as if it were a real pattern. Each breakdown is now
  // gated on ITS OWN sample size (outcomeSampleSize/stageSampleSize/
  // groundSampleSize), matching appealIntelligence.js's own per-breakdown
  // UI gating, not a single all-or-nothing check on an unrelated total.
  it('omits a specific breakdown whose own sample size is too small, even when totalFindings is large (Prompt 11 audit, 8.2)', () => {
    const appealData = {
      totalFindings: 50, appealedCount: 1, appealRate: 2,
      outcomeSampleSize: 1, outcomeCounts: { upheld: 1 },
      stageSampleSize: 1, stageCounts: { Disciplinary: 1 },
      groundSampleSize: 1, commonGrounds: [{ ground: 'A single, potentially identifying appeal ground', count: 1 }],
    };
    const context = buildGlobalStatsContext(caseStats, null, null, appealData);
    expect(context).not.toContain('APPEAL INTELLIGENCE');
    expect(context).not.toContain('potentially identifying appeal ground');
  });

  it('ships only the breakdowns that individually clear the floor, not the others', () => {
    const appealData = {
      totalFindings: 20, appealedCount: 10, appealRate: 50,
      outcomeSampleSize: 10, outcomeCounts: { upheld: 6, not_upheld: 4 },
      stageSampleSize: 1, stageCounts: { Disciplinary: 1 },
      groundSampleSize: 0, commonGrounds: [],
    };
    const context = buildGlobalStatsContext(caseStats, null, null, appealData);
    expect(context).toContain('outcomeCounts');
    expect(context).not.toContain('stageCounts');
    expect(context).not.toContain('commonGrounds');
  });
});

// Phase 6.5 hardening (product-principles review) — the model-facing
// system prompt itself, not just the data handed to it, since the model
// could otherwise answer a named-manager performance question from its
// own general reasoning even with no manager data in context.
describe('GLOBAL_CHAT_SYSTEM_PROMPT', () => {
  it('explicitly refuses to rank, score, or evaluate a named manager or employee', () => {
    expect(GLOBAL_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('never rank, score, or evaluate a named manager');
  });

  it('instructs correlation language over causal language', () => {
    expect(GLOBAL_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('never state or imply that a pattern was caused');
    expect(GLOBAL_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('a pattern worth reviewing');
  });
});

describe('inferInsightsTab', () => {
  it('points to trends when a significant trend exists', () => {
    const trendData = { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] };
    expect(inferInsightsTab(trendData)).toBe('trends');
  });

  it('falls back to the overview when nothing significant was found', () => {
    expect(inferInsightsTab(null)).toBe('overview');
    expect(inferInsightsTab({ by_type_trend: [], by_theme_trend: [] })).toBe('overview');
  });
});
