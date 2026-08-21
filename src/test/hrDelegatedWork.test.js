import { describe, it, expect } from 'vitest';
import { computeHrAttentionFlag, computeDelegatedWork } from '../lib/hrDelegatedWork.js';

describe('computeHrAttentionFlag', () => {
  const cs = { id: 'c1', employeeName: 'Sam' };
  const doneChecklist = [
    { name: 'Interview witnesses', status: 'done' },
    { name: 'Interview the employee', status: 'done' },
  ];

  it('flags when interviews are done but an allegation is still unreviewed', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', status: 'unreviewed' }];
    const result = computeHrAttentionFlag(cs, allegations, doneChecklist, null);
    expect(result.flagged).toBe(true);
    expect(result.reasons[0]).toMatch(/allegation is still unreviewed/);
  });

  it('does not flag when interviews are done and every allegation has moved past unreviewed', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', status: 'evidence_gathering' }];
    const result = computeHrAttentionFlag(cs, allegations, doneChecklist, null);
    expect(result.flagged).toBe(false);
  });

  it('does not flag an unreviewed allegation if interviews are not both done yet', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', status: 'unreviewed' }];
    const partialChecklist = [{ name: 'Interview witnesses', status: 'done' }];
    const result = computeHrAttentionFlag(cs, allegations, partialChecklist, null);
    expect(result.flagged).toBe(false);
  });

  it('flags an overdue target completion date with no report yet', () => {
    const today = new Date('2026-08-20');
    const result = computeHrAttentionFlag(cs, [], [], '2026-08-15', today);
    expect(result.flagged).toBe(true);
    expect(result.reasons[0]).toMatch(/Target completion date has passed/);
  });

  it('does not flag a target date that has not arrived yet', () => {
    const today = new Date('2026-08-10');
    const result = computeHrAttentionFlag(cs, [], [], '2026-08-15', today);
    expect(result.flagged).toBe(false);
  });

  it('does not flag an overdue target date once a report has been generated', () => {
    const today = new Date('2026-08-20');
    const csWithReport = { ...cs, investigationReport: 'text' };
    const result = computeHrAttentionFlag(csWithReport, [], [], '2026-08-15', today);
    expect(result.flagged).toBe(false);
  });

  it('can report both reasons at once', () => {
    const today = new Date('2026-08-20');
    const allegations = [{ id: 'a1', caseId: 'c1', status: 'unreviewed' }];
    const result = computeHrAttentionFlag(cs, allegations, doneChecklist, '2026-08-15', today);
    expect(result.reasons).toHaveLength(2);
  });

  it('is not flagged when nothing is wrong', () => {
    const result = computeHrAttentionFlag(cs, [], [], null);
    expect(result).toEqual({ flagged: false, reasons: [] });
  });
});

describe('computeDelegatedWork', () => {
  const cases = [{ id: 'c1', employeeName: 'Sam', meetings: [{ type: 'Investigation', record: 'x' }, { type: 'Investigation', record: '' }] }];
  const caseAccess = [
    { id: 'a1', caseId: 'c1', userId: 'u1', role: 'investigator', targetCompletionDate: '2026-09-01' },
    { id: 'a2', caseId: 'c1', userId: 'u2', role: 'notetaker' },
  ];
  const orgMembers = [{ id: 'm1', user_id: 'u1', name: 'Alex Investigator' }];
  const caseTasks = [
    { id: 't1', caseId: 'c1', name: 'Review the allegation(s)', status: 'done' },
    { id: 't2', caseId: 'c1', name: 'Chase a document', status: 'open', dueDate: '2026-08-01' },
  ];
  const allegations = [{ id: 'al1', caseId: 'c1', status: 'unreviewed' }];
  const today = new Date('2026-08-14');

  it('produces one row per investigator case_access grant, ignoring other roles', () => {
    const result = computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations, today);
    expect(result).toHaveLength(1);
    expect(result[0].investigatorName).toBe('Alex Investigator');
  });

  it('counts checklist progress, completed meetings, and overdue tasks correctly', () => {
    const [row] = computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations, today);
    expect(row.checklistDone).toBe(1);
    expect(row.checklistTotal).toBe(7);
    expect(row.meetingsCompleted).toBe(1);
    expect(row.tasksOverdue).toBe(1);
    expect(row.targetCompletionDate).toBe('2026-09-01');
  });

  it('skips a case_access row whose case no longer exists', () => {
    const orphanedAccess = [{ id: 'a3', caseId: 'gone', userId: 'u1', role: 'investigator' }];
    expect(computeDelegatedWork(cases, orphanedAccess, orgMembers, [], [], today)).toEqual([]);
  });

  it('falls back to "Unknown" when the investigator is not found in orgMembers', () => {
    const accessNoMember = [{ id: 'a1', caseId: 'c1', userId: 'u_ghost', role: 'investigator' }];
    const [row] = computeDelegatedWork(cases, accessNoMember, orgMembers, [], [], today);
    expect(row.investigatorName).toBe('Unknown');
  });

  // Manager Enablement (Phase 4, MP19, §15) — a paused case still appears
  // (unlike computeDueSoon, which drops it entirely) but never gets
  // flagged for attention.
  it('marks a paused case as paused and never flags it for attention, even when it otherwise would be', () => {
    const pausedCases = [{ ...cases[0], investigationPaused: true }];
    const flaggedChecklist = [
      { id: 't1', caseId: 'c1', name: 'Interview witnesses', status: 'done' },
      { id: 't2', caseId: 'c1', name: 'Interview the employee', status: 'done' },
    ];
    const unreviewedAllegation = [{ id: 'al1', caseId: 'c1', status: 'unreviewed' }];
    const [row] = computeDelegatedWork(pausedCases, caseAccess, orgMembers, flaggedChecklist, unreviewedAllegation, today);
    expect(row.paused).toBe(true);
    expect(row.attentionFlagged).toBe(false);
    expect(row.attentionReasons).toEqual([]);
  });

  it('marks a non-paused case as not paused', () => {
    const [row] = computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations, today);
    expect(row.paused).toBe(false);
  });

  // Phase 6.5, Batch 2 — tasksOverdue used to compare t.dueDate < todayIso
  // as plain strings. A UK-format "DD/MM/YYYY" due date that's genuinely
  // in the future can still lexicographically sort before an ISO
  // "YYYY-MM-DD" today string (e.g. "01/09/2026" < "2026-08-14" because
  // '0' < '2'), so a real not-yet-due task got wrongly counted as
  // overdue.
  it('does not miscount a future UK-format due date as overdue', () => {
    const ukTasks = [{ id: 't1', caseId: 'c1', name: 'Send follow-up', status: 'open', dueDate: '01/09/2026' }];
    const [row] = computeDelegatedWork(cases, caseAccess, orgMembers, ukTasks, [], today);
    expect(row.tasksOverdue).toBe(0);
  });

  it('correctly counts a genuinely overdue UK-format due date', () => {
    const ukTasks = [{ id: 't1', caseId: 'c1', name: 'Send follow-up', status: 'open', dueDate: '01/08/2026' }];
    const [row] = computeDelegatedWork(cases, caseAccess, orgMembers, ukTasks, [], today);
    expect(row.tasksOverdue).toBe(1);
  });
});
