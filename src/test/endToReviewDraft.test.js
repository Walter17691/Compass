import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, LETTER_STATUS, declaredStatus, isGenuineMeeting, isMeetingComplete,
  isResumableMeeting, isScheduledMeeting, scheduledMeetingsFor, resumableMeetingFor,
  meetingStatus, lastGenuineMeeting,
} from '../lib/meetingLifecycle.js';
import {
  WRITE_FAILURE, END_DECISION, planMeetingEnd, transitionMeeting, planMeetingWrite,
} from '../lib/meetingWrites.js';
import { getNextStep } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Release 1 Phase 3A — End is a real lifecycle transition.
//
// Before this, End (handleReview) persisted NOTHING: no status, no endedAt, and
// it cleared the localStorage crash-recovery draft on the way out. Between End
// and Save the meeting existed only in that browser tab, which is NEW-26's root
// cause, and review_draft was a declared state with no writer and zero
// production rows.
//
// SCOPE BOUNDARY, asserted deliberately below: 3A establishes lifecycle
// continuity, NOT content continuity. The Review draft itself is still volatile
// — that is 3B. So these tests prove the STATE survives, and explicitly do not
// claim the generated record does.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
const writes = readFileSync('src/lib/meetingWrites.js', 'utf8');

const stripComments = src => src
  .split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = stripComments(app);
const caseViewCode = stripComments(caseView);
const writesCode = stripComments(writes);

const CASE_ID = 'case-3a';
const MID = 'meeting_3a_disciplinary';
const STARTED = '2026-09-25T09:00:00.000Z';
const ENDED = '2026-09-25T10:30:00.000Z';
const HR = { isHR: true };
const clone = v => JSON.parse(JSON.stringify(v));

// A live meeting that began life SCHEDULED and was then started — the formerly
// scheduled path. It still carries its schedule, which End must not disturb.
const liveFromScheduled = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.IN_PROGRESS,
  schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-04', createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: STARTED, endedAt: null, chairUserId: null, manager: 'Jane Smith',
  participants: [{ name: 'Jane Smith', role: 'Chair' }],
  record: null, transcript: [{ id: 'u1', speaker: 'HR', text: 'Thank you for attending.' }],
  invitation: null, calendar: null, ...over,
});

// A live meeting created by direct Start Now — no schedule key at all.
const liveFromDirectStart = (over = {}) => {
  const m = liveFromScheduled({ id: 'meeting_3a_direct', ...over });
  delete m.schedule;
  return m;
};

const caseWith = (...meetings) => ({ id: CASE_ID, employeeName: 'Sam Patel', meetings });

// Models handleReview's lifecycle step: plan, then transition via the canonical
// primitive. Content generation is out of scope and deliberately not modelled.
const makeEnder = (initialCases) => {
  let db = clone(initialCases);
  const changedIds = [];
  const saveCases = vi.fn(async (next, changedId) => { changedIds.push(changedId); db = clone(next); return { ok: true }; });

  const endMeeting = async ({ caseId, meetingId, endedAt = ENDED }) => {
    const plan = planMeetingEnd({ cases: db, caseId, meetingId });
    if (plan.decision === END_DECISION.TRANSITION) {
      const r = await transitionMeeting({
        cases: db, caseId, meetingId,
        allowedFrom: [MEETING_STATUS.IN_PROGRESS], toStatus: MEETING_STATUS.REVIEW_DRAFT,
        patch: { endedAt }, saveCases,
      });
      return r?.ok ? { ok: true, mode: 'transition', meetingId } : { ok: false, reason: r?.reason };
    }
    if (plan.decision === END_DECISION.ALREADY_ENDED) return { ok: true, mode: 'already_ended', meetingId };
    return { ok: false, reason: plan.reason };
  };

  return {
    endMeeting, saveCases, changedIds,
    cases: () => db,
    theCase: () => db.find(c => c.id === CASE_ID),
    meetings: () => db.find(c => c.id === CASE_ID).meetings,
    meeting: id => db.find(c => c.id === CASE_ID).meetings.find(m => m.id === id),
  };
};

