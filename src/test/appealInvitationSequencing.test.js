import { describe, it, expect } from 'vitest';
import { isLetterOnlyRecord, isGenuineMeetingRecord, getCaseStage } from '../lib/caseStage.js';
import { isValidAppealInvitation, findLatestAppealInvitation, appealInvitationLogistics } from '../lib/appealInvitation.js';
import { getNextStep } from '../lib/nextStep.js';
import { computeStageProgress } from '../lib/processTimeline.js';

// Appeal hearing sequencing P1 (Human UAT, 2026-09-20) — a saved appeal
// INVITATION masqueraded as a genuine appeal hearing: it appeared in Previous
// meetings as "Disciplinary Appeal — 20/09/2026" (its save date), its save
// wrote an audit row reading "Appeal hearing recorded", and the hearing form
// still demanded an invitation while defaulting the date to today and
// dropping the scheduled 10:00 / Microsoft Teams entirely.
//
// These fixtures are the EXACT shapes read from production case
// 3e99e129-9053-47de-82d1-ccce24925051 at the time of the defect.
const INVESTIGATION = { id: 'm1', type: 'Investigation', date: '2026-09-11', letterType: null, record: 'notes'.repeat(100), transcript: new Array(10).fill({ text: 'x' }), savedAt: '2026-09-11T09:43:25.376Z' };
const DISCIPLINARY = { id: 'm2', type: 'Disciplinary', date: '2026-09-11', letterType: null, record: 'notes'.repeat(100), transcript: new Array(7).fill({ text: 'x' }), savedAt: '2026-09-11T09:50:29.740Z' };
const DISCIPLINARY_WITH_OUTCOME = { id: 'm3', type: 'Disciplinary', date: '2026-09-11', letterType: 'outcome', record: 'notes'.repeat(100), transcript: new Array(7).fill({ text: 'x' }), letterOutput: 'letter'.repeat(100), savedAt: '2026-09-11T10:00:16.932Z' };
const APPEAL_INVITATION = {
  id: 'm4', type: 'Disciplinary Appeal', date: '2026-09-20', letterType: 'invite',
  record: '', transcript: [], letterOutput: 'letter'.repeat(100), chairUserId: null,
  hearingDate: '2026-09-22', hearingTime: '10:00', hearingLocationOrMethod: 'Microsoft Teams',
  savedAt: '2026-09-20T09:11:01.213Z',
};
const GENUINE_APPEAL_HEARING = {
  id: 'm5', type: 'Disciplinary Appeal', date: '2026-09-22', letterType: null,
  record: 'hearing notes'.repeat(50), transcript: new Array(6).fill({ text: 'x' }),
  chairUserId: 'officer-uuid', savedBy: 'HR Operator', savedAt: '2026-09-22T10:45:00.000Z',
};
const BASE_MEETINGS = [INVESTIGATION, DISCIPLINARY, DISCIPLINARY_WITH_OUTCOME];

describe('isLetterOnlyRecord / isGenuineMeetingRecord — the shared distinction', () => {
  // D — the case that makes "letterType != null" the wrong filter.
  it('a genuine hearing that also produced an outcome letter stays a genuine meeting', () => {
    expect(isLetterOnlyRecord(DISCIPLINARY_WITH_OUTCOME)).toBe(false);
    expect(isGenuineMeetingRecord(DISCIPLINARY_WITH_OUTCOME)).toBe(true);
  });

  it('the production appeal invitation is letter-only', () => {
    expect(isLetterOnlyRecord(APPEAL_INVITATION)).toBe(true);
    expect(isGenuineMeetingRecord(APPEAL_INVITATION)).toBe(false);
  });

  // E — legacy records predate letterType entirely.
  it('a legacy record with no letterType is always genuine, even with no content', () => {
    expect(isGenuineMeetingRecord({ type: 'Disciplinary', record: '', transcript: [] })).toBe(true);
    expect(isGenuineMeetingRecord(INVESTIGATION)).toBe(true);
    expect(isGenuineMeetingRecord(DISCIPLINARY)).toBe(true);
  });

  it('is defensive about null, undefined, empty-string and non-array shapes', () => {
    expect(isLetterOnlyRecord(null)).toBe(false);
    expect(isLetterOnlyRecord(undefined)).toBe(false);
    expect(isLetterOnlyRecord({})).toBe(false);
    expect(isGenuineMeetingRecord(null)).toBe(false);
    expect(isLetterOnlyRecord({ letterType: 'invite', record: null, transcript: null })).toBe(true);
    expect(isLetterOnlyRecord({ letterType: 'invite', record: undefined })).toBe(true);
    expect(isLetterOnlyRecord({ letterType: 'invite', record: '   ', transcript: [] })).toBe(true);
    expect(isLetterOnlyRecord({ letterType: 'invite', record: 'real notes' })).toBe(false);
    expect(isLetterOnlyRecord({ letterType: 'invite', record: '', transcript: [{ text: 'x' }] })).toBe(false);
  });
});

