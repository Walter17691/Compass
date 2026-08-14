import { describe, it, expect } from 'vitest';
import { myAssignedCases, myMeetingsToConduct, myTasksDue, myDocumentsToReview, myHrResponses, myConcernsSubmitted, myUpcomingDeadlines } from '../lib/managerPortal.js';

describe('myAssignedCases', () => {
  const cases = [{ id: 'c1', employeeName: 'Sam' }, { id: 'c2', employeeName: 'Alex' }, { id: 'c3', employeeName: 'Jo' }];
  const caseAccess = [
    { caseId: 'c1', userId: 'u1', role: 'investigator' },
    { caseId: 'c1', userId: 'u1', role: 'notetaker' },
    { caseId: 'c2', userId: 'u2', role: 'investigator' },
  ];

  it('returns only cases with a case_access row for this user', () => {
    const result = myAssignedCases(cases, caseAccess, 'u1');
    expect(result.map(c => c.id)).toEqual(['c1']);
  });

  it('collects every role this user holds on a case, not just one', () => {
    const result = myAssignedCases(cases, caseAccess, 'u1');
    expect(result[0].myRoles).toEqual(['Investigator', 'Notetaker']);
  });

  it('returns an empty array with no userId', () => {
    expect(myAssignedCases(cases, caseAccess, null)).toEqual([]);
  });

  it('returns an empty array when the user has no case_access rows', () => {
    expect(myAssignedCases(cases, caseAccess, 'u_nobody')).toEqual([]);
  });
});

describe('myMeetingsToConduct', () => {
  it('includes a case whose next step is to start a meeting', () => {
    const myCases = [{ id: 'c1', employeeName: 'Sam', meetings: [] }];
    expect(myMeetingsToConduct(myCases).map(c => c.id)).toEqual(['c1']);
  });

  it('excludes a case whose next step is not meeting-related', () => {
    const myCases = [{ id: 'c1', employeeName: 'Sam', stage: 'closed', meetings: [] }];
    expect(myMeetingsToConduct(myCases)).toEqual([]);
  });
});

describe('myTasksDue', () => {
  const caseTasks = [
    { id: 't1', caseId: 'c1', owner: 'Alex Manager', status: 'open', dueDate: '2026-08-20' },
    { id: 't2', caseId: 'c1', owner: 'alex manager', status: 'open', dueDate: '2026-08-10' },
    { id: 't3', caseId: 'c1', owner: 'Alex Manager', status: 'done', dueDate: '2026-08-05' },
    { id: 't4', caseId: 'c2', owner: 'Someone Else', status: 'open', dueDate: '2026-08-01' },
  ];

  it('matches by owner name case-insensitively', () => {
    expect(myTasksDue(caseTasks, 'Alex Manager').map(t => t.id)).toEqual(['t2', 't1']);
  });

  it('excludes done tasks', () => {
    expect(myTasksDue(caseTasks, 'Alex Manager').some(t => t.id === 't3')).toBe(false);
  });

  it('sorts by due date, undated tasks last', () => {
    const withUndated = [...caseTasks, { id: 't5', caseId: 'c1', owner: 'Alex Manager', status: 'open', dueDate: '' }];
    const result = myTasksDue(withUndated, 'Alex Manager');
    expect(result[result.length - 1].id).toBe('t5');
  });

  it('returns an empty array with no name', () => {
    expect(myTasksDue(caseTasks, '')).toEqual([]);
  });
});

describe('myDocumentsToReview', () => {
  it('lists a submitted notetaker record on a case I own', () => {
    const myCases = [{ id: 'c1', employeeName: 'Sam', manager: 'Alex Manager', meetings: [{ id: 'm1', type: 'Investigation', notetakerNotesStatus: 'submitted' }] }];
    const result = myDocumentsToReview(myCases, 'Alex Manager');
    expect(result).toEqual([{ caseId: 'c1', employeeName: 'Sam', meetingType: 'Investigation', meetingId: 'm1' }]);
  });

  it('excludes a case I do not own even if it has a submitted record', () => {
    const myCases = [{ id: 'c1', employeeName: 'Sam', manager: 'Someone Else', meetings: [{ id: 'm1', notetakerNotesStatus: 'submitted' }] }];
    expect(myDocumentsToReview(myCases, 'Alex Manager')).toEqual([]);
  });

  it('excludes a meeting that has not been submitted yet', () => {
    const myCases = [{ id: 'c1', employeeName: 'Sam', manager: 'Alex Manager', meetings: [{ id: 'm1', notetakerNotesStatus: 'reviewed' }, { id: 'm2' }] }];
    expect(myDocumentsToReview(myCases, 'Alex Manager')).toEqual([]);
  });
});

describe('myHrResponses', () => {
  it('includes a resolved request I made, excludes a still-pending one', () => {
    const hrReviewRequests = [
      { id: 'r1', requested_by: 'u1', status: 'returned', reviewed_at: '2026-08-10T00:00:00Z' },
      { id: 'r2', requested_by: 'u1', status: 'pending' },
      { id: 'r3', requested_by: 'u2', status: 'approved', reviewed_at: '2026-08-11T00:00:00Z' },
    ];
    expect(myHrResponses(hrReviewRequests, 'u1').map(r => r.id)).toEqual(['r1']);
  });

  it('sorts newest response first', () => {
    const hrReviewRequests = [
      { id: 'r1', requested_by: 'u1', status: 'returned', reviewed_at: '2026-08-01T00:00:00Z' },
      { id: 'r2', requested_by: 'u1', status: 'approved', reviewed_at: '2026-08-10T00:00:00Z' },
    ];
    expect(myHrResponses(hrReviewRequests, 'u1').map(r => r.id)).toEqual(['r2', 'r1']);
  });
});

describe('myConcernsSubmitted', () => {
  it('includes only referrals submitted by this user', () => {
    const concernReferrals = [
      { id: 'ref1', submittedBy: 'u1', createdAt: '2026-08-01T00:00:00Z' },
      { id: 'ref2', submittedBy: 'u2', createdAt: '2026-08-02T00:00:00Z' },
    ];
    expect(myConcernsSubmitted(concernReferrals, 'u1').map(r => r.id)).toEqual(['ref1']);
  });
});

describe('myUpcomingDeadlines', () => {
  it('keeps only deadlines whose caseId is one of mine', () => {
    const dueSoon = [{ label: 'a', caseId: 'c1' }, { label: 'b', caseId: 'c2' }, { label: 'c', caseId: null }];
    expect(myUpcomingDeadlines(dueSoon, ['c1']).map(d => d.label)).toEqual(['a']);
  });
});
