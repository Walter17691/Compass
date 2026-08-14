import { describe, it, expect } from 'vitest';
import { computeDueSoon, groupDueSoon } from '../lib/deadlines.js';

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

describe('computeDueSoon — confidential/caseId/createdBy threading', () => {
  // Consumers that leave Compass's RLS-protected boundary (calendar sync,
  // the digest cron's email/webhook) need these fields to decide whether a
  // deadline is safe to forward — see App.jsx's calendar-sync effect and
  // api/cron/_digest.js's isAuthorisedFor.
  const today = new Date('2025-06-16');

  it('carries confidential/caseId/createdBy through from a confidential case', () => {
    const cases = [{
      id: 'c1', employeeName: 'Alice', stage: 'disciplinary', confidential: true, createdBy: 'user-1',
      meetings: [{ id: 'm1', type: 'Disciplinary', nextSteps: [{ step: 'Send outcome letter', deadline: '20/06/2025', done: false }] }],
    }];
    const [item] = computeDueSoon(cases, [], today);
    expect(item.confidential).toBe(true);
    expect(item.caseId).toBe('c1');
    expect(item.createdBy).toBe('user-1');
  });

  it('defaults confidential to false for a non-confidential case', () => {
    const cases = [{
      id: 'c2', employeeName: 'Bob', stage: 'disciplinary',
      meetings: [{ id: 'm1', type: 'Disciplinary', nextSteps: [{ step: 'Send outcome letter', deadline: '20/06/2025', done: false }] }],
    }];
    const [item] = computeDueSoon(cases, [], today);
    expect(item.confidential).toBe(false);
  });

  it('a DSAR deadline is never confidential and has no case link', () => {
    const dsarRequests = [{ id: 'd1', employeeName: 'Carol', dueDate: '2025-06-20' }];
    const [item] = computeDueSoon([], dsarRequests, today);
    expect(item.confidential).toBe(false);
    expect(item.caseId).toBe(null);
    expect(item.createdBy).toBe(null);
  });
});

describe('computeDueSoon — case tasks', () => {
  const today = new Date('2025-06-16');
  const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', confidential: true, createdBy: 'user-1', meetings: [] }];

  it('surfaces an open task with a due date within the window, carrying the parent case metadata', () => {
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Chase signed witness statement', dueDate: '2025-06-20', status: 'open' }];
    const items = computeDueSoon(cases, [], today, caseTasks).filter(d => d.category === 'task');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ employeeName: 'Priya', label: 'Task due: Chase signed witness statement', confidential: true, caseId: 'c1', createdBy: 'user-1' });
  });

  it('ignores a task marked done', () => {
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'x', dueDate: '2025-06-20', status: 'done' }];
    expect(computeDueSoon(cases, [], today, caseTasks).filter(d => d.category === 'task')).toHaveLength(0);
  });

  it('ignores a task with no due date', () => {
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'x', dueDate: '', status: 'open' }];
    expect(computeDueSoon(cases, [], today, caseTasks).filter(d => d.category === 'task')).toHaveLength(0);
  });

  it('ignores a task on a closed case', () => {
    const closedCases = [{ ...cases[0], stage: 'closed' }];
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'x', dueDate: '2025-06-20', status: 'open' }];
    expect(computeDueSoon(closedCases, [], today, caseTasks).filter(d => d.category === 'task')).toHaveLength(0);
  });

  it('existing call sites that omit caseTasks are unaffected', () => {
    expect(computeDueSoon(cases, [], today)).toHaveLength(0);
  });
});

describe('computeDueSoon — wellbeing follow-ups', () => {
  const today = new Date('2025-06-16');

  it('surfaces an open follow-up as confidential with no case link', () => {
    const wellbeingNotes = [{ id: 'w1', employeeName: 'Priya', followUpDate: '2025-06-20', followUpDone: false }];
    const items = computeDueSoon([], [], today, [], wellbeingNotes).filter(d => d.category === 'wellbeing');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ employeeName: 'Priya', confidential: true, caseId: null });
  });

  it('skips a follow-up already marked done', () => {
    const wellbeingNotes = [{ id: 'w1', employeeName: 'Priya', followUpDate: '2025-06-20', followUpDone: true }];
    expect(computeDueSoon([], [], today, [], wellbeingNotes).filter(d => d.category === 'wellbeing')).toHaveLength(0);
  });

  it('skips a note with no follow-up date set', () => {
    const wellbeingNotes = [{ id: 'w1', employeeName: 'Priya', followUpDate: '', followUpDone: false }];
    expect(computeDueSoon([], [], today, [], wellbeingNotes).filter(d => d.category === 'wellbeing')).toHaveLength(0);
  });
});