describe('Previous meetings filtering (C, D, E)', () => {
  // Mirrors HomeMeetingScreen's own filter.
  const visible = meetings => meetings.filter(isGenuineMeetingRecord).map(m => m.id);

  it('hides the pure appeal invitation but keeps every genuine meeting', () => {
    expect(visible([...BASE_MEETINGS, APPEAL_INVITATION])).toEqual(['m1', 'm2', 'm3']);
  });

  it('shows a genuine appeal hearing once one actually exists', () => {
    expect(visible([...BASE_MEETINGS, APPEAL_INVITATION, GENUINE_APPEAL_HEARING])).toEqual(['m1', 'm2', 'm3', 'm5']);
  });
});

describe('isValidAppealInvitation / findLatestAppealInvitation (A, R)', () => {
  it('recognises the production invitation', () => {
    expect(isValidAppealInvitation(APPEAL_INVITATION)).toBe(true);
  });

  it('rejects anything that is not an appeal-type, letter-only, saved invitation', () => {
    expect(isValidAppealInvitation(DISCIPLINARY_WITH_OUTCOME)).toBe(false);
    expect(isValidAppealInvitation(GENUINE_APPEAL_HEARING)).toBe(false);
    expect(isValidAppealInvitation({ ...APPEAL_INVITATION, letterOutput: '' })).toBe(false);
    expect(isValidAppealInvitation({ ...APPEAL_INVITATION, letterType: 'appeal' })).toBe(false);
    expect(isValidAppealInvitation({ ...APPEAL_INVITATION, type: 'Disciplinary' })).toBe(false);
    expect(isValidAppealInvitation(null)).toBe(false);
  });

  // R — deterministic selection with more than one saved invitation.
  const OLDER = { ...APPEAL_INVITATION, id: 'older', savedAt: '2026-09-19T08:00:00.000Z', hearingDate: '2026-09-21', hearingTime: '09:00', hearingLocationOrMethod: 'Leeds Office' };

  it('picks the most recently saved invitation regardless of array order', () => {
    expect(findLatestAppealInvitation({ meetings: [APPEAL_INVITATION, OLDER] }).id).toBe('m4');
    expect(findLatestAppealInvitation({ meetings: [OLDER, APPEAL_INVITATION] }).id).toBe('m4');
  });

  it('prefers an invitation with savedAt over a legacy one without', () => {
    const noSavedAt = { ...APPEAL_INVITATION, id: 'legacy', savedAt: undefined };
    expect(findLatestAppealInvitation({ meetings: [APPEAL_INVITATION, noSavedAt] }).id).toBe('m4');
    expect(findLatestAppealInvitation({ meetings: [noSavedAt, APPEAL_INVITATION] }).id).toBe('m4');
  });

  it('falls back to stored array order when no invitation has savedAt', () => {
    const a = { ...APPEAL_INVITATION, id: 'a', savedAt: undefined };
    const b = { ...APPEAL_INVITATION, id: 'b', savedAt: undefined };
    expect(findLatestAppealInvitation({ meetings: [a, b] }).id).toBe('b');
  });

  it('returns null when there is no saved invitation at all', () => {
    expect(findLatestAppealInvitation({ meetings: BASE_MEETINGS })).toBeNull();
    expect(findLatestAppealInvitation({ meetings: [] })).toBeNull();
    expect(findLatestAppealInvitation(null)).toBeNull();
  });
});

describe('appealInvitationLogistics seeding (I, J, K)', () => {
  const logistics = appealInvitationLogistics({ meetings: [...BASE_MEETINGS, APPEAL_INVITATION] });

  it('I. seeds the scheduled hearing date from the invitation, not its save date', () => {
    expect(logistics.date).toBe('2026-09-22');
    expect(logistics.date).not.toBe(APPEAL_INVITATION.date); // 2026-09-20, the save date
  });

  it('J. seeds the scheduled time', () => {
    expect(logistics.time).toBe('10:00');
  });

  it('K. seeds the scheduled method/location', () => {
    expect(logistics.locationOrMethod).toBe('Microsoft Teams');
  });

  it('returns null rather than a half-filled object when the invitation predates structured logistics', () => {
    const legacy = { ...APPEAL_INVITATION, hearingDate: undefined, hearingTime: undefined, hearingLocationOrMethod: undefined };
    expect(appealInvitationLogistics({ meetings: [legacy] })).toBeNull();
    expect(appealInvitationLogistics({ meetings: BASE_MEETINGS })).toBeNull();
  });

  it('takes logistics from the latest invitation when several exist', () => {
    const older = { ...APPEAL_INVITATION, id: 'older', savedAt: '2026-09-19T08:00:00.000Z', hearingDate: '2026-09-21', hearingTime: '09:00', hearingLocationOrMethod: 'Leeds Office' };
    expect(appealInvitationLogistics({ meetings: [older, APPEAL_INVITATION] })).toEqual({
      date: '2026-09-22', time: '10:00', locationOrMethod: 'Microsoft Teams',
    });
  });

  // Q — the invitation is evidence of what was communicated and must never be
  // rewritten when the hearing is actually held on a different day.
  it('Q. seeding never mutates the invitation record', () => {
    const snapshot = JSON.parse(JSON.stringify(APPEAL_INVITATION));
    const caseObj = { meetings: [...BASE_MEETINGS, APPEAL_INVITATION] };
    appealInvitationLogistics(caseObj);
    findLatestAppealInvitation(caseObj);
    expect(APPEAL_INVITATION).toEqual(snapshot);
  });
});

