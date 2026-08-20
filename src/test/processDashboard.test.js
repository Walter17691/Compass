import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeStageBottlenecks, computeStageDurations, computeStageBottlenecksByLocation, DEFAULT_STAGE_TARGET_DAYS } from '../lib/processDashboard';

describe('computeStageBottlenecks', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('flags a stage whose average time-in-stage exceeds the default target', () => {
    const cases = [
      { id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-03T00:00:00.000Z' } } },
    ];
    const [result] = computeStageBottlenecks(cases);
    expect(result.processType).toBe('Misconduct');
    expect(result.stage).toBe('Investigation');
    expect(result.caseCount).toBe(2);
    expect(result.targetDays).toBe(DEFAULT_STAGE_TARGET_DAYS);
    expect(result.avgDays).toBeGreaterThan(DEFAULT_STAGE_TARGET_DAYS);
  });

  it('does not flag a stage whose average time-in-stage is within target', () => {
    const cases = [
      { id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-18T00:00:00.000Z' } } },
    ];
    expect(computeStageBottlenecks(cases)).toEqual([]);
  });

  it('falls back to createdAt when no stageEnteredAt entry exists for the current stage yet', () => {
    const cases = [{ id: 'c1', caseType: 'misconduct', stage: 'investigation', createdAt: '2026-08-01T00:00:00.000Z' }];
    const [result] = computeStageBottlenecks(cases);
    expect(result.caseCount).toBe(1);
    expect(result.avgDays).toBeGreaterThan(DEFAULT_STAGE_TARGET_DAYS);
  });

  it('excludes closed cases entirely', () => {
    const cases = [{ id: 'c1', caseType: 'misconduct', stage: 'closed', createdAt: '2026-01-01T00:00:00.000Z' }];
    expect(computeStageBottlenecks(cases)).toEqual([]);
  });

  it('excludes a case with no usable date at all', () => {
    const cases = [{ id: 'c1', caseType: 'misconduct', stage: 'investigation' }];
    expect(computeStageBottlenecks(cases)).toEqual([]);
  });

  it('groups by process type and stage separately, not just by stage id', () => {
    const cases = [
      { id: 'c1', caseType: 'misconduct', stage: 'outcome', timelineOverrides: { stageEnteredAt: { outcome: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', caseType: 'grievance', stage: 'outcome', timelineOverrides: { stageEnteredAt: { outcome: '2026-08-05T00:00:00.000Z' } } },
    ];
    const results = computeStageBottlenecks(cases);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.processType).sort()).toEqual(['Grievance', 'Misconduct']);
  });

  it('sorts the worst bottleneck first', () => {
    const cases = [
      { id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-05T00:00:00.000Z' } } },
      { id: 'c2', caseType: 'grievance', stage: 'hearing', timelineOverrides: { stageEnteredAt: { hearing: '2026-07-01T00:00:00.000Z' } } },
    ];
    const results = computeStageBottlenecks(cases);
    expect(results[0].processType).toBe('Grievance');
    expect(results[0].avgDays).toBeGreaterThan(results[1].avgDays);
  });

  it('returns an empty array for no cases', () => {
    expect(computeStageBottlenecks([])).toEqual([]);
  });
});

// Organisational ER Intelligence (Phase 6, OP3) — computeStageDurations is
// the same underlying per-stage average this file already computed
// internally, now exported without computeStageBottlenecks' "only if over
// target" filter, so the Insights dashboard's "avg investigation duration"
// can show the real average even when it's healthy.
describe('computeStageDurations', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('includes a stage whose average time-in-stage is within target, unlike computeStageBottlenecks', () => {
    const cases = [{ id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-18T00:00:00.000Z' } } }];
    expect(computeStageBottlenecks(cases)).toEqual([]);
    const [result] = computeStageDurations(cases);
    expect(result.stage).toBe('Investigation');
    expect(result.caseCount).toBe(1);
    expect(result.avgDays).toBeLessThan(DEFAULT_STAGE_TARGET_DAYS);
  });

  // Process Intelligence (P18) — an org's process template can set its
  // own target_days per process type, overriding the uniform default for
  // that process type's groups only.
  it('uses a template\'s target_days for its own process type when provided', () => {
    const cases = [{ id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-05T00:00:00.000Z' } } }];
    const templates = [{ process_type: 'misconduct', target_days: 20 }];
    // 15 days in stage — flagged against the default (10) but not against
    // this template's own, higher target (20).
    expect(computeStageBottlenecks(cases, [])).toHaveLength(1);
    expect(computeStageBottlenecks(cases, templates)).toEqual([]);
  });

  it('a template\'s target_days only affects its own process type, not others', () => {
    const cases = [
      { id: 'c1', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-05T00:00:00.000Z' } } },
      { id: 'c2', caseType: 'grievance', stage: 'hearing', timelineOverrides: { stageEnteredAt: { hearing: '2026-08-05T00:00:00.000Z' } } },
    ];
    const templates = [{ process_type: 'misconduct', target_days: 20 }];
    const results = computeStageBottlenecks(cases, templates);
    expect(results).toHaveLength(1);
    expect(results[0].processType).toBe('Grievance');
    expect(results[0].targetDays).toBe(DEFAULT_STAGE_TARGET_DAYS);
  });
});

// Organisational ER Intelligence (Phase 6, OP10, §7) — extends
// computeStageBottlenecks with a per-location breakdown, sharing the
// same underlying per-case day computation (groupCasesByStage).
describe('computeStageBottlenecksByLocation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  const employeeRecords = [
    { name: 'Sam Employee', location: 'Manchester' },
    { name: 'Jo Employee', location: 'London' },
  ];

  it('only includes stages that are genuinely bottlenecked overall', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-18T00:00:00.000Z' } } }];
    expect(computeStageBottlenecksByLocation(cases, employeeRecords)).toEqual([]);
  });

  it('breaks a bottlenecked stage down by employee location', () => {
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-03T00:00:00.000Z' } } },
      { id: 'c3', employeeName: 'Jo Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-05T00:00:00.000Z' } } },
    ];
    const [result] = computeStageBottlenecksByLocation(cases, employeeRecords);
    expect(result.caseCount).toBe(3);
    expect(result.byLocation).toHaveLength(2);
    const manchester = result.byLocation.find(l => l.location === 'Manchester');
    expect(manchester.caseCount).toBe(2);
    expect(manchester.cases.map(c => c.caseId).sort()).toEqual(['c1', 'c2']);
  });

  it('defaults a case with no matching employee record to "Not specified"', () => {
    const cases = [
      { id: 'c1', employeeName: 'Unknown Person', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', employeeName: 'Unknown Person', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
    ];
    const [result] = computeStageBottlenecksByLocation(cases, employeeRecords);
    expect(result.byLocation[0].location).toBe('Not specified');
  });

  it('sorts locations within a stage by avgDays, worst first', () => {
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', employeeName: 'Jo Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-07-01T00:00:00.000Z' } } },
    ];
    const [result] = computeStageBottlenecksByLocation(cases, employeeRecords);
    expect(result.byLocation[0].location).toBe('London');
  });

  it('returns an empty array for no cases', () => {
    expect(computeStageBottlenecksByLocation([], employeeRecords)).toEqual([]);
  });

  it('works without employeeRecords at all, defaulting every case to "Not specified"', () => {
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
      { id: 'c2', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } },
    ];
    const [result] = computeStageBottlenecksByLocation(cases);
    expect(result.byLocation).toEqual([{ location: 'Not specified', caseCount: 2, avgDays: result.avgDays, cases: expect.any(Array) }]);
  });
});
