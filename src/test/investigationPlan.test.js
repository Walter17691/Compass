import { describe, it, expect } from 'vitest';
import { sanitizeInvestigationPlanItems, seedInvestigationPlanTasks, investigationPlanTasks, INVESTIGATION_PLAN_SOURCE } from '../lib/investigationPlan.js';

describe('sanitizeInvestigationPlanItems', () => {
  it('passes through a well-formed AI response', () => {
    const result = sanitizeInvestigationPlanItems([
      { name: 'Interview Priya Shah as a named witness', reasoning: 'Named as a witness in the allegation.' },
      { name: 'Obtain CCTV footage from the loading bay', reasoning: 'Mentioned in the evidence description.' },
    ]);
    expect(result).toEqual([
      { name: 'Interview Priya Shah as a named witness', reasoning: 'Named as a witness in the allegation.' },
      { name: 'Obtain CCTV footage from the loading bay', reasoning: 'Mentioned in the evidence description.' },
    ]);
  });

  it('returns an empty array for a non-array response rather than throwing', () => {
    expect(sanitizeInvestigationPlanItems(null)).toEqual([]);
    expect(sanitizeInvestigationPlanItems({})).toEqual([]);
    expect(sanitizeInvestigationPlanItems('not an array')).toEqual([]);
  });

  it('drops items with a blank name', () => {
    expect(sanitizeInvestigationPlanItems([{ name: '  ' }, { name: 'Real item' }])).toEqual([{ name: 'Real item', reasoning: '' }]);
  });

  it('deduplicates by name, case-insensitively', () => {
    const result = sanitizeInvestigationPlanItems([
      { name: 'Interview Priya Shah' },
      { name: 'interview priya shah' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('caps the list at 8 items', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: 'Item ' + i }));
    expect(sanitizeInvestigationPlanItems(items)).toHaveLength(8);
  });

  it('defaults a missing reasoning to an empty string and trims whitespace on both fields', () => {
    expect(sanitizeInvestigationPlanItems([{ name: '  Chase the missing document  ' }])).toEqual([{ name: 'Chase the missing document', reasoning: '' }]);
  });
});

describe('seedInvestigationPlanTasks', () => {
  it('adds each item as a new case_task tagged with the investigation_plan source', () => {
    const result = seedInvestigationPlanTasks([], 'case1', [{ name: 'Interview Priya Shah', reasoning: 'x' }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ caseId: 'case1', name: 'Interview Priya Shah', source: INVESTIGATION_PLAN_SOURCE, status: 'open' });
  });

  it('skips an item whose name already exists as a task on this case, case-insensitively', () => {
    const existing = [{ id: 't1', caseId: 'case1', name: 'interview priya shah' }];
    const result = seedInvestigationPlanTasks(existing, 'case1', [{ name: 'Interview Priya Shah' }]);
    expect(result).toHaveLength(1);
  });

  it('does not skip a same-named task on a different case', () => {
    const existing = [{ id: 't1', caseId: 'case2', name: 'Interview Priya Shah' }];
    const result = seedInvestigationPlanTasks(existing, 'case1', [{ name: 'Interview Priya Shah' }]);
    expect(result).toHaveLength(2);
  });

  it('assigns each new task a unique id even when seeded in the same synchronous pass', () => {
    const result = seedInvestigationPlanTasks([], 'case1', [{ name: 'Item A' }, { name: 'Item B' }, { name: 'Item C' }]);
    const ids = result.map(t => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('does not mutate the input array', () => {
    const original = [];
    seedInvestigationPlanTasks(original, 'case1', [{ name: 'Item A' }]);
    expect(original).toEqual([]);
  });
});

describe('investigationPlanTasks', () => {
  it('filters to only this case\'s plan-sourced tasks, excluding other sources and other cases', () => {
    const tasks = [
      { id: 't1', caseId: 'case1', source: INVESTIGATION_PLAN_SOURCE },
      { id: 't2', caseId: 'case1', source: null },
      { id: 't3', caseId: 'case2', source: INVESTIGATION_PLAN_SOURCE },
    ];
    expect(investigationPlanTasks(tasks, 'case1')).toEqual([{ id: 't1', caseId: 'case1', source: INVESTIGATION_PLAN_SOURCE }]);
  });
});