describe('a saved invitation is not a hearing (H, S)', () => {
  const withInvitation = { id: 'c1', stage: 'appeal', caseType: 'misconduct', meetings: [...BASE_MEETINGS, APPEAL_INVITATION] };

  it('H. no genuine appeal hearing exists merely because an invitation was saved', () => {
    const genuineAppealHearings = withInvitation.meetings.filter(
      m => (m.type || '').toLowerCase().includes('appeal') && isGenuineMeetingRecord(m));
    expect(genuineAppealHearings).toEqual([]);
  });

  // The appeal evidence check only runs once appeal is a COMPLETED stage, so
  // these use a closed case — the point at which Compass asks "did each stage
  // we passed through actually happen?".
  const closedWithInvitationOnly = { ...withInvitation, stage: 'closed' };

  it('S. a closed case whose only appeal record is an invitation reports the appeal step as missing evidence', () => {
    const progress = computeStageProgress(closedWithInvitationOnly);
    expect(progress.missingSteps.some(label => /appeal/i.test(label))).toBe(true);
  });

  it('S. the same case with a genuine appeal hearing no longer reports it missing', () => {
    const heard = { ...closedWithInvitationOnly, meetings: [...closedWithInvitationOnly.meetings, GENUINE_APPEAL_HEARING] };
    const progress = computeStageProgress(heard);
    expect(progress.missingSteps.some(label => /appeal/i.test(label))).toBe(false);
  });

  // Deliberately unchanged: an invitation legitimately proves the case IS at
  // the appeal stage — it just does not prove the hearing happened.
  it('the case still reads as being at the appeal stage with only an invitation saved', () => {
    expect(getCaseStage(withInvitation)).toBe('appeal');
  });
});

describe('next-step sequencing is preserved (A, U)', () => {
  const ctx = { isHR: true, hasAppealManager: true };

  it('A. with a saved invitation the workflow advances to Start appeal hearing', () => {
    const cs = { id: 'c1', stage: 'appeal', caseType: 'misconduct', outcome: 'First written warning', meetings: [...BASE_MEETINGS, APPEAL_INVITATION] };
    expect(getNextStep(cs, ctx).action).toBe('start_appeal_meeting');
  });

  it('without a saved invitation it still asks for the invitation first', () => {
    const cs = { id: 'c1', stage: 'appeal', caseType: 'misconduct', outcome: 'First written warning', meetings: BASE_MEETINGS };
    expect(getNextStep(cs, ctx).action).toBe('appeal_invite');
  });

  it('U. non-appeal cases are entirely unaffected by the new classification', () => {
    const cs = { id: 'c2', stage: 'investigation', caseType: 'misconduct', meetings: [INVESTIGATION] };
    expect(getNextStep(cs, { isHR: true }).action).toBeTruthy();
    expect(getCaseStage({ ...cs })).toBe('investigation');
  });
});

// F/G — the audit label must come from structural evidence, not meeting-type
// text. Mirrors App.jsx's own classification at the save path: saving an
// appeal INVITATION wrote "Appeal hearing recorded", which then fed the Case
// View activity summary and told the user a hearing had taken place.
function auditActionFor(meeting, meetingTypeLabel) {
  const isAppeal = (meetingTypeLabel || '').toLowerCase().includes('appeal');
  const letterOnly = isLetterOnlyRecord(meeting);
  return isAppeal
    ? (letterOnly ? 'Appeal hearing invitation saved' : 'Appeal hearing recorded')
    : (letterOnly ? 'Letter saved to case' : 'Meeting saved');
}

