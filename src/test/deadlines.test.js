import { describe, it, expect } from 'vitest';
import { computeDueSoon } from '../lib/deadlines.js';

describe('computeDueSoon — daysOverdue', () => {
  it('reports the actual number of days overdue, not always zero', () => {
    const dsarRequests = [{ id: '1', employeeName: 'Jane Doe', dueDate: '2025-01-01' }];
    const today = new Date('2025-01-31');
    const [d] = computeDueSoon([], dsarRequests, today);
    expect(d.overdue).toBe(true);
    expect(d.daysOverdue).toBe(30);
  });

  it('leaves daysOverdue at zero for items that are not yet due', () => {
    const dsarRequests = [{ id: '1', employeeName: 'Jane Doe', dueDate: '2025-02-10' }];
    const today = new Date('2025-01-31');
    const [d] = computeDueSoon([], dsarRequests, today);
    expect(d.overdue).toBe(false);
    expect(d.daysOverdue).toBe(0);
    expect(d.daysLeft).toBe(10);
  });

  it('sorts the most overdue item first among overdue items', () => {
    const dsarRequests = [
      { id: '1', employeeName: 'Barely overdue', dueDate: '2025-01-29' },
      { id: '2', employeeName: 'Very overdue', dueDate: '2025-01-01' },
    ];
    const today = new Date('2025-01-31');
    const [first, second] = computeDueSoon([], dsarRequests, today);
    expect(first.employeeName).toBe('Very overdue');
    expect(second.employeeName).toBe('Barely overdue');
  });

  it('sorts not-yet-due items soonest-first, unaffected by the overdue fix', () => {
    const dsarRequests = [
      { id: '1', employeeName: 'Later', dueDate: '2025-02-20' },
      { id: '2', employeeName: 'Sooner', dueDate: '2025-02-17' },
    ];
    const today = new Date('2025-02-16');
    const due = computeDueSoon([], dsarRequests, today);
    expect(due.map(d => d.employeeName)).toEqual(['Sooner', 'Later']);
  });

  it('always sorts overdue items before not-yet-due items, regardless of magnitude', () => {
    const dsarRequests = [
      { id: '1', employeeName: 'NotYetDue', dueDate: '2025-02-20' },
      { id: '2', employeeName: 'Overdue', dueDate: '2025-02-10' },
    ];
    const today = new Date('2025-02-16');
    const due = computeDueSoon([], dsarRequests, today);
    expect(due[0].employeeName).toBe('Overdue');
  });
});

describe('computeDueSoon — DSAR deadlines', () => {
  it('skips completed DSAR requests', () => {
    const dsarRequests = [{ id: '1', employeeName: 'Ivy', dueDate: '2025-06-17', status: 'completed' }];
    const due = computeDueSoon([], dsarRequests, new Date('2025-06-16'));
    expect(due).toHaveLength(0);
  });

  it('falls back to snake_case employee_name/due_date fields from the DB row shape', () => {
    const dsarRequests = [{ id: '1', employee_name: 'Jack', due_date: '2025-06-17' }];
    const due = computeDueSoon([], dsarRequests, new Date('2025-06-16'));
    expect(due).toHaveLength(1);
    expect(due[0].employeeName).toBe('Jack');
  });
});

