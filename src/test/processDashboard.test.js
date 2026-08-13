import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeStageBottlenecks, DEFAULT_STAGE_TARGET_DAYS } from '../lib/processDashboard';

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