describe('A/B. in_progress → review_draft, both start paths', () => {
  it('A. a directly-started meeting ends into review_draft', async () => {
    const h = makeEnder([caseWith(liveFromDirectStart())]);
    const res = await h.endMeeting({ caseId: CASE_ID, meetingId: 'meeting_3a_direct' });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('transition');
    expect(h.meeting('meeting_3a_direct').status).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });

  it('B. a formerly scheduled meeting ends into review_draft, schedule intact', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    const m = h.meeting(MID);
    expect(m.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(m.schedule).toEqual({ date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' });
  });
});

describe('C–G. identity, parentage and no duplication', () => {
  it('C/D. the same meeting id and caseId are retained', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    const res = await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(res.meetingId).toBe(MID);
    expect(h.meeting(MID).id).toBe(MID);
    expect(h.meeting(MID).caseId).toBe(CASE_ID);
  });

  it('E/F/G. array length unchanged, nothing appended, no duplicate', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.meetings()).toHaveLength(1);
    expect(h.meetings().map(m => m.id)).toEqual([MID]);
  });

  it('everything except status and endedAt survives the patch', async () => {
    const before = liveFromScheduled();
    const h = makeEnder([caseWith(before)]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    const after = h.meeting(MID);
    for (const k of ['id', 'caseId', 'type', 'schedule', 'date', 'createdAt', 'createdBy',
                     'startedAt', 'chairUserId', 'manager', 'participants', 'transcript',
                     'invitation', 'calendar', 'record']) {
      expect(after[k]).toEqual(before[k]);
    }
    expect(after.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(after.endedAt).toBe(ENDED);
  });
});

describe('H–K. timing integrity and replay safety', () => {
  it('H. startedAt is unchanged by End', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.meeting(MID).startedAt).toBe(STARTED);
  });

  it('I/J. endedAt is written, once', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.meeting(MID).endedAt).toBe(ENDED);
    // a replay carrying a DIFFERENT instant must not move it
    const again = await h.endMeeting({ caseId: CASE_ID, meetingId: MID, endedAt: '2026-09-25T23:59:59.000Z' });
    expect(again.mode).toBe('already_ended');
    expect(h.meeting(MID).endedAt).toBe(ENDED);
  });

  it('K. double End produces no second object and no second write', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    const first = await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    const second = await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(first.mode).toBe('transition');
    expect(second.mode).toBe('already_ended');
    expect(second.ok).toBe(true);
    expect(h.meetings()).toHaveLength(1);
    expect(h.saveCases).toHaveBeenCalledTimes(1);   // the replay wrote nothing
    expect(h.meeting(MID).startedAt).toBe(STARTED);
    expect(h.meeting(MID).endedAt).toBe(ENDED);
  });

  it('a third and fourth End remain idempotent', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.saveCases).toHaveBeenCalledTimes(1);
    expect(h.meetings()).toHaveLength(1);
  });
});

