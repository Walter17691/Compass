import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  WRITE_FAILURE, planMeetingWrite, persistMeeting, stampNewMeeting, describeMeetingWriteFailure,
} from '../lib/meetingWrites.js';

// Release 1 Phase 2.1 — authoritative meeting parentage and the write
// primitive (NEW-20, P1).
//
// saveMeetingToCaseImpl resolved the target case by matching
// cases.employeeName against the typed employee name, took nameMatches[0] on
// collision, and minted a brand-new case when nothing matched. Two employees
// sharing a name — or one employee with a closed prior case alongside a live
// one — could have a meeting filed onto the wrong record with no warning.
// activeCaseId narrowed the window but the name check remained the gate.
//
// Parentage is now an input, never an inference, and an unlinked meeting
// fails closed rather than guessing or inventing a case.

const app = readFileSync('src/App.jsx', 'utf8');
const homeMeeting = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
const lib = readFileSync('src/lib/meetingWrites.js', 'utf8');
// Comment prose legitimately names the very things the code must not do
// ("no longer matches employeeName", "never replay"), so source-level
// prohibitions are asserted against executable lines only.
const libCode = lib.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const CASE_A = { id: 'case-a', employeeName: 'Sam Patel', meetings: [{ id: 'm-old', type: 'Investigation', record: 'old' }] };
const CASE_B = { id: 'case-b', employeeName: 'Sam Patel', meetings: [] };   // same name, different case
const CASES = [CASE_A, CASE_B];
const meeting = (over = {}) => ({ id: 'm-new', type: 'Investigation', record: 'notes', ...over });
const okSave = vi.fn(async () => ({ ok: true }));