describe('computeDueSoon — leaver notice period', () => {
  const today = new Date('2025-06-16');

  it('surfaces a leaver whose last working day is approaching with open offboarding tasks', () => {
    const leaverInstances = [{ id: 'l1', name: 'Tom', lastWorkingDay: '2025-06-20', tasks: [{ id: 't1', done: false }] }];
    const items = computeDueSoon([], [], today, [], [], leaverInstances).filter(d => d.category === 'leaver');
    expect(items).toHaveLength(1);
    expect(items[0].employeeName).toBe('Tom');
  });

  it('skips a leaver whose offboarding tasks are all done', () => {
    const leaverInstances = [{ id: 'l1', name: 'Tom', lastWorkingDay: '2025-06-20', tasks: [{ id: 't1', done: true }] }];
    expect(computeDueSoon([], [], today, [], [], leaverInstances).filter(d => d.category === 'leaver')).toHaveLength(0);
  });

  it('skips a leaver with no last working day recorded', () => {
    const leaverInstances = [{ id: 'l1', name: 'Tom', lastWorkingDay: '', tasks: [{ id: 't1', done: false }] }];
    expect(computeDueSoon([], [], today, [], [], leaverInstances).filter(d => d.category === 'leaver')).toHaveLength(0);
  });
});

describe('computeDueSoon — collective redundancy consultation', () => {
  const today = new Date('2025-06-16');

  it('computes a 30-day statutory minimum for 20-99 affected employees', () => {
    const redundancyCases = [{
      id: 'r1', type: 'collective', status: 'consultation', reason: 'Site restructure',
      collectiveInfo: { count: 25, consultationStartDate: '2025-05-20' },
      atRiskEmployees: [],
    }];
    const items = computeDueSoon([], [], today, [], [], [], redundancyCases).filter(d => d.category === 'redundancy');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('19/06/2025');
    expect(items[0].label).toContain('30 days');
  });

  it('computes a 45-day statutory minimum for 100+ affected employees', () => {
    const redundancyCases = [{
      id: 'r2', type: 'collective', status: 'consultation', reason: 'Depot closure',
      collectiveInfo: { count: 120, consultationStartDate: '2025-05-01' },
      atRiskEmployees: [],
    }];
    const items = computeDueSoon([], [], today, [], [], [], redundancyCases).filter(d => d.category === 'redundancy');
    expect(items[0].label).toContain('45 days');
  });

  it('ignores individual redundancy processes, which have no statutory minimum', () => {
    const redundancyCases = [{
      id: 'r3', type: 'individual', status: 'consultation', reason: 'Role redundant',
      collectiveInfo: null, atRiskEmployees: [],
    }];
    expect(computeDueSoon([], [], today, [], [], [], redundancyCases).filter(d => d.category === 'redundancy')).toHaveLength(0);
  });

  it('ignores a completed redundancy process', () => {
    const redundancyCases = [{
      id: 'r4', type: 'collective', status: 'complete', reason: 'Site restructure',
      collectiveInfo: { count: 25, consultationStartDate: '2025-05-20' },
      atRiskEmployees: [],
    }];
    expect(computeDueSoon([], [], today, [], [], [], redundancyCases).filter(d => d.category === 'redundancy')).toHaveLength(0);
  });

  it('ignores a collective process with no consultation start date set yet', () => {
    const redundancyCases = [{
      id: 'r5', type: 'collective', status: 'setup', reason: 'Site restructure',
      collectiveInfo: { count: 25, consultationStartDate: '' },
      atRiskEmployees: [],
    }];
    expect(computeDueSoon([], [], today, [], [], [], redundancyCases).filter(d => d.category === 'redundancy')).toHaveLength(0);
  });
});

describe('computeDueSoon — P16: fit note, probation review, OH referral, suspension review', () => {
  const today = new Date('2025-06-16');

  it('surfaces a fit note expiry date', () => {
    const cases = [{ id: 'c20', employeeName: 'Amir', stage: 'open', meetings: [], fitNoteEndDate: '2025-06-20' }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'fit_note');
    expect(items).toHaveLength(1);
    expect(items[0].employeeName).toBe('Amir');
    expect(items[0].deadlineDate).toBe('20/06/2025');
  });

  it('surfaces a probation review date', () => {
    const cases = [{ id: 'c21', employeeName: 'Bina', stage: 'open', meetings: [], probationReviewDate: '2025-06-22' }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'probation');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('22/06/2025');
  });

  it('computes an OH report chase as 15 working days after the referral date', () => {
    const cases = [{ id: 'c22', employeeName: 'Chidi', stage: 'open', meetings: [], ohReferralDate: '2025-05-01' }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'oh_referral');
    expect(items).toHaveLength(1);
    expect(items[0].employeeName).toBe('Chidi');
  });

  it('does not chase an OH referral once the report has been received', () => {
    const cases = [{ id: 'c23', employeeName: 'Dara', stage: 'open', meetings: [], ohReferralDate: '2025-05-01', ohReportReceivedDate: '2025-05-20' }];
    expect(computeDueSoon(cases, [], today).filter(d => d.category === 'oh_referral')).toHaveLength(0);
  });

  it('surfaces a suspension review date', () => {
    const cases = [{ id: 'c24', employeeName: 'Elif', stage: 'open', meetings: [], suspensionReviewDate: '2025-06-25' }];
    const items = computeDueSoon(cases, [], today).filter(d => d.category === 'suspension');
    expect(items).toHaveLength(1);
    expect(items[0].deadlineDate).toBe('25/06/2025');
  });

  it('omits all four when none of the fields are set', () => {
    const cases = [{ id: 'c25', employeeName: 'Farid', stage: 'open', meetings: [] }];
    const items = computeDueSoon(cases, [], today).filter(d => ['fit_note','probation','oh_referral','suspension'].includes(d.category));
    expect(items).toHaveLength(0);
  });

  it('ignores these fields on a closed case', () => {
    const cases = [{
      id: 'c26', employeeName: 'Greta', stage: 'closed', meetings: [],
      fitNoteEndDate: '2025-06-20', probationReviewDate: '2025-06-20', ohReferralDate: '2025-05-01', suspensionReviewDate: '2025-06-20',
    }];
    const items = computeDueSoon(cases, [], today).filter(d => ['fit_note','probation','oh_referral','suspension'].includes(d.category));
    expect(items).toHaveLength(0);
  });

  it('carries case metadata (confidential/caseId/createdBy) through on these new categories', () => {
    const cases = [{ id: 'c27', employeeName: 'Hana', stage: 'open', confidential: true, createdBy: 'user-1', meetings: [], suspensionReviewDate: '2025-06-25' }];
    const [item] = computeDueSoon(cases, [], today).filter(d => d.category === 'suspension');
    expect(item.caseId).toBe('c27');
    expect(item.confidential).toBe(true);
    expect(item.createdBy).toBe('user-1');
  });
});

