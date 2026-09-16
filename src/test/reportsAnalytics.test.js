import { describe, it, expect } from 'vitest';
import {
  DATE_RANGE_PRESETS, resolveDateRange, bucketGranularityForRange,
  caseLocationName, applyReportFilters, buildEmployeeRecordsByName,
  countOpenCases, countOverdueCases, casesCreatedInRange, casesClosedInRange,
  computeDurationStats, caseAgeingBucketId, computeAgeingDistribution, AGEING_BUCKETS,
  computeOpenedClosedSeries, breakdownByType, breakdownByStage,
  breakdownByOutcome, breakdownByLocation, breakdownByTheme,
} from '../lib/reportsAnalytics.js';

const getStage = cs => cs.stage || "open";
const iso = (daysAgo, now = new Date('2026-09-16T00:00:00.000Z')) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

describe('resolveDateRange', () => {
  it('resolves each preset to the correct day window', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    DATE_RANGE_PRESETS.forEach(p => {
      const { from, to, days } = resolveDateRange(p.id, null, now);
      expect(days).toBe(p.days);
      expect(to.getTime()).toBe(now.getTime());
      expect(Math.round((to - from) / 86400000)).toBe(p.days);
    });
  });

  it('falls back to the default preset for an unrecognised id', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const { days } = resolveDateRange('nonsense', null, now);
    expect(days).toBe(90);
  });

  it('supports a custom range when from/to are both valid and ordered', () => {
    const { from, to } = resolveDateRange('custom', { from: '01/01/2026', to: '01/02/2026' });
    expect(from.getFullYear()).toBe(2026);
    expect(to > from).toBe(true);
  });

  it('falls back to default when custom range is invalid (to before from)', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const { days } = resolveDateRange('custom', { from: '01/02/2026', to: '01/01/2026' }, now);
    expect(days).toBe(90);
  });
});

describe('bucketGranularityForRange', () => {
  it('buckets short ranges weekly, long ranges monthly', () => {
    expect(bucketGranularityForRange(30)).toBe('week');
    expect(bucketGranularityForRange(90)).toBe('week');
    expect(bucketGranularityForRange(182)).toBe('month');
    expect(bucketGranularityForRange(365)).toBe('month');
  });
});

describe('caseLocationName / applyReportFilters', () => {
  const employeeRecordsByName = buildEmployeeRecordsByName([
    { name: 'Sam Employee', location: 'Manchester' },
  ]);
  const cases = [
    { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct' },
    { id: 'c2', employeeName: 'Unknown Person', caseType: 'grievance' },
  ];

  it('resolves location via employeeRecords, falling back to "Not specified"', () => {
    expect(caseLocationName(cases[0], employeeRecordsByName)).toBe('Manchester');
    expect(caseLocationName(cases[1], employeeRecordsByName)).toBe('Not specified');
  });

  it('filters by case type', () => {
    const result = applyReportFilters(cases, employeeRecordsByName, { caseType: 'misconduct' });
    expect(result.map(c => c.id)).toEqual(['c1']);
  });

  it('filters by location', () => {
    const result = applyReportFilters(cases, employeeRecordsByName, { location: 'Manchester' });
    expect(result.map(c => c.id)).toEqual(['c1']);
  });

  it('applies no filtering when filters are empty', () => {
    expect(applyReportFilters(cases, employeeRecordsByName, {})).toHaveLength(2);
  });
});

describe('countOpenCases / countOverdueCases — current state', () => {
  it('counts non-closed cases', () => {
    const cases = [{ stage: 'open' }, { stage: 'closed' }, { stage: 'investigation' }];
    expect(countOpenCases(cases, getStage)).toBe(2);
  });

  it('counts overdue from the given Set, matching whatever needsAttention.js already computed', () => {
    expect(countOverdueCases(new Set(['a', 'b']))).toBe(2);
    expect(countOverdueCases(null)).toBe(0);
  });
});

describe('casesCreatedInRange / casesClosedInRange — period', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  const cases = [
    { id: 'c1', createdAt: iso(10, now), stage: 'open' },
    { id: 'c2', createdAt: iso(100, now), stage: 'open' },
    { id: 'c3', createdAt: iso(5, now), updatedAt: iso(2, now), stage: 'closed' },
    { id: 'c4', createdAt: iso(5, now), updatedAt: iso(2, now), stage: 'open' },
  ];
  const { from, to } = resolveDateRange('30d', null, now);

  it('finds cases created within the window', () => {
    const created = casesCreatedInRange(cases, from, to);
    expect(created.map(c => c.id).sort()).toEqual(['c1', 'c3', 'c4']);
  });

  it('finds only closed cases updated within the window', () => {
    const closed = casesClosedInRange(cases, from, to, getStage);
    expect(closed.map(c => c.id)).toEqual(['c3']);
  });
});