describe('1-3. create with authoritative parentage, identity and provenance', () => {
  it('1. writes into the exact case named by caseId', () => {
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-b', meeting: meeting() });
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe('create');
    expect(plan.nextCases.find(c => c.id === 'case-b').meetings.map(m => m.id)).toEqual(['m-new']);
    expect(plan.nextCases.find(c => c.id === 'case-a').meetings.map(m => m.id)).toEqual(['m-old']);
  });

  it('1b. the stored meeting asserts its own parent', () => {
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-b', meeting: meeting() });
    expect(plan.meeting.caseId).toBe('case-b');
  });

  it('2. identity is stable and never regenerated', () => {
    const m = meeting();
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-b', meeting: m });
    expect(plan.meeting.id).toBe('m-new');
    expect(plan.meeting.id).toBe(m.id);
  });

  it('3. createdAt / createdBy / caseId are stamped once, at creation', () => {
    const stamped = stampNewMeeting(meeting(), { caseId: 'case-b', now: '2026-09-23T10:00:00.000Z', by: 'Jane Smith' });
    expect(stamped.caseId).toBe('case-b');
    expect(stamped.createdAt).toBe('2026-09-23T10:00:00.000Z');
    expect(stamped.createdBy).toBe('Jane Smith');
    expect(stamped.id).toBe('m-new');
    expect(stamped.record).toBe('notes');
  });

  it('3b. stamping does not mutate the source object', () => {
    const m = meeting();
    const snapshot = JSON.parse(JSON.stringify(m));
    stampNewMeeting(m, { caseId: 'case-b', by: 'Jane' });
    expect(m).toEqual(snapshot);
  });

  it('3c. no lifecycle status is written by any Phase 2.1 path', () => {
    const stamped = stampNewMeeting(meeting(), { caseId: 'case-b', by: 'Jane' });
    expect(stamped.status).toBeUndefined();
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-b', meeting: stamped });
    expect(plan.meeting.status).toBeUndefined();
    expect(lib).not.toMatch(/status\s*:\s*["'`](scheduled|in_progress|review_draft|completed|cancelled)/);
  });
});

describe('4-5. identical employee names', () => {
  it('4. the exact target case is used when two cases share an employee name', () => {
    expect(CASE_A.employeeName).toBe(CASE_B.employeeName);
    for (const target of ['case-a', 'case-b']) {
      const plan = planMeetingWrite({ cases: CASES, caseId: target, meeting: meeting() });
      expect(plan.nextCases.find(c => c.id === target).meetings.some(m => m.id === 'm-new')).toBe(true);
      const other = target === 'case-a' ? 'case-b' : 'case-a';
      expect(plan.nextCases.find(c => c.id === other).meetings.some(m => m.id === 'm-new')).toBe(false);
    }
  });

  it('5. the primitive never reads employeeName at all', () => {
    expect(libCode).not.toContain('employeeName');
    // and a case with no employeeName whatsoever still resolves by id
    const plan = planMeetingWrite({ cases: [{ id: 'case-x', meetings: [] }], caseId: 'case-x', meeting: meeting() });
    expect(plan.ok).toBe(true);
  });

  it('5b. the structured save path in App.jsx no longer name-matches', () => {
    expect(app).not.toContain('const nameMatches = cases.filter(c=>c.employeeName.toLowerCase()===caseInfo.employee.toLowerCase());');
    expect(app).not.toContain('const existing = (activeCaseId && nameMatches.find(c=>c.id===activeCaseId)) || nameMatches[0];');
    expect(app).toContain('const structuredCaseId = caseInfo.caseId || null;');
    expect(app).toContain('const existing = structuredCaseId ? cases.find(c=>c.id===structuredCaseId) : null;');
  });
});

describe('6-10. fail closed', () => {
  it('6/10. a structured meeting with no caseId is refused', () => {
    for (const caseId of [null, undefined, '', '   ']) {
      const plan = planMeetingWrite({ cases: CASES, caseId, meeting: meeting() });
      expect(plan.ok).toBe(false);
      expect(plan.reason).toBe(WRITE_FAILURE.PARENT_REQUIRED);
    }
  });

  it('7. a refused write creates no case and touches nothing', async () => {
    const save = vi.fn();
    const result = await persistMeeting({ cases: CASES, caseId: null, meeting: meeting(), saveCases: save });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(WRITE_FAILURE.PARENT_REQUIRED);
    expect(save).not.toHaveBeenCalled();
    expect(CASES).toHaveLength(2);
  });

  it('8. an unlinked meeting never attaches to a same-name case', async () => {
    const save = vi.fn();
    // Both stored cases are for "Sam Patel"; the meeting is for Sam Patel too.
    const result = await persistMeeting({ cases: CASES, caseId: null, meeting: meeting({ employee: 'Sam Patel' }), saveCases: save });
    expect(result.reason).toBe(WRITE_FAILURE.PARENT_REQUIRED);
    expect(save).not.toHaveBeenCalled();
  });

  it('9. an inaccessible or deleted caseId is refused, never redirected', async () => {
    const save = vi.fn();
    const result = await persistMeeting({ cases: CASES, caseId: 'case-gone', meeting: meeting(), saveCases: save });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(save).not.toHaveBeenCalled();
  });

  it('a malformed meeting object is refused', () => {
    for (const m of [null, undefined, {}, { id: '' }, [], 'meeting', 7]) {
      expect(planMeetingWrite({ cases: CASES, caseId: 'case-a', meeting: m }).reason).toBe(WRITE_FAILURE.INVALID_MEETING);
    }
  });

  it('every failure has actionable human copy that says the notes are kept', () => {
    for (const reason of Object.values(WRITE_FAILURE)) {
      const copy = describeMeetingWriteFailure(reason);
      expect(copy).toBeTruthy();
      expect(copy.toLowerCase()).toContain('notes have been kept');
    }
    expect(describeMeetingWriteFailure('something_else')).toBeNull();
  });
});

describe('11-14. patch rather than append', () => {
  const stored = { id: 'm-old', type: 'Investigation', record: 'old', caseId: 'case-a' };
  const withStored = [{ ...CASE_A, meetings: [stored] }, CASE_B];

  it('11. an existing meeting id patches in place and does not append a second row', () => {
    const plan = planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: { id: 'm-old', record: 'revised' } });
    expect(plan.mode).toBe('patch');
    const list = plan.nextCases.find(c => c.id === 'case-a').meetings;
    expect(list).toHaveLength(1);
    expect(list[0].record).toBe('revised');
    expect(list[0].type).toBe('Investigation');   // untouched fields survive
  });

  it('11b. a new id appends exactly once', () => {
    const plan = planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: meeting() });
    expect(plan.mode).toBe('create');
    expect(plan.nextCases.find(c => c.id === 'case-a').meetings.map(m => m.id)).toEqual(['m-old', 'm-new']);
  });

  it('12. a patch cannot change the meeting id', () => {
    const plan = planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: { id: 'm-old', record: 'x' } });
    expect(plan.nextCases.find(c => c.id === 'case-a').meetings[0].id).toBe('m-old');
  });

  it('13. a patch preserves parentage', () => {
    const plan = planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: { id: 'm-old', record: 'x' } });
    expect(plan.nextCases.find(c => c.id === 'case-a').meetings[0].caseId).toBe('case-a');
  });

  it('14. an attempted parentage change is rejected, never silently repaired', () => {
    // the incoming meeting claims a different parent
    expect(planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: { id: 'm-new', caseId: 'case-b' } }).reason)
      .toBe(WRITE_FAILURE.PARENTAGE_MISMATCH);
    // the stored meeting claims a different parent than the write target
    const crossed = [{ ...CASE_A, meetings: [{ id: 'm-old', caseId: 'case-b' }] }, CASE_B];
    expect(planMeetingWrite({ cases: crossed, caseId: 'case-a', meeting: { id: 'm-old', record: 'x' } }).reason)
      .toBe(WRITE_FAILURE.PARENTAGE_MISMATCH);
  });

  it('14b. a meeting asserting the SAME parent is accepted', () => {
    expect(planMeetingWrite({ cases: CASES, caseId: 'case-a', meeting: meeting({ caseId: 'case-a' }) }).ok).toBe(true);
  });

  it('14c. planning never mutates the input cases', () => {
    const snapshot = JSON.parse(JSON.stringify(withStored));
    planMeetingWrite({ cases: withStored, caseId: 'case-a', meeting: { id: 'm-old', record: 'revised' } });
    expect(withStored).toEqual(snapshot);
  });
});