describe('L–P. targeting and fail-closed', () => {
  it('L. the exact meeting is targeted when the case holds several', async () => {
    const other = liveFromScheduled({ id: 'meeting_other', status: MEETING_STATUS.SCHEDULED, startedAt: null });
    const h = makeEnder([caseWith(other, liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(h.meeting('meeting_other').status).toBe(MEETING_STATUS.SCHEDULED);
    expect(h.meeting('meeting_other').endedAt).toBeNull();
  });

  it('M. an unknown meeting id fails closed and writes nothing', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    const res = await h.endMeeting({ caseId: CASE_ID, meetingId: 'meeting_nope' });
    expect(res).toEqual({ ok: false, reason: WRITE_FAILURE.NOT_FOUND });
    expect(h.saveCases).not.toHaveBeenCalled();
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('N. a wrong/unknown case id fails closed', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    expect(await h.endMeeting({ caseId: 'case-elsewhere', meetingId: MID }))
      .toEqual({ ok: false, reason: WRITE_FAILURE.NOT_FOUND });
    expect(await h.endMeeting({ caseId: '', meetingId: MID }))
      .toEqual({ ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED });
    expect(h.saveCases).not.toHaveBeenCalled();
  });

  it('N.2 a meeting claiming a different parent is a mismatch', () => {
    const plan = planMeetingEnd({
      cases: [caseWith(liveFromScheduled({ caseId: 'case-elsewhere' }))], caseId: CASE_ID, meetingId: MID });
    expect(plan.decision).toBe(END_DECISION.REJECT);
    expect(plan.reason).toBe(WRITE_FAILURE.PARENTAGE_MISMATCH);
  });

  it('O. a stale updated_at fails closed and never becomes an append', async () => {
    let db = clone([caseWith(liveFromScheduled())]);
    const saveCases = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    const r = await transitionMeeting({
      cases: db, caseId: CASE_ID, meetingId: MID,
      allowedFrom: [MEETING_STATUS.IN_PROGRESS], toStatus: MEETING_STATUS.REVIEW_DRAFT,
      patch: { endedAt: ENDED }, saveCases,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('conflict');
    expect(db.find(c => c.id === CASE_ID).meetings).toHaveLength(1);
    expect(db.find(c => c.id === CASE_ID).meetings[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('P. the transition resolves by id only — no employee-name matching', () => {
    const i = writesCode.indexOf('export function planMeetingEnd');
    const body = writesCode.slice(i, writesCode.indexOf('\n}', i));
    expect(body).not.toContain('employeeName');
    expect(body).not.toContain('toLowerCase');
    expect(body).not.toContain('saveCases');      // pure
    expect(body).not.toContain('await');
    // and the End call site in App.jsx targets caseInfo's authoritative ids
    const j = appCode.indexOf('const plan = planMeetingEnd(');
    expect(j).toBeGreaterThan(-1);
    const call = appCode.slice(j, j + 200);
    expect(call).toContain('caseId: caseInfo.caseId');
    expect(call).toContain('meetingId: caseInfo.meetingId');
    expect(call).toContain('cases: casesRef.current');
  });

  it('P.2 rejected states cannot be ended: scheduled, completed, cancelled, legacy', () => {
    for (const status of [MEETING_STATUS.SCHEDULED, MEETING_STATUS.COMPLETED, MEETING_STATUS.CANCELLED]) {
      const plan = planMeetingEnd({ cases: [caseWith(liveFromScheduled({ status }))], caseId: CASE_ID, meetingId: MID });
      expect(plan.decision).toBe(END_DECISION.REJECT);
      expect(plan.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    }
    const legacy = liveFromScheduled({ record: 'Held long ago.' });
    delete legacy.status;
    const lp = planMeetingEnd({ cases: [caseWith(legacy)], caseId: CASE_ID, meetingId: MID });
    expect(lp.decision).toBe(END_DECISION.REJECT);
    expect(lp.from).toBeNull();
  });
});

describe('Q–S. review_draft is not complete, not resumable, not scheduled', () => {
  const ended = () => liveFromScheduled({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED });

  it('Q. isMeetingComplete(review_draft) === false', () => {
    expect(isMeetingComplete(ended())).toBe(false);
    expect(meetingStatus(ended())).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });

  it('R. review_draft is not resumable', () => {
    expect(isResumableMeeting(ended())).toBe(false);
    expect(resumableMeetingFor(caseWith(ended())).meeting).toBeNull();
  });

  it('S. review_draft is not scheduled', () => {
    expect(isScheduledMeeting(ended())).toBe(false);
    expect(scheduledMeetingsFor(caseWith(ended()))).toEqual([]);
  });

  it('it is still a genuine meeting and the newest one', () => {
    expect(isGenuineMeeting(ended())).toBe(true);
    expect(lastGenuineMeeting([ended()]).id).toBe(MID);
  });
});

describe('T–V. Case View routes to Review for that exact meeting', () => {
  // disciplinary stage: investigation complete and signed, so the recipe is
  // asking about the hearing itself.
  const completedInv = () => ({
    id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
    date: '2026-09-20', record: 'Investigation record.', transcript: [1],
    startedAt: '2026-09-20T09:00:00.000Z', endedAt: '2026-09-20T09:40:00.000Z', signStatus: 'signed',
  });
  const reviewCase = () => ({
    id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
    meetings: [completedInv(), liveFromScheduled({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED })],
  });

  it('T. the suggested next step is Review meeting record', () => {
    const step = getNextStep(reviewCase(), HR);
    expect(step.action).toBe('review_meeting_record');
    expect(step.label).toBe('Review meeting record');
  });

  it('T.2 it is neither Start nor Resume', () => {
    const step = getNextStep(reviewCase(), HR);
    expect(step.action).not.toBe('start_disciplinary');
    expect(step.action).not.toBe('start_scheduled_meeting');
    expect(step.action).not.toBe('resume_meeting');
    expect(step.label).not.toBe('Start disciplinary hearing');
    expect(step.label).not.toBe('Resume meeting');
  });

  it('U. the step carries the exact meeting id', () => {
    expect(getNextStep(reviewCase(), HR).reviewMeetingId).toBe(MID);
  });

  it('V. the CTA reopens Review for that meeting and writes nothing', () => {
    const i = caseViewCode.indexOf('nextStep.action==="review_meeting_record"');
    expect(i).toBeGreaterThan(-1);
    const branch = caseViewCode.slice(i, i + 300);
    expect(branch).toContain('nextStep.reviewMeetingId');
    expect(branch).toContain('onOpenReviewForMeeting?.(cs, m)');
    // the placeholder that opened the signature modal is gone
    expect(branch).not.toContain('setShowSignModal');
    expect(branch).not.toContain('saveCases');
  });

  it('V.2 reopening restores identity and timing from the persisted meeting', () => {
    const j = appCode.indexOf('const openReviewForMeeting =');
    expect(j).toBeGreaterThan(-1);
    const body = appCode.slice(j, appCode.indexOf('\n  };', j));
    expect(body).toContain('meetingId: meeting.id');
    expect(body).toContain('caseId: cs.id');
    expect(body).toContain('setMeetingEndTime(meeting.endedAt || null)');
    expect(body).toContain('setMeetingStartTime(meeting.startedAt || null)');
    // writes nothing, mints nothing, completes nothing
    for (const forbidden of ['saveCases', 'persistMeeting', 'transitionMeeting', 'newId(',
                             'MEETING_STATUS.COMPLETED', 'setShowSignModal']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('V.3 the badge says the record is in review, not "in progress"', () => {
    expect(appCode).toContain('awaitingRecordOfType');
    expect(appCode).toContain('Disciplinary record in review');
    expect(appCode).toContain('Appeal record in review');
    expect(appCode).toContain('Grievance record in review');
  });
});

describe('W–Y. review_draft unlocks no downstream workflow', () => {
  const discCase = (discOver) => ({
    id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
    meetings: [
      { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
        record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
      liveFromScheduled(discOver),
    ],
  });

  it('W. signature is not offered for a review_draft hearing', () => {
    const step = getNextStep(discCase({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED }), HR);
    expect(step.action).not.toBe('send_signature');
  });

  it('X. no outcome letter is offered', () => {
    const step = getNextStep(discCase({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED }), HR);
    expect(step.action).not.toBe('outcome_letter');
    expect(step.action).not.toBe('appeal_letter');
  });

  it('Y. closure is not offered', () => {
    const step = getNextStep(discCase({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED }), HR);
    expect(step.action).not.toBe('close_case');
    expect(step.action).not.toBe('post_outcome');
  });

  it('the same hearing, once completed, DOES unlock signature — the boundary holds', () => {
    const step = getNextStep(discCase({
      status: MEETING_STATUS.COMPLETED, endedAt: ENDED, record: 'The hearing was held.' }), HR);
    expect(step.action).toBe('send_signature');
  });

  it('3A does not add a review_draft → completed transition', () => {
    // The allowed-from guard on completion is explicitly a 3B task. Assert that
    // 3A has NOT quietly introduced one, so the deferral is visible.
    expect(appCode).not.toContain('allowedFrom: [MEETING_STATUS.REVIEW_DRAFT]');
    // and End only ever targets in_progress
    const i = appCode.indexOf('toStatus: MEETING_STATUS.REVIEW_DRAFT');
    expect(i).toBeGreaterThan(-1);
    expect(appCode.slice(i - 220, i)).toContain('allowedFrom: [MEETING_STATUS.IN_PROGRESS]');
  });
});

describe('Z–AF. every other state is unchanged', () => {
  const base = (over) => ({
    id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
    meetings: [
      { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
        record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
      liveFromScheduled(over),
    ],
  });

  it('Z. completed still behaves exactly as before', () => {
    expect(getNextStep(base({ status: MEETING_STATUS.COMPLETED, record: 'Held.' }), HR).action).toBe('send_signature');
  });

  it('AA. scheduled still resolves to the existing meeting', () => {
    const step = getNextStep(base({ status: MEETING_STATUS.SCHEDULED, startedAt: null }), HR);
    expect(step.action).toBe('start_scheduled_meeting');
    expect(step.scheduledMeetingId).toBe(MID);
  });

  it('AB. in_progress still resumes', () => {
    const step = getNextStep(base({}), HR);
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe(MID);
  });

  it('AC. cancelled still permits a replacement hearing', () => {
    const step = getNextStep(base({ status: MEETING_STATUS.CANCELLED, startedAt: null }), HR);
    expect(step.action).toBe('start_disciplinary');
  });

  it('AD. legacy no-status compatibility is unchanged', () => {
    const withRecord = liveFromScheduled({ record: 'The hearing was held.' }); delete withRecord.status;
    const without = liveFromScheduled({ record: '', transcript: [] }); delete without.status;
    expect(isMeetingComplete(withRecord)).toBe(true);
    expect(isMeetingComplete(without)).toBe(false);
    expect(declaredStatus(withRecord)).toBeNull();
  });

  it('AE. letter-only artefacts are still excluded', () => {
    // A letter with no declared status reads as a letter, per Phase 1.
    const plainLetter = { id: 'm_l0', caseId: CASE_ID, type: 'Disciplinary', letterType: 'invite',
      letterOutput: 'Dear Sam…', record: '', transcript: [] };
    expect(isGenuineMeeting(plainLetter)).toBe(false);
    expect(meetingStatus(plainLetter)).toBe(LETTER_STATUS);

    // And one that somehow carries a declared status is STILL not a meeting, so
    // it can never be ended into review_draft. meetingStatus reports the
    // declared value (declared always wins — Phase 1), but genuineness, not the
    // label, is what gates the lifecycle.
    const statusedLetter = { ...plainLetter, id: 'm_l', status: MEETING_STATUS.IN_PROGRESS };
    expect(isGenuineMeeting(statusedLetter)).toBe(false);
    expect(meetingStatus(statusedLetter)).toBe(MEETING_STATUS.IN_PROGRESS);
    const plan = planMeetingEnd({ cases: [caseWith(statusedLetter)], caseId: CASE_ID, meetingId: 'm_l' });
    expect(plan.decision).toBe(END_DECISION.REJECT);
    expect(plan.reason).toBe(WRITE_FAILURE.INVALID_MEETING);
  });

  it('AF. a genuine hearing carrying letterType AND a record stays genuine and endable', async () => {
    const both = liveFromScheduled({ letterType: 'invite', letterOutput: 'Dear Sam…',
      record: 'Notes taken during the hearing.' });
    expect(isGenuineMeeting(both)).toBe(true);
    const h = makeEnder([caseWith(both)]);
    const res = await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(res.mode).toBe('transition');
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(h.meeting(MID).record).toBe('Notes taken during the hearing.');
  });
});

describe('AG–AI. appeal: chair is historical truth once started', () => {
  const CHAIR_A = '11111111-1111-1111-1111-111111111111';
  const CHAIR_B = '22222222-2222-2222-2222-222222222222';
  const liveAppeal = (over = {}) => liveFromScheduled({
    id: 'm_appeal', type: 'Disciplinary Appeal', chairUserId: CHAIR_A, ...over });

  it('AG. the historical chair survives End unchanged', async () => {
    const h = makeEnder([caseWith(liveAppeal())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: 'm_appeal' });
    const m = h.meeting('m_appeal');
    expect(m.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(m.chairUserId).toBe(CHAIR_A);
  });

  it('AH. replacing the appeal manager after Start does not block End', async () => {
    // The transition is decided from the meeting's own state; the currently
    // appointed officer is not an input to it at all.
    const h = makeEnder([caseWith(liveAppeal())]);
    const plan = planMeetingEnd({ cases: h.cases(), caseId: CASE_ID, meetingId: 'm_appeal' });
    expect(plan.decision).toBe(END_DECISION.TRANSITION);
    const res = await h.endMeeting({ caseId: CASE_ID, meetingId: 'm_appeal' });
    expect(res.ok).toBe(true);
    expect(h.meeting('m_appeal').chairUserId).toBe(CHAIR_A);   // not rewritten to CHAIR_B
    expect(CHAIR_B).not.toBe(h.meeting('m_appeal').chairUserId);
  });

  it('AH.2 the End path never writes chairUserId, so it cannot revalidate it', () => {
    const i = appCode.indexOf('toStatus: MEETING_STATUS.REVIEW_DRAFT');
    const region = appCode.slice(i - 400, i + 400);
    expect(region).toContain('patch: { endedAt: meetingEndTimeVal }');
    expect(region).not.toContain('chairUserId');
    expect(region).not.toContain('appealManagerId');
    const j = writesCode.indexOf('export function planMeetingEnd');
    expect(writesCode.slice(j, writesCode.indexOf('\n}', j))).not.toContain('chairUserId');
  });

  it('AI. a stale chair is still protected at Start — End did not weaken it', () => {
    // Start remains the validation point: the deployed trigger revalidates on
    // scheduled -> in_progress only, and nothing here touches that.
    expect(appCode).toContain('allowedFrom: [MEETING_STATUS.SCHEDULED]');
    const scheduledAppeal = liveAppeal({ status: MEETING_STATUS.SCHEDULED, startedAt: null });
    const plan = planMeetingEnd({ cases: [caseWith(scheduledAppeal)], caseId: CASE_ID, meetingId: 'm_appeal' });
    expect(plan.decision).toBe(END_DECISION.REJECT);   // cannot skip Start via End
  });
});

describe('write safety and the 3A scope boundary', () => {
  it('one single-case write, with changedId supplied — never sync-all', async () => {
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    expect(h.saveCases).toHaveBeenCalledTimes(1);
    expect(h.changedIds).toEqual([CASE_ID]);
  });

  it('End delegates to transitionMeeting rather than rebuilding a meeting', () => {
    const i = appCode.indexOf('const plan = planMeetingEnd(');
    const region = appCode.slice(i, i + 1400);
    expect(region).toContain('await transitionMeeting({');
    expect(region).not.toContain('planMeetingWrite(');
    expect(region).not.toContain('stampNewMeeting(');
    expect(region).not.toContain('newId("meeting")');
  });

  it('a meeting with no lifecycle identity keeps its previous behaviour', () => {
    // The unlinked entry paths must not create a case or mint a meeting just to
    // end — Phase 2.1 PARENT_REQUIRED is untouched.
    expect(appCode).toContain('if(caseInfo.caseId && caseInfo.meetingId) {');
    const plan = planMeetingEnd({ cases: [caseWith(liveFromScheduled())], caseId: null, meetingId: MID });
    expect(plan.decision).toBe(END_DECISION.REJECT);
    expect(plan.reason).toBe(WRITE_FAILURE.PARENT_REQUIRED);
  });

  it('SCOPE: 3A persists lifecycle state, NOT review content', async () => {
    // Deliberate and asserted so the boundary is visible rather than assumed.
    // 3B persists reviewDraft; this must not have started doing it.
    const h = makeEnder([caseWith(liveFromScheduled())]);
    await h.endMeeting({ caseId: CASE_ID, meetingId: MID });
    const m = h.meeting(MID);
    expect(m.reviewDraft).toBeUndefined();
    expect(m.record).toBeNull();          // unchanged — content is still volatile
    expect(m.summary).toBeUndefined();
    expect(appCode).not.toContain('reviewDraft:');
  });

  it('planMeetingWrite is untouched by 3A — create/patch semantics unchanged', () => {
    const plan = planMeetingWrite({
      cases: [caseWith(liveFromScheduled())], caseId: CASE_ID,
      meeting: liveFromScheduled({ status: MEETING_STATUS.REVIEW_DRAFT, endedAt: ENDED }) });
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe('patch');
    expect(plan.nextCases.find(c => c.id === CASE_ID).meetings).toHaveLength(1);
  });
});