describe('computeDurationStats — median, sample floor, never mislabelled', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  function closedCaseWithMeetings(id, closedDaysAgo, spanDays) {
    return {
      id, stage: 'closed', updatedAt: iso(closedDaysAgo, now),
      meetings: [
        { date: iso(closedDaysAgo + spanDays, now) },
        { date: iso(closedDaysAgo, now) },
      ],
    };
  }
  const { from, to } = resolveDateRange('90d', null, now);

  it('returns null stat/value below the minimum sample size', () => {
    const cases = [closedCaseWithMeetings('c1', 5, 10), closedCaseWithMeetings('c2', 5, 20)];
    const result = computeDurationStats(cases, from, to, getStage);
    expect(result.stat).toBeNull();
    expect(result.value).toBeNull();
    expect(result.sampleSize).toBe(2);
  });

  it('computes a true median (not a mean) once the sample floor is met', () => {
    const cases = [
      closedCaseWithMeetings('c1', 5, 10),
      closedCaseWithMeetings('c2', 5, 20),
      closedCaseWithMeetings('c3', 5, 100),
    ];
    const result = computeDurationStats(cases, from, to, getStage);
    expect(result.stat).toBe('median');
    expect(result.value).toBe(20); // median of [10,20,100], not the mean (43.3)
    expect(result.sampleSize).toBe(3);
  });

  it('excludes cases with fewer than 2 meetings or closed outside the window', () => {
    const cases = [
      closedCaseWithMeetings('c1', 5, 10),
      closedCaseWithMeetings('c2', 5, 20),
      closedCaseWithMeetings('c3', 200, 5), // closed outside 90d window
      { id: 'c4', stage: 'closed', updatedAt: iso(5, now), meetings: [{ date: iso(5, now) }] }, // only 1 meeting
    ];
    const result = computeDurationStats(cases, from, to, getStage);
    expect(result.sampleSize).toBe(2);
  });
});

describe('case ageing — boundary values', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  const boundaryCases = [0, 30, 31, 60, 61, 90, 91, 200];

  it.each(boundaryCases)('assigns the correct bucket for a case exactly %i days old', (age) => {
    const cs = { createdAt: iso(age, now) };
    const bucketId = caseAgeingBucketId(cs, now);
    const expected = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
    expect(bucketId).toBe(expected);
  });

  it('returns null for an unparseable/missing creation date', () => {
    expect(caseAgeingBucketId({ createdAt: null }, now)).toBeNull();
    expect(caseAgeingBucketId({}, now)).toBeNull();
  });

  it('produces all 4 buckets, only counting open cases, with the exact caseIds behind each', () => {
    const cases = [
      { id: 'a', createdAt: iso(0, now), stage: 'open' },
      { id: 'b', createdAt: iso(30, now), stage: 'open' },
      { id: 'c', createdAt: iso(31, now), stage: 'open' },
      { id: 'd', createdAt: iso(60, now), stage: 'open' },
      { id: 'e', createdAt: iso(61, now), stage: 'open' },
      { id: 'f', createdAt: iso(90, now), stage: 'open' },
      { id: 'g', createdAt: iso(91, now), stage: 'open' },
      { id: 'h', createdAt: iso(500, now), stage: 'open' },
      { id: 'i', createdAt: iso(500, now), stage: 'closed' }, // excluded — not open
    ];
    const dist = computeAgeingDistribution(cases, getStage, now);
    expect(dist).toHaveLength(4);
    const byId = Object.fromEntries(dist.map(d => [d.id, d]));
    expect(byId['0-30'].caseIds.sort()).toEqual(['a', 'b']);
    expect(byId['31-60'].caseIds.sort()).toEqual(['c', 'd']);
    expect(byId['61-90'].caseIds.sort()).toEqual(['e', 'f']);
    expect(byId['90+'].caseIds.sort()).toEqual(['g', 'h']);
  });

  it('AGEING_BUCKETS labels match the required 0-30/31-60/61-90/90+ scheme', () => {
    expect(AGEING_BUCKETS.map(b => b.id)).toEqual(['0-30', '31-60', '61-90', '90+']);
  });
});