// Manager Enablement (Phase 4, MP17, §22/§23) — MP7's own investigator
// target completion date, fed into this same shared pipeline rather than
// a separate manager-only computation.
describe('computeDueSoon — investigation target completion date (MP17)', () => {
  const today = new Date('2025-06-15');

  it('surfaces an investigator\'s target completion date as a deadline', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator', targetCompletionDate: '2025-06-25' }];
    const [item] = computeDueSoon(cases, [], today, [], [], [], [], caseAccess);
    expect(item.category).toBe('investigation_target');
    expect(item.employeeName).toBe('Priya');
    expect(item.overdue).toBe(false);
  });

  it('reports it as overdue once the date has passed', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator', targetCompletionDate: '2025-06-01' }];
    const [item] = computeDueSoon(cases, [], today, [], [], [], [], caseAccess);
    expect(item.overdue).toBe(true);
  });

  it('ignores a case_access row with no target date set', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator', targetCompletionDate: null }];
    expect(computeDueSoon(cases, [], today, [], [], [], [], caseAccess)).toEqual([]);
  });

  it('ignores a non-investigator role even with a target date (the field only ever gets written for investigator rows, but stay defensive)', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'notetaker', targetCompletionDate: '2025-06-25' }];
    expect(computeDueSoon(cases, [], today, [], [], [], [], caseAccess)).toEqual([]);
  });

  it('ignores case_access rows for a different case', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    const caseAccess = [{ id: 'a1', caseId: 'c2', role: 'investigator', targetCompletionDate: '2025-06-25' }];
    expect(computeDueSoon(cases, [], today, [], [], [], [], caseAccess)).toEqual([]);
  });

  it('defaults to no caseAccess passed at all, matching every other trailing-optional param', () => {
    const cases = [{ id: 'c1', employeeName: 'Priya', stage: 'investigation', meetings: [] }];
    expect(computeDueSoon(cases, [], today)).toEqual([]);
  });
});

describe('groupDueSoon', () => {
  it('buckets an overdue item under overdue, not today', () => {
    const result = groupDueSoon([{ overdue: true, daysLeft: 0 }]);
    expect(result.overdue).toHaveLength(1);
    expect(result.today).toHaveLength(0);
  });

  it('buckets a due-today item correctly', () => {
    const result = groupDueSoon([{ overdue: false, daysLeft: 0 }]);
    expect(result.today).toHaveLength(1);
  });

  it('buckets a due-tomorrow item correctly', () => {
    const result = groupDueSoon([{ overdue: false, daysLeft: 1 }]);
    expect(result.tomorrow).toHaveLength(1);
  });

  it('buckets anything further out under later', () => {
    const result = groupDueSoon([{ overdue: false, daysLeft: 2 }, { overdue: false, daysLeft: 14 }]);
    expect(result.later).toHaveLength(2);
  });

  it('handles an empty or missing list without throwing', () => {
    expect(groupDueSoon([])).toEqual({ overdue: [], today: [], tomorrow: [], later: [] });
    expect(groupDueSoon(undefined)).toEqual({ overdue: [], today: [], tomorrow: [], later: [] });
  });

  it('every item lands in exactly one bucket', () => {
    const dueSoon = [
      { overdue: true, daysLeft: 0 }, { overdue: false, daysLeft: 0 },
      { overdue: false, daysLeft: 1 }, { overdue: false, daysLeft: 5 },
    ];
    const result = groupDueSoon(dueSoon);
    const total = result.overdue.length + result.today.length + result.tomorrow.length + result.later.length;
    expect(total).toBe(dueSoon.length);
  });
});