describe('15-16. concurrency fails closed', () => {
  it('15. a stale updated_at conflict is reported, not swallowed', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    const result = await persistMeeting({ cases: CASES, caseId: 'case-a', meeting: meeting(), saveCases: save });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
  });

  it('16. a conflict is never automatically replayed', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    await persistMeeting({ cases: CASES, caseId: 'case-a', meeting: meeting(), saveCases: save });
    expect(save).toHaveBeenCalledTimes(1);
    expect(libCode).not.toMatch(/retry|replay|while\s*\(|for\s*\(/);
  });

  it('a database rejection surfaces its message for translation', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'error', message: 'APPEAL_CHAIR_MISMATCH: ...' }));
    const result = await persistMeeting({ cases: CASES, caseId: 'case-a', meeting: meeting(), saveCases: save });
    expect(result.reason).toBe('error');
    expect(result.message).toContain('APPEAL_CHAIR_MISMATCH');
  });

  it('the primitive can only ever use the single-case write path', async () => {
    okSave.mockClear();
    await persistMeeting({ cases: CASES, caseId: 'case-a', meeting: meeting(), saveCases: okSave });
    expect(okSave).toHaveBeenCalledTimes(1);
    expect(okSave.mock.calls[0][1]).toBe('case-a');           // changedId always supplied
    expect(okSave.mock.calls[0]).toHaveLength(2);
    // exactly one saveCases call exists in the module, and it passes caseId
    expect((libCode.match(/saveCases\(/g) || []).length).toBe(1);
    expect(libCode).toContain('await saveCases(plan.nextCases, caseId)');
  });
});

describe('17-19. adjacent save paths still behave correctly', () => {
  it('17. letter saves keep their own shape and are unaffected by parentage changes', () => {
    const letter = { id: 'l1', type: 'Disciplinary', letterType: 'outcome', letterOutput: 'text', record: '' };
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-a', meeting: letter });
    expect(plan.ok).toBe(true);
    expect(plan.meeting.letterType).toBe('outcome');
    expect(plan.meeting.caseId).toBe('case-a');
    expect(app).toContain('const isLetterOnlySave = isLetterOnlyRecord(meeting);');
  });

  it('18. the witness/evidence path is untouched and still resolves by id', () => {
    expect(app).toContain('if(caseInfo._linkedCaseId) {');
    expect(app).toContain('const targetCase = cases.find(x=>x.id===caseInfo._linkedCaseId);');
    // it returns before the structured parentage gate, so it cannot be blocked by it
    const witnessStart = app.indexOf('if(caseInfo._linkedCaseId) {');
    expect(witnessStart).toBeLessThan(app.indexOf('const structuredCaseId = caseInfo.caseId || null;'));
  });

  it('19. appeal hearings keep their appointed chair and are parented by id', () => {
    expect(app).toContain('chairUserId: caseInfo.appealManagerId || null,');
    expect(caseView).toContain('appealManagerId:isStructuredAppealHearing ? currentAppealManagerAccess.userId : null,');
    const plan = planMeetingWrite({ cases: CASES, caseId: 'case-a', meeting: meeting({ type: 'Disciplinary Appeal', chairUserId: 'officer-uuid' }) });
    expect(plan.meeting.chairUserId).toBe('officer-uuid');
    expect(plan.meeting.caseId).toBe('case-a');
  });

  it('no non-appeal chair semantics were introduced', () => {
    expect(lib).not.toContain('chairUserId');
  });
});

