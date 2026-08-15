import { describe, it, expect } from 'vitest';
import { resolveCommandBarPlan } from '../lib/commandBar.js';

const cases = [
  { id: 'c1', employeeName: 'Sarah Jones' },
  { id: 'c2', employeeName: 'James Smith' },
];

describe('resolveCommandBarPlan', () => {
  it('resolves a create_task action against a matching case', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'create_task', employeeName: 'Sarah Jones', taskName: 'Chase witness statement', dueDate: '2026-08-20' }] }, cases);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ resolved: true, caseId: 'c1', caseEmployeeName: 'Sarah Jones', taskName: 'Chase witness statement' });
    expect(plan.actions[0].summary).toBe('Create task "Chase witness statement" on Sarah Jones\'s case (due 2026-08-20).');
  });

  it('resolves an open_case action against a matching case', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'open_case', employeeName: 'James Smith', taskName: null, dueDate: null }] }, cases);
    expect(plan.actions[0]).toMatchObject({ resolved: true, caseId: 'c2', caseEmployeeName: 'James Smith' });
    expect(plan.actions[0].summary).toBe("Open James Smith's case.");
  });

  it('marks an action unresolved when no case matches the employee name', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'open_case', employeeName: 'Someone Else', taskName: null, dueDate: null }] }, cases);
    expect(plan.actions[0].resolved).toBe(false);
    expect(plan.actions[0].summary).toContain('Someone Else');
  });

  it('marks a create_task action unresolved when no task name is given', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'create_task', employeeName: 'Sarah Jones', taskName: null, dueDate: null }] }, cases);
    expect(plan.actions[0].resolved).toBe(false);
    expect(plan.actions[0].summary).toContain('Sarah Jones');
  });

  it('drops an action of an unsupported type entirely', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'send_letter', employeeName: 'Sarah Jones' }] }, cases);
    expect(plan.actions).toHaveLength(0);
  });

  it('drops an action with no employee name entirely', () => {
    const plan = resolveCommandBarPlan({ actions: [{ type: 'create_task', employeeName: '', taskName: 'Do something' }] }, cases);
    expect(plan.actions).toHaveLength(0);
  });

  it('carries the clarification through when there are no actions', () => {
    const plan = resolveCommandBarPlan({ actions: [], clarification: "I couldn't tell which employee you meant." }, cases);
    expect(plan.actions).toEqual([]);
    expect(plan.clarification).toBe("I couldn't tell which employee you meant.");
  });

  it('handles a malformed/empty AI response gracefully', () => {
    expect(resolveCommandBarPlan(null, cases)).toEqual({ actions: [], clarification: null });
    expect(resolveCommandBarPlan({}, cases)).toEqual({ actions: [], clarification: null });
  });

  it('resolves multiple independent actions in one plan', () => {
    const plan = resolveCommandBarPlan({ actions: [
      { type: 'create_task', employeeName: 'Sarah Jones', taskName: 'Chase evidence', dueDate: null },
      { type: 'open_case', employeeName: 'James Smith', taskName: null, dueDate: null },
    ] }, cases);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions.every(a => a.resolved)).toBe(true);
  });
});
