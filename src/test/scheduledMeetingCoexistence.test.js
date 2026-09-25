import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, isScheduledMeeting, scheduledMeetingsFor, resumableMeetingFor,
  isMeetingComplete, lastGenuineMeeting, declaredStatus,
} from '../lib/meetingLifecycle.js';
import { getCaseStage } from '../lib/caseStage.js';
import { planMeetingWrite } from '../lib/meetingWrites.js';
import { getNextStep } from '../lib/nextStep.js';

// Phase 2.3 human retest — "scheduled Disciplinary meeting not visible".
//
// The retest reported that Case View showed only the completed Investigation
// and its outstanding signature action, with no scheduled Disciplinary meeting
// and no Prepare/Start/Reschedule/Cancel controls. Production inspection proved
// the meeting had never been written, so Case View was telling the truth and
// there was nothing to surface.
//
// That left the real question unguarded: WOULD it have been surfaced? Nothing
// tested the state the retest was trying to reach — a case carrying a completed
// meeting, an outstanding signature task, AND a future scheduled meeting at the
// same time. This file locks that coexistence in.
//
// The rule being protected: a secondary outstanding task must never make a
// scheduled process event disappear. The two facts are independent —
//   1. the Investigation record may still need a signature;
//   2. a Disciplinary meeting has already been arranged
// — and Compass must represent both simultaneously.
//
// SCOPE. This file covers DISCOVERY and ATTACHMENT only: that the scheduled
// meeting is found, surfaced, and handed to Prepare by id. It does NOT prove
// that Start then preserves that id — a separate P1 defect, found by human UAT
// on 2026-09-25, where Start from the prep pack minted a second meeting. That
// contract lives in prepStartContinuity.test.js. Read 4.2 below as "Prepare
// receives the right id", never as "the lifecycle survives Start".

const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');

// Source assertions must ignore comment prose: comments legitimately name the
// things the code must not do, so matching them proves nothing.
const stripComments = src => src
  .split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const caseViewCode = stripComments(caseView);
const appCode = stripComments(app);

const CASE_ID = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';
const INV_ID = 'meeting_cad06fdb-24d5-4066-adad-e46aac10483c';
const DISC_ID = 'meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f';  // the real persisted id

// The completed Investigation meeting, as production actually holds it:
// declared completed, a real record, and NO signature yet.
const completedInvestigation = (over = {}) => ({
  id: INV_ID, caseId: CASE_ID, type: 'Investigation',
  status: MEETING_STATUS.COMPLETED,
  schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams', location: null },
  date: '2026-10-01',
  createdAt: '2026-09-24T20:11:55.819Z', createdBy: 'HR Manager',
  startedAt: '2026-09-24T20:15:11.000Z', endedAt: '2026-09-24T20:49:00.000Z',
  record: 'Investigation meeting record — the employee accounted for the vehicle use.',
  transcript: [{ speaker: 'HR', text: 'Thank you for attending.' }],
  signStatus: undefined,          // signature still outstanding
  invitation: null, calendar: null, ...over,
});

// The future scheduled Disciplinary meeting the retest was trying to create.
const scheduledDisciplinary = (over = {}) => ({
  id: DISC_ID, caseId: CASE_ID, type: 'Disciplinary',
  status: MEETING_STATUS.SCHEDULED,
  schedule: { date: '2026-10-02', time: '10:00', method: 'Microsoft Teams', location: null },
  date: '2026-10-02',
  createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: null, endedAt: null, record: null, transcript: [],
  participants: [], manager: 'Jane Smith', chairUserId: null,
  invitation: null, calendar: null, ...over,
});

// The state as production actually holds it, verified against the real row
// after the successful human schedule on 2026-09-25: stage is NOT pinned, so
// it is derived — and with a Disciplinary meeting present it derives to
// "disciplinary", not "investigation".
const productionCase = (over = {}) => ({
  id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3',
  caseType: 'Misconduct', stage: 'open',
  meetings: [completedInvestigation(), scheduledDisciplinary()],
  ...over,
});

// The same meetings with the stage PINNED to investigation. This is not what
// production derives; it is here to exercise the investigation branch of the
// recipe, where the signature step is what competes with the scheduled meeting.
const pinnedInvestigationCase = (over = {}) => ({
  ...productionCase(), stage: 'investigation', ...over,
});

const retestCase = pinnedInvestigationCase;

