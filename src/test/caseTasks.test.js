import { describe, it, expect } from 'vitest';
import { addTask, updateTask, toggleTaskDone, removeTask, tasksForCase, hrNoteTasks } from '../lib/caseTasks';

describe('addTask', () => {
  it('adds a task scoped to the given case, defaulting priority and status', () => {
    const result = addTask([], 'case1', { name: 'Chase signed statement' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ caseId: 'case1', name: 'Chase signed statement', priority: 'normal', status: 'open' });
  });

  it('ignores a blank name', () => {
    expect(addTask([], 'case1', { name: '   ' })).toEqual([]);
  });

  it('falls back to normal priority for an invalid value', () => {
    const result = addTask([], 'case1', { name: 'x', priority: 'urgent' });
    expect(result[0].priority).toBe('normal');
  });

  it('does not mutate the input array', () => {
    const original = [];
    addTask(original, 'case1', { name: 'x' });
    expect(original).toEqual([]);
  });
});

describe('tasksForCase', () => {
  it('filters to only the given case', () => {
    const all = [{ id: 't1', caseId: 'case1' }, { id: 't2', caseId: 'case2' }];
    expect(tasksForCase(all, 'case1')).toEqual([{ id: 't1', caseId: 'case1' }]);
  });
});

describe('updateTask / toggleTaskDone', () => {
  const base = [{ id: 't1', caseId: 'case1', status: 'open', owner: '' }];

  it('merges fields onto the matching task only', () => {
    const result = updateTask(base, 't1', { owner: 'Sam' });
    expect(result[0].owner).toBe('Sam');
  });

  it('toggles status between open and done', () => {
    const done = toggleTaskDone(base, 't1');
    expect(done[0].status).toBe('done');
    const reopened = toggleTaskDone(done, 't1');
    expect(reopened[0].status).toBe('open');
  });

  it('leaves other tasks untouched', () => {
    const two = [...base, { id: 't2', caseId: 'case1', status: 'open' }];
    const result = toggleTaskDone(two, 't1');
    expect(result[1].status).toBe('open');
  });
});

describe('removeTask', () => {
  it('removes only the matching task', () => {
    const all = [{ id: 't1' }, { id: 't2' }];
    expect(removeTask(all, 't1')).toEqual([{ id: 't2' }]);
  });
});

// Manager Enablement (Phase 4, MP19, §15) — the three HR-note case_task
// sources sendHrGuidance (App.jsx) writes.
describe('hrNoteTasks', () => {
  it('includes tasks tagged with any of the three HR note sources', () => {
    const tasks = [
      { id: 't1', caseId: 'c1', source: 'hr_guidance' },
      { id: 't2', caseId: 'c1', source: 'hr_question' },
      { id: 't3', caseId: 'c1', source: 'hr_witness_request' },
    ];
    expect(hrNoteTasks(tasks, 'c1').map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('excludes an ordinary task and an investigation-plan task', () => {
    const tasks = [
      { id: 't1', caseId: 'c1', source: null },
      { id: 't2', caseId: 'c1', source: 'investigation_plan' },
    ];
    expect(hrNoteTasks(tasks, 'c1')).toEqual([]);
  });

  it('excludes a matching-source task on a different case', () => {
    const tasks = [{ id: 't1', caseId: 'c2', source: 'hr_guidance' }];
    expect(hrNoteTasks(tasks, 'c1')).toEqual([]);
  });
});