describe('computeOpenedClosedSeries', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  it('produces one point per bucket with independent opened/closed caseIds', () => {
    const cases = [
      { id: 'c1', createdAt: iso(10, now), stage: 'open' },
      { id: 'c2', createdAt: iso(100, now), updatedAt: iso(10, now), stage: 'closed' },
    ];
    const { from, to } = resolveDateRange('90d', null, now);
    const series = computeOpenedClosedSeries(cases, from, to, 'week', getStage);
    expect(series.length).toBeGreaterThan(0);
    const totalOpened = series.reduce((sum, p) => sum + p.opened, 0);
    const totalClosed = series.reduce((sum, p) => sum + p.closed, 0);
    expect(totalOpened).toBe(1); // only c1 was created inside the 90d window
    expect(totalClosed).toBe(1); // only c2 was closed (updatedAt) inside the window
  });

  it('never double counts — every bucket is half-open [start, end)', () => {
    const { from, to } = resolveDateRange('90d', null, now);
    const series = computeOpenedClosedSeries([], from, to, 'month', getStage);
    for (let i = 1; i < series.length; i++) {
      expect(new Date(series[i].periodStart).getTime()).toBe(new Date(series[i - 1].periodEnd).getTime());
    }
  });
});

describe('computeBreakdown / breakdownBy* — sample floor and drill-down caseIds', () => {
  it('suppresses categories below the minimum sample size without fabricating a fake bar', () => {
    const cases = [
      { id: 'a', caseType: 'misconduct' }, { id: 'b', caseType: 'misconduct' }, { id: 'c', caseType: 'misconduct' },
      { id: 'd', caseType: 'grievance' },
    ];
    const { visible, suppressedCount } = breakdownByType(cases);
    expect(visible).toEqual([{ id: 'misconduct', label: 'misconduct', count: 3, caseIds: ['a', 'b', 'c'] }]);
    expect(suppressedCount).toBe(1);
  });

  it('breaks down by stage using the caller-supplied getStage function', () => {
    const cases = [{ id: 'a', stage: 'investigation' }, { id: 'b', stage: 'investigation' }, { id: 'c', stage: 'investigation' }];
    const { visible } = breakdownByStage(cases, getStage);
    expect(visible[0]).toMatchObject({ id: 'investigation', count: 3 });
  });

  it('breaks down by outcome, ignoring cases with no recorded outcome', () => {
    const cases = [
      { id: 'a', outcome: 'First written warning' }, { id: 'b', outcome: 'First written warning' }, { id: 'c', outcome: 'First written warning' },
      { id: 'd', outcome: null },
    ];
    const { visible } = breakdownByOutcome(cases);
    expect(visible[0]).toMatchObject({ id: 'First written warning', count: 3 });
  });

  it('breaks down by location via employeeRecords, never cases.locationId', () => {
    const employeeRecordsByName = buildEmployeeRecordsByName([
      { name: 'A', location: 'Manchester' }, { name: 'B', location: 'Manchester' }, { name: 'C', location: 'Manchester' },
    ]);
    const cases = [
      { id: '1', employeeName: 'A' }, { id: '2', employeeName: 'B' }, { id: '3', employeeName: 'C' },
    ];
    const { visible } = breakdownByLocation(cases, employeeRecordsByName);
    expect(visible[0]).toMatchObject({ id: 'Manchester', count: 3 });
  });

  it('breaks down by theme, scoped to the currently-filtered case set (not the whole org)', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]; // c4 deliberately excluded (e.g. filtered out)
    const caseThemes = [
      { caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }, { caseId: 'c3', themeId: 't1' },
      { caseId: 'c4', themeId: 't1' }, // should NOT count — c4 isn't in the filtered `cases` set
    ];
    const organisationThemes = [{ id: 't1', name: 'Rota changes' }];
    const { visible } = breakdownByTheme(cases, caseThemes, organisationThemes);
    expect(visible).toEqual([{ id: 't1', label: 'Rota changes', count: 3, caseIds: ['c1', 'c2', 'c3'] }]);
  });

  it('theme breakdown respects the sample floor on the FILTERED count, not the org-wide count', () => {
    // t1 has 5 org-wide occurrences but only 2 within the currently-filtered case set.
    const cases = [{ id: 'c1' }, { id: 'c2' }];
    const caseThemes = [
      { caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' },
      { caseId: 'c3', themeId: 't1' }, { caseId: 'c4', themeId: 't1' }, { caseId: 'c5', themeId: 't1' },
    ];
    const organisationThemes = [{ id: 't1', name: 'Rota changes' }];
    const { visible, suppressedCount } = breakdownByTheme(cases, caseThemes, organisationThemes);
    expect(visible).toEqual([]);
    expect(suppressedCount).toBe(1);
  });
});