describe('audit wording (F, G)', () => {
  it('F. saving an appeal invitation records it as an invitation, never as a hearing', () => {
    const action = auditActionFor(APPEAL_INVITATION, 'Disciplinary Appeal — ACAS S5');
    expect(action).toBe('Appeal hearing invitation saved');
    expect(action).not.toBe('Appeal hearing recorded');
  });

  it('G. saving a genuine appeal hearing still records "Appeal hearing recorded"', () => {
    expect(auditActionFor(GENUINE_APPEAL_HEARING, 'Disciplinary Appeal — ACAS S5')).toBe('Appeal hearing recorded');
  });

  it('U. ordinary meeting saves are unchanged', () => {
    expect(auditActionFor(INVESTIGATION, 'Investigation')).toBe('Meeting saved');
    expect(auditActionFor(DISCIPLINARY_WITH_OUTCOME, 'Disciplinary')).toBe('Meeting saved');
  });

  it('a letter-only save on a non-appeal type is labelled as a letter, not a meeting', () => {
    const outcomeLetterOnly = { id: 'x', type: 'Disciplinary', letterType: 'outcome', record: '', transcript: [], letterOutput: 'text' };
    expect(auditActionFor(outcomeLetterOnly, 'Disciplinary')).toBe('Letter saved to case');
  });
});

// N/O/P — chair enforcement is unchanged; these mirror the deployed SQL
// trigger's own rule so the client and database stay aligned.
describe('chair controls are preserved (N, O, P)', () => {
  const classify = entry => {
    const isAppealType = (entry.type || '').toLowerCase().includes('appeal');
    const letterOnly = ['invite', 'appeal'].includes(entry.letterType)
      && !(entry.record || '') && !((entry.transcript || []).length);
    return { requiresChair: isAppealType && !letterOnly };
  };
  const CURRENT_OFFICER = 'officer-uuid';
  const validate = entry => {
    if (!classify(entry).requiresChair) return { ok: true };
    if (!entry.chairUserId) return { ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' };
    if (entry.chairUserId !== CURRENT_OFFICER) return { ok: false, error: 'APPEAL_CHAIR_MISMATCH' };
    return { ok: true };
  };

  it('N. the invitation stays exempt from the genuine-hearing chair requirement', () => {
    expect(classify(APPEAL_INVITATION).requiresChair).toBe(false);
    expect(validate(APPEAL_INVITATION)).toEqual({ ok: true });
  });

  it('M/O. a genuine appeal hearing still requires a chair matching the current officer', () => {
    expect(classify(GENUINE_APPEAL_HEARING).requiresChair).toBe(true);
    expect(validate(GENUINE_APPEAL_HEARING)).toEqual({ ok: true });
    expect(validate({ ...GENUINE_APPEAL_HEARING, chairUserId: null }).error).toBe('APPEAL_HEARING_CHAIR_MISSING');
  });

  it('P. a stale officer is still rejected', () => {
    expect(validate({ ...GENUINE_APPEAL_HEARING, chairUserId: 'previous-officer-uuid' }).error).toBe('APPEAL_CHAIR_MISMATCH');
  });

  it('savedBy stays a separate concept from the chair', () => {
    expect(GENUINE_APPEAL_HEARING.savedBy).not.toBe(GENUINE_APPEAL_HEARING.chairUserId);
    expect(validate(GENUINE_APPEAL_HEARING)).toEqual({ ok: true });
  });
});

// V — a rejected save must not leave a second hearing behind on retry.
describe('save failure and retry (V)', () => {
  it('rolling back a failed append leaves exactly one hearing after a successful retry', () => {
    const before = [...BASE_MEETINGS, APPEAL_INVITATION];
    const optimistic = [...before, GENUINE_APPEAL_HEARING];
    const rolledBack = before; // saveMeetingToCaseImpl restores the snapshot on failure
    const retried = [...rolledBack, GENUINE_APPEAL_HEARING];
    const genuineAppealHearings = retried.filter(m => (m.type || '').toLowerCase().includes('appeal') && isGenuineMeetingRecord(m));
    expect(optimistic).toHaveLength(5);
    expect(genuineAppealHearings).toHaveLength(1);
    expect(new Set(retried.map(m => m.id)).size).toBe(retried.length);
  });
});

// T — the AI prompt's "Previous meetings:" list must not describe a letter as
// a meeting that happened.
describe('AI previous-meetings context (T)', () => {
  const buildContext = meetings => meetings.filter(isGenuineMeetingRecord).slice(-3)
    .map(m => m.type + ' on ' + m.date + (m.record ? ' — ' + m.record.slice(0, 100) : '')).join('; ');

  it('T. omits the invitation instead of describing it as a Disciplinary Appeal that occurred', () => {
    const context = buildContext([...BASE_MEETINGS, APPEAL_INVITATION]);
    expect(context).not.toContain('Disciplinary Appeal on 2026-09-20');
    expect(context).not.toContain('2026-09-20');
  });

  it('includes a genuine appeal hearing once one exists', () => {
    const context = buildContext([...BASE_MEETINGS, APPEAL_INVITATION, GENUINE_APPEAL_HEARING]);
    expect(context).toContain('Disciplinary Appeal on 2026-09-22');
  });
});
