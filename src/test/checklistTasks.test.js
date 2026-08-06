import { describe, it, expect } from 'vitest';
import {
  toggleChecklistTask,
  updateChecklistTaskNote,
  addChecklistTask,
  removeChecklistTask,
  reassignChecklistTaskOwner,
  updateChecklistInstanceFields,
} from '../lib/checklistTasks.js';

const baseInstances = () => ([
  { id: 'a', name: 'Alice', tasks: [{ id: 't1', task: 'Set up laptop', owner: 'IT', done: false, doneAt: null, note: '' }] },
  { id: 'b', name: 'Bob', tasks: [{ id: 't2', task: 'Return badge', owner: 'Facilities', done: false, doneAt: null, note: '' }] },
]);

describe('toggleChecklistTask', () => {
  it('marks the task done and stamps doneAt', () => {
    const result = toggleChecklistTask(baseInstances(), 'a', 't1');
    const task = result.find(i => i.id === 'a').tasks[0];
    expect(task.done).toBe(true);
    expect(task.doneAt).not.toBeNull();
  });

  it('marks a done task not-done and clears doneAt', () => {
    const instances = [{ id: 'a', tasks: [{ id: 't1', done: true, doneAt: '2026-01-01T00:00:00.000Z' }] }];
    const result = toggleChecklistTask(instances, 'a', 't1');
    expect(result[0].tasks[0].done).toBe(false);
    expect(result[0].tasks[0].doneAt).toBeNull();
  });

  it('does not touch other instances or other tasks', () => {
    const result = toggleChecklistTask(baseInstances(), 'a', 't1');
    expect(result.find(i => i.id === 'b').tasks[0].done).toBe(false);
  });
});

describe('updateChecklistTaskNote', () => {
  it('sets the note on the matching task only', () => {
    const result = updateChecklistTaskNote(baseInstances(), 'a', 't1', 'Ordered, arrives Friday');
    expect(result.find(i => i.id === 'a').tasks[0].note).toBe('Ordered, arrives Friday');
    expect(result.find(i => i.id === 'b').tasks[0].note).toBe('');
  });
});

describe('addChecklistTask', () => {
  it('appends a new manual task with defaults', () => {
    const result = addChecklistTask(baseInstances(), 'a', 'Week 1', 'Book induction session', 'HR');
    const tasks = result.find(i => i.id === 'a').tasks;
    expect(tasks).toHaveLength(2);
    const added = tasks[1];
    expect(added.task).toBe('Book induction session');
    expect(added.owner).toBe('HR');
    expect(added.phaseLabel).toBe('Week 1');
    expect(added.phaseId).toBe('week_1');
    expect(added.source).toBe('manual');
    expect(added.done).toBe(false);
  });

  it('defaults owner to HR when not given', () => {
    const result = addChecklistTask(baseInstances(), 'a', 'Week 1', 'Book induction session');
    expect(result.find(i => i.id === 'a').tasks[1].owner).toBe('HR');
  });

  it('ignores blank or whitespace-only task text', () => {
    expect(addChecklistTask(baseInstances(), 'a', 'Week 1', '   ')).toEqual(baseInstances());
    expect(addChecklistTask(baseInstances(), 'a', 'Week 1', '')).toEqual(baseInstances());
  });
});

describe('removeChecklistTask', () => {
  it('removes only the matching task from the matching instance', () => {
    const result = removeChecklistTask(baseInstances(), 'a', 't1');
    expect(result.find(i => i.id === 'a').tasks).toHaveLength(0);
    expect(result.find(i => i.id === 'b').tasks).toHaveLength(1);
  });
});

describe('reassignChecklistTaskOwner', () => {
  it('changes the owner on the matching task only', () => {
    const result = reassignChecklistTaskOwner(baseInstances(), 'a', 't1', 'Line Manager');
    expect(result.find(i => i.id === 'a').tasks[0].owner).toBe('Line Manager');
    expect(result.find(i => i.id === 'b').tasks[0].owner).toBe('Facilities');
  });
});

describe('updateChecklistInstanceFields', () => {
  it('merges fields onto the matching instance only', () => {
    const result = updateChecklistInstanceFields(baseInstances(), 'a', { exitInterviewNotes: 'Left on good terms' });
    expect(result.find(i => i.id === 'a').exitInterviewNotes).toBe('Left on good terms');
    expect(result.find(i => i.id === 'b').exitInterviewNotes).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const instances = baseInstances();
    const snapshot = JSON.parse(JSON.stringify(instances));
    updateChecklistInstanceFields(instances, 'a', { foo: 'bar' });
    expect(instances).toEqual(snapshot);
  });
});