describe('computeDueSoon — case-derived ACAS/statutory deadlines', () => {
  const today = new Date('2025-06-16');

  it('surfaces a manual next-step deadline from a meeting, skipping done/undated ones', () => {
    const cases = [{
      id: 'c1', employeeName: 'Alice', stage: 'disciplinary',
      meetings: [{ id: 'm1', type: 'Disciplinary', nextSteps: [
        { step: 'Send outcome letter', deadline: '20/06/2025', done: false },
        { step: 'Already done', deadline: '20/06/2025', done: true },
        { step: 'No deadline set', done: false },
      ] }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'next_step');
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Send outcome letter');
  });

  it('computes the disciplinary outcome deadline as 5 working days after the hearing, skipping the weekend', () => {
    const cases = [{
      id: 'c2', employeeName: 'Bob', stage: 'disciplinary',
      meetings: [{ id: 'm1', type: 'Disciplinary hearing', date: '13/06/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'outcome');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('20/06/2025');
  });

  it('does not flag an outcome deadline once the outcome has already been recorded', () => {
    const cases = [{
      id: 'c3', employeeName: 'Bob', stage: 'outcome', outcome: 'dismissal',
      meetings: [{ id: 'm1', type: 'Disciplinary hearing', date: '13/06/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'outcome');
    expect(items).toHaveLength(0);
  });

  it('computes the appeal window as 5 working days after an outcome letter is issued', () => {
    const cases = [{
      id: 'c4', employeeName: 'Carol', stage: 'outcome', outcome: 'written warning',
      meetings: [{ id: 'm1', type: 'Disciplinary hearing', date: '13/06/2025', letterOutput: '...' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'appeal');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('20/06/2025');
  });

  it('flags an investigation as overrunning once 21+ days have passed, due 28 days from the first meeting', () => {
    const cases = [{
      id: 'c5', employeeName: 'Dan', stage: 'investigation',
      meetings: [{ id: 'm1', type: 'Investigation meeting', date: '20/05/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'investigation');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('17/06/2025');
  });

  it('does not flag an investigation as overrunning before 21 days have passed', () => {
    const cases = [{
      id: 'c6', employeeName: 'Dan', stage: 'investigation',
      meetings: [{ id: 'm1', type: 'Investigation meeting', date: '10/06/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'investigation');
    expect(items).toHaveLength(0);
  });

  it('does not flag an investigation as overrunning once the report is written', () => {
    const cases = [{
      id: 'c6b', employeeName: 'Dan', stage: 'investigation', investigationReport: 'done',
      meetings: [{ id: 'm1', type: 'Investigation meeting', date: '20/05/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'investigation');
    expect(items).toHaveLength(0);
  });

  it('computes grievance acknowledgement as 5 working days from receipt when no meetings have happened yet', () => {
    const cases = [{
      id: 'c7', employeeName: 'Eve', caseType: 'grievance', dateReceived: '13/06/2025', meetings: [],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'grievance');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('20/06/2025');
  });

  it('does not flag grievance acknowledgement once a meeting has been held', () => {
    const cases = [{
      id: 'c8', employeeName: 'Eve', caseType: 'grievance', dateReceived: '13/06/2025',
      meetings: [{ id: 'm1', type: 'Grievance meeting', date: '14/06/2025' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'grievance');
    expect(items).toHaveLength(0);
  });

  it('flags a pending signature for chasing after 7 days', () => {
    const cases = [{
      id: 'c9', employeeName: 'Frank', stage: 'outcome', meetings: [],
      evidence: [{ id: 'e1', signStatus: 'pending', signId: 'sig1', sentAt: '2025-06-05' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'signature');
    expect(items).toHaveLength(1);
  });

  it('does not flag a pending signature within the first 7 days', () => {
    const cases = [{
      id: 'c10', employeeName: 'Frank', stage: 'outcome', meetings: [],
      evidence: [{ id: 'e1', signStatus: 'pending', signId: 'sig1', sentAt: '2025-06-12' }],
    }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'signature');
    expect(items).toHaveLength(0);
  });

  it('ignores closed cases entirely', () => {
    const cases = [{
      id: 'c11', employeeName: 'Grace', stage: 'closed', caseType: 'grievance',
      dateReceived: '13/06/2025', meetings: [],
    }];
    expect(computeDueSoon(cases, [], today)).toHaveLength(0);
  });

  it('excludes deadlines more than 14 days away', () => {
    const dsarRequests = [{ id: 'd1', employeeName: 'Henry', dueDate: '2025-07-01' }];
    expect(computeDueSoon([], dsarRequests, new Date('2025-06-01'))).toHaveLength(0);
  });
});