describe('20. legacy compatibility', () => {
  it('a legacy meeting with no caseId is still readable and patchable', () => {
    const legacy = [{ id: 'case-a', meetings: [{ id: 'legacy-1', type: 'Investigation', record: 'old' }] }];
    const plan = planMeetingWrite({ cases: legacy, caseId: 'case-a', meeting: { id: 'legacy-1', signStatus: 'signed' } });
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe('patch');
    expect(plan.nextCases[0].meetings[0].record).toBe('old');
    expect(plan.nextCases[0].meetings[0].signStatus).toBe('signed');
  });

  it('other meetings on the case are left byte-identical', () => {
    const sibling = { id: 'm-sib', type: 'Disciplinary', record: 'sibling record' };
    const cases = [{ id: 'case-a', meetings: [sibling] }];
    const plan = planMeetingWrite({ cases, caseId: 'case-a', meeting: meeting() });
    expect(plan.nextCases[0].meetings[0]).toBe(sibling);   // same reference, untouched
  });

  it('no historical row is given a status, kind or lifecycle field', () => {
    const legacy = [{ id: 'case-a', meetings: [{ id: 'legacy-1', record: 'old' }] }];
    const plan = planMeetingWrite({ cases: legacy, caseId: 'case-a', meeting: meeting() });
    const untouched = plan.nextCases[0].meetings[0];
    expect(Object.keys(untouched)).toEqual(['id', 'record']);
  });
});

describe('PLATFORM PRIMITIVE — no case-type forks, no I/O', () => {
  it('contains no case-type or process logic', () => {
    const body = lib.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n').toLowerCase();
    for (const w of ['misconduct', 'grievance', 'disciplinary', 'appeal', 'probation', 'capability', 'redundancy', 'getnextstep', 'recipe']) {
      expect(body).not.toContain(w);
    }
  });

  it('has no I/O, AI, Supabase or router dependency and imports nothing', () => {
    expect(lib).not.toMatch(/authedFetch|\/api\/|supabase|streamClaude|localStorage|fetch\(/);
    expect(lib.match(/^import .*$/gm)).toBeNull();
  });

  it('works identically for every meeting type', () => {
    for (const type of ['Investigation', 'Disciplinary', 'Disciplinary Appeal', 'Grievance', 'Return to Work', 'Probation Review', 'Informal / 1-1', 'Consultation']) {
      const plan = planMeetingWrite({ cases: CASES, caseId: 'case-a', meeting: meeting({ type }) });
      expect(plan.ok).toBe(true);
      expect(plan.meeting.caseId).toBe('case-a');
    }
  });
});

describe('entry points supply authoritative parentage', () => {
  it('the Case View start handlers set caseId from the case they run inside', () => {
    expect(caseView).toContain('caseId:cs.id,');
  });

  it('the New meeting form sets caseId from the visible "Link to case" selection', () => {
    expect(homeMeeting).toContain('caseId:meetingSetup.preparedCaseId||activeCaseId||null,');
  });

  it('parentage is recomputed each time and never carried over from a previous meeting', () => {
    // no "|| p.caseId" fallback — a stale parent from an earlier session
    // cannot survive into a new one.
    expect(homeMeeting).not.toMatch(/caseId:[^,\n]*p\.caseId/);
  });

  it('caseId is distinct from preparedCaseId, which keeps its own meaning', () => {
    expect(caseView).toContain('preparedCaseId:cs.id,');
    expect(app).toContain('const hasAuthoritativeParentCase = !!(caseInfo.preparedCaseId || caseInfo._linkedCaseId);');
  });

  it('the structured save fails closed and says so, without creating a case', () => {
    expect(app).toContain('showToast(describeMeetingWriteFailure(WRITE_FAILURE.PARENT_REQUIRED), "error");');
    expect(app).toContain('return { ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED };');
    expect(app).toContain('showToast(describeMeetingWriteFailure(WRITE_FAILURE.NOT_FOUND), "error");');
  });

  it('the one implicit-case-creation exception is narrow, explicit and referral-only', () => {
    expect(app).toContain('const referralCaseIntent = !structuredCaseId && !!caseInfo._linkedReferralId;');
    // it is the ONLY remaining way the structured path can mint a case id
    expect((app.match(/const caseId = existing \? existing\.id : crypto\.randomUUID\(\);/g) || []).length).toBe(1);
  });
});