describe('1. the scheduled Disciplinary meeting stays discoverable', () => {
  it('1.1 is selected as a scheduled meeting', () => {
    const found = scheduledMeetingsFor(retestCase());
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(DISC_ID);
    expect(found[0].type).toBe('Disciplinary');
  });

  it('1.2 the completed Investigation is not mistaken for a scheduled meeting', () => {
    expect(isScheduledMeeting(completedInvestigation())).toBe(false);
    expect(isScheduledMeeting(scheduledDisciplinary())).toBe(true);
  });

  it('1.3 a completed meeting EARLIER in the array does not hide it', () => {
    // Order independence: the defect class here would be a "latest meeting"
    // or "first meeting" selector, which would return the Investigation.
    const reversed = retestCase({ meetings: [scheduledDisciplinary(), completedInvestigation()] });
    expect(scheduledMeetingsFor(reversed).map(m => m.id)).toEqual([DISC_ID]);
    expect(scheduledMeetingsFor(retestCase()).map(m => m.id)).toEqual([DISC_ID]);
  });

  it('1.4 selection is by declared status, never by type or recency', () => {
    expect(declaredStatus(scheduledDisciplinary())).toBe(MEETING_STATUS.SCHEDULED);
    // lastGenuineMeeting legitimately returns the Disciplinary (it is last),
    // which is exactly why the banner must not depend on "latest meeting".
    const scheduled = scheduledMeetingsFor(retestCase());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].id).not.toBe(INV_ID);
  });
});

describe('2. the outstanding signature coexists and cannot hide it', () => {
  it('2.1 the Investigation is workflow-complete, so signature is the next step', () => {
    const cs = retestCase();
    expect(isMeetingComplete(completedInvestigation())).toBe(true);
    const step = getNextStep(cs, { isHR: true });
    expect(step.action).toBe('send_signature');
    expect(step.label).toBe('Send investigation record for signature');
  });

  it('2.2 the signature step does NOT consume or rewrite the scheduled meeting', () => {
    // send_signature is deliberately not a SCHEDULABLE_ACTION, so
    // withScheduledMeeting leaves it alone — the scheduled meeting is
    // surfaced by the banner instead, not by the next-step slot.
    const cs = retestCase();
    const step = getNextStep(cs, { isHR: true });
    expect(step.action).toBe('send_signature');
    expect(step.scheduledMeetingId).toBeUndefined();
    // and it is still fully discoverable
    expect(scheduledMeetingsFor(cs).map(m => m.id)).toEqual([DISC_ID]);
  });

  it('2.3 both truths hold at once', () => {
    const cs = retestCase();
    const signatureOutstanding = getNextStep(cs, { isHR: true }).action === 'send_signature';
    const hasScheduled = scheduledMeetingsFor(cs).length > 0;
    expect(signatureOutstanding).toBe(true);
    expect(hasScheduled).toBe(true);
  });

  it('2.4 signing the record still does not remove the scheduled meeting', () => {
    const cs = retestCase({
      meetings: [completedInvestigation({ signStatus: 'signed' }), scheduledDisciplinary()],
    });
    expect(getNextStep(cs, { isHR: true }).action).not.toBe('send_signature');
    expect(scheduledMeetingsFor(cs).map(m => m.id)).toEqual([DISC_ID]);
  });
});

describe('3. Case View surfaces it independently of the next step', () => {
  it('3.1 the banner is gated only on scheduledMeetings.length', () => {
    expect(caseViewCode).toContain('const scheduledMeetings = scheduledMeetingsFor(cs)');
    expect(caseViewCode).toContain('scheduledMeetings.length>0&&(');
  });

  it('3.2 the banner condition is not coupled to the next step or signature', () => {
    const i = caseViewCode.indexOf('scheduledMeetings.length>0&&(');
    expect(i).toBeGreaterThan(-1);
    // the render condition itself, up to the opening of the block
    const condition = caseViewCode.slice(i, caseViewCode.indexOf('(', i + 28));
    for (const forbidden of ['nextStep', 'send_signature', 'signStatus', 'isMeetingComplete']) {
      expect(condition).not.toContain(forbidden);
    }
  });

  it('3.3 all four controls exist in the banner', () => {
    const i = caseViewCode.indexOf('scheduledMeetings.length>0&&(');
    const banner = caseViewCode.slice(i, i + 4000);
    // user-facing labels, each on its own JSX line
    const labels = banner.split('\n').map(l => l.trim());
    for (const label of ['Prepare', 'Start scheduled meeting', 'Reschedule', 'Cancel']) {
      expect(labels).toContain(label);
    }
  });
});

describe('4. Prepare attaches to that same meeting id', () => {
  it('4.1 every control receives the mapped meeting object, not a re-derived one', () => {
    const i = caseViewCode.indexOf('scheduledMeetings.length>0&&(');
    const banner = caseViewCode.slice(i, i + 4000);
    for (const handler of [
      'onPrepareScheduledMeeting?.(cs, m)',
      'onStartScheduledMeeting?.(cs, m)',
      'onRescheduleMeeting?.(cs, m)',
      'onCancelScheduledMeeting?.(cs, m)',
    ]) {
      expect(banner).toContain(handler);
    }
  });

  it('4.2 Prepare carries the scheduled meeting id and its real case id', () => {
    const j = appCode.indexOf('const prepareScheduledMeeting');
    expect(j).toBeGreaterThan(-1);
    const body = appCode.slice(j, j + 900);
    expect(body).toContain('meetingId: meeting.id');
    expect(body).toContain('caseId: cs.id');
    // never by name, never by type, never "latest", never a new id
    expect(body).not.toContain('newId(');
    expect(body).not.toContain('employeeName ===');
    expect(body).not.toContain('lastGenuineMeeting');
  });

  it('4.3 the id Prepare would receive is the scheduled Disciplinary meeting', () => {
    // Simulates the banner's own map: whatever scheduledMeetingsFor selects is
    // exactly what the Prepare handler is handed.
    const cs = retestCase();
    const handed = scheduledMeetingsFor(cs).map(m => ({ caseId: cs.id, meetingId: m.id }));
    expect(handed).toEqual([{ caseId: CASE_ID, meetingId: DISC_ID }]);
  });
});

