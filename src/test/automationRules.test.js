import { describe, it, expect } from 'vitest';
import { evaluateAutomationRules } from '../lib/automationRules.js';

const NOW = new Date('2026-08-15T12:00:00Z');

describe('evaluateAutomationRules', () => {
  it('returns no suggestions for a case with nothing outstanding', () => {
    const cs = { id: 'c1', meetings: [] };
    expect(evaluateAutomationRules(cs, { now: NOW })).toEqual([]);
  });

  it('flags a meeting record unsigned for 5+ days', () => {
    const cs = { id: 'c1', meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'pending', date: '2026-08-08' }] };
    const suggestions = evaluateAutomationRules(cs, { now: NOW });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ruleId).toBe('unsigned_meeting_record_stale');
    expect(suggestions[0].reason).toContain('7 days ago');
  });

  it('does not flag a meeting record unsigned for fewer than 5 days', () => {
    const cs = { id: 'c1', meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'pending', date: '2026-08-12' }] };
    expect(evaluateAutomationRules(cs, { now: NOW })).toEqual([]);
  });

  it('does not flag a meeting record that has no record yet', () => {
    const cs = { id: 'c1', meetings: [{ type: 'Investigation', record: '', signStatus: 'pending', date: '2026-08-01' }] };
    expect(evaluateAutomationRules(cs, { now: NOW })).toEqual([]);
  });

  it('does not flag a signed meeting record', () => {
    const cs = { id: 'c1', meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'signed', date: '2026-08-01' }] };
    expect(evaluateAutomationRules(cs, { now: NOW })).toEqual([]);
  });

  it('flags an overdue open task', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Chase witness statement', status: 'open', dueDate: '2026-08-10' }];
    const suggestions = evaluateAutomationRules(cs, { caseTasks, now: NOW });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ruleId).toBe('overdue_task');
    expect(suggestions[0].label).toBe('Review overdue task');
    expect(suggestions[0].reason).toContain('Chase witness statement');
  });

  it('does not flag a completed task even if its due date has passed', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Done thing', status: 'done', dueDate: '2026-08-01' }];
    expect(evaluateAutomationRules(cs, { caseTasks, now: NOW })).toEqual([]);
  });

  it('does not flag a task with no due date', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'No due date', status: 'open', dueDate: '' }];
    expect(evaluateAutomationRules(cs, { caseTasks, now: NOW })).toEqual([]);
  });

  it('pluralizes the overdue task label for more than one', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseTasks = [
      { id: 't1', caseId: 'c1', name: 'A', status: 'open', dueDate: '2026-08-01' },
      { id: 't2', caseId: 'c1', name: 'B', status: 'open', dueDate: '2026-08-02' },
    ];
    const suggestions = evaluateAutomationRules(cs, { caseTasks, now: NOW });
    expect(suggestions[0].label).toBe('Review 2 overdue tasks');
  });

  it('flags an unanswered question open 3+ days', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'unanswered_question', status: 'open', createdAt: '2026-08-10T00:00:00Z' }];
    const suggestions = evaluateAutomationRules(cs, { caseSignals, now: NOW });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ruleId).toBe('unanswered_question_stale');
  });

  it('ignores a resolved unanswered question', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'unanswered_question', status: 'resolved', createdAt: '2026-08-01T00:00:00Z' }];
    expect(evaluateAutomationRules(cs, { caseSignals, now: NOW })).toEqual([]);
  });

  it('flags an open process_risk signal regardless of age', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'process_risk', status: 'open', title: 'Notice period too short', createdAt: '2026-08-15T00:00:00Z' }];
    const suggestions = evaluateAutomationRules(cs, { caseSignals, now: NOW });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].ruleId).toBe('process_risk_open');
    expect(suggestions[0].reason).toBe('Notice period too short');
  });

  it('only returns suggestions for the case they belong to', () => {
    const cs = { id: 'c1', meetings: [] };
    const caseTasks = [{ id: 't1', caseId: 'c2', name: 'Other case task', status: 'open', dueDate: '2026-08-01' }];
    expect(evaluateAutomationRules(cs, { caseTasks, now: NOW })).toEqual([]);
  });

  it('returns multiple independent suggestions at once', () => {
    const cs = { id: 'c1', meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'pending', date: '2026-08-01' }] };
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'A', status: 'open', dueDate: '2026-08-01' }];
    const suggestions = evaluateAutomationRules(cs, { caseTasks, now: NOW });
    expect(suggestions.map(s => s.ruleId).sort()).toEqual(['overdue_task', 'unsigned_meeting_record_stale']);
  });
});