describe('4a. the real production state after the successful human schedule', () => {
  // Verified against the persisted row: case e2d474da-…, updated_at
  // 2026-09-25 08:17:02.787, two entries, the Disciplinary scheduled for
  // 2026-10-02 10:00 Microsoft Teams.
  it('4a.1 the derived stage is disciplinary, not investigation', () => {
    expect(getCaseStage(productionCase())).toBe('disciplinary');
  });

  it('4a.2 the scheduled meeting is promoted into the next-step slot itself', () => {
    // This is what production shows: because start_disciplinary IS a
    // SCHEDULABLE_ACTION, withScheduledMeeting rewrites it to act on the
    // meeting that already exists rather than offering to arrange another.
    const step = getNextStep(productionCase(), { isHR: true });
    expect(step.action).toBe('start_scheduled_meeting');
    expect(step.label).toBe('Start scheduled meeting');
    expect(step.scheduledMeetingId).toBe(DISC_ID);
  });

  it('4a.3 Start and Prepare therefore act on the same single meeting id', () => {
    const cs = productionCase();
    const step = getNextStep(cs, { isHR: true });
    const banner = scheduledMeetingsFor(cs);
    expect(banner).toHaveLength(1);
    expect(step.scheduledMeetingId).toBe(banner[0].id);
    expect(banner[0].id).not.toBe(INV_ID);
  });

  it('4a.4 nothing is in progress — the meeting has not been held', () => {
    const cs = productionCase();
    expect(resumableMeetingFor(cs).meeting).toBeNull();
    expect(scheduledDisciplinary().startedAt).toBeNull();
    expect(scheduledDisciplinary().endedAt).toBeNull();
    expect(isMeetingComplete(scheduledDisciplinary())).toBe(false);
  });

  it('4a.5 the completed Investigation is still complete and still separate', () => {
    const cs = productionCase();
    expect(cs.meetings).toHaveLength(2);
    expect(isMeetingComplete(cs.meetings[0])).toBe(true);
    expect(cs.meetings[0].id).toBe(INV_ID);
    expect(cs.meetings[1].id).toBe(DISC_ID);
  });
});

describe('5. nothing is duplicated, replaced or invented', () => {
  it('5.1 creating the Disciplinary meeting appends exactly one entry', () => {
    const before = { id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings: [completedInvestigation()] };
    const plan = planMeetingWrite({ cases: [before], caseId: CASE_ID, meeting: scheduledDisciplinary() });
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe('create');
    const next = plan.nextCases.find(c => c.id === CASE_ID);
    expect(next.meetings).toHaveLength(2);
    expect(next.meetings.map(m => m.id)).toEqual([INV_ID, DISC_ID]);
  });

  it('5.2 the completed Investigation is untouched by the create', () => {
    const inv = completedInvestigation();
    const before = { id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings: [inv] };
    const plan = planMeetingWrite({ cases: [before], caseId: CASE_ID, meeting: scheduledDisciplinary() });
    const kept = plan.nextCases.find(c => c.id === CASE_ID).meetings[0];
    expect(kept).toEqual(inv);
    expect(kept.status).toBe(MEETING_STATUS.COMPLETED);
    expect(kept.record).toBe(inv.record);
    expect(kept.createdAt).toBe('2026-09-24T20:11:55.819Z');
  });

  it('5.3 the new meeting keeps its own creation metadata and parentage', () => {
    const before = { id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings: [completedInvestigation()] };
    const plan = planMeetingWrite({ cases: [before], caseId: CASE_ID, meeting: scheduledDisciplinary() });
    expect(plan.meeting.id).toBe(DISC_ID);
    expect(plan.meeting.caseId).toBe(CASE_ID);
    expect(plan.meeting.createdAt).toBe('2026-09-25T08:17:02.782Z');
    expect(plan.meeting.createdBy).toBe('UAT - HR Manager');
    expect(plan.meeting.status).toBe(MEETING_STATUS.SCHEDULED);
  });

  it('5.4 lastGenuineMeeting still sees both meetings as genuine', () => {
    const last = lastGenuineMeeting(retestCase().meetings);
    expect(last.id).toBe(DISC_ID);
    expect(isMeetingComplete(completedInvestigation())).toBe(true);
  });
});
