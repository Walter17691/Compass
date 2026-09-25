import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, isScheduledMeeting, scheduledMeetingsFor, scheduleInstant,
  isResumableMeeting, isMeetingComplete, declaredStatus,
} from '../lib/meetingLifecycle.js';
import { WRITE_FAILURE, transitionMeeting, planMeetingWrite } from '../lib/meetingWrites.js';
// withScheduledMeeting became withExistingMeeting when the lifecycle reader
// consistency fix extended it to in_progress and review_draft as well.
import { getNextStep, withExistingMeeting } from '../lib/nextStep.js';

// Release 1 Phase 2.3 — truthful scheduling.
//
// "Schedule meeting" now means a real Compass meeting has been scheduled: the
// same lifecycle object that will later be prepared, started, reviewed and
// completed. COMPASS FIRST — the previous implementation called the calendar
// API and returned early on failure BEFORE any persistence, so no calendar
// integration meant no scheduled meeting at all.

const app = readFileSync('src/App.jsx', 'utf8');
const home = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
const nextStepSrc = readFileSync('src/lib/nextStep.js', 'utf8');

const OFFICER_A = '11111111-1111-1111-1111-111111111111';
const OFFICER_B = '22222222-2222-2222-2222-222222222222';

const sched = (over = {}) => ({
  id: 's1', caseId: 'case-a', type: 'Investigation', status: MEETING_STATUS.SCHEDULED,
  schedule: { date: '2026-10-06', time: '10:00', method: 'Microsoft Teams', location: null },
  date: '2026-10-06', createdAt: '2026-09-23T09:00:00.000Z', createdBy: 'Jane Smith',
  participants: [], manager: 'Jane Smith', chairUserId: null,
  startedAt: null, endedAt: null, record: null, transcript: [],
  invitation: null, calendar: null, ...over,
});
const caseWith = (...meetings) => ({ id: 'case-a', employeeName: 'Sam Patel', meetings });
const okSave = () => vi.fn(async () => ({ ok: true }));

describe('1-9. a scheduled meeting is a real, authoritative object', () => {
  it('1/2/3. exactly one meeting, stable id, authoritative parentage', () => {
    const plan = planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: sched() });
    expect(plan.mode).toBe('create');
    const list = plan.nextCases[0].meetings;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('s1');
    expect(list[0].caseId).toBe('case-a');
    expect(list[0].status).toBe(MEETING_STATUS.SCHEDULED);
  });

  it('4/5/6/7. provenance and logistics are persisted', () => {
    const m = sched();
    expect(m.createdAt).toBeTruthy();
    expect(m.createdBy).toBeTruthy();
    expect(m.schedule.date).toBe('2026-10-06');
    expect(m.schedule.time).toBe('10:00');
    expect(m.schedule.method).toBe('Microsoft Teams');
  });

  it('8. a scheduled meeting survives a reload — it is server state, discovered deterministically', () => {
    const reloaded = caseWith(sched());
    expect(scheduledMeetingsFor(reloaded).map(m => m.id)).toEqual(['s1']);
    expect(isScheduledMeeting(reloaded.meetings[0])).toBe(true);
  });

  it('9. scheduling creates no transcript, record, startedAt or endedAt', () => {
    const m = sched();
    expect(m.record).toBeNull();
    expect(m.transcript).toEqual([]);
    expect(m.startedAt).toBeNull();
    expect(m.endedAt).toBeNull();
  });

  it('a scheduled meeting is neither complete nor resumable', () => {
    expect(isMeetingComplete(sched())).toBe(false);
    expect(isResumableMeeting(sched())).toBe(false);
  });

  it('the flat date mirrors schedule.date so pre-lifecycle readers still work', () => {
    const m = sched();
    expect(m.date).toBe(m.schedule.date);
    expect(app).toContain('schedule: { date, time, method: method || null },');
  });

  it('legacy rows are never mistaken for scheduled', () => {
    for (const m of [{ id: 'L', type: 'Investigation', record: 'old' }, { id: 'L', type: 'Investigation', record: '' }]) {
      expect(declaredStatus(m)).toBeNull();
      expect(isScheduledMeeting(m)).toBe(false);
    }
  });
});

describe('COMPASS FIRST — the write order is reversed', () => {
  it('persistence happens before any calendar call, and a failure returns early', () => {
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const syncMeetingToCalendar ='));
    const persistAt = fn.indexOf('await persistMeeting(');
    const failAt = fn.indexOf('return { ok: false, reason: result?.reason };');
    const calendarAt = fn.indexOf('syncMeetingToCalendar(');
    expect(persistAt).toBeGreaterThan(-1);
    expect(failAt).toBeGreaterThan(persistAt);
    expect(calendarAt).toBeGreaterThan(failAt);          // calendar only after a confirmed write
    expect(fn).not.toContain('/api/calendar');            // the sync lives in its own function
  });

  it('12. a calendar failure leaves the meeting scheduled', () => {
    expect(app).toContain('showToast(sync.ok ? "Meeting scheduled and added to your calendar" : "Meeting scheduled in Compass. Calendar sync failed — you can retry from the case.");');
    const sync = app.slice(app.indexOf('const syncMeetingToCalendar ='), app.indexOf('const startScheduledMeeting ='));
    // the failure path returns a flag; it never unwinds or deletes the meeting
    expect(sync).toContain('return { ok: false };');
    expect(sync).not.toMatch(/delete|cancelled|CANCELLED/);
  });

  it('raw provider errors are logged, never shown to the user', () => {
    const sync = app.slice(app.indexOf('const syncMeetingToCalendar ='), app.indexOf('const startScheduledMeeting ='));
    expect(sync).toContain('console.error("Calendar sync failed:"');
    expect(sync).not.toMatch(/showToast\([^)]*data\?\.error/);
  });

  it('13/14. calendar success patches the SAME meeting and never duplicates it', async () => {
    const save = okSave();
    const result = await transitionMeeting({
      cases: [caseWith(sched())], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { calendar: { provider: 'google', eventId: 'evt_1', syncedAt: 'T' } }, saveCases: save,
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('patch');
    const written = save.mock.calls[0][0][0].meetings;
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('s1');
    expect(written[0].status).toBe(MEETING_STATUS.SCHEDULED);
    expect(written[0].calendar.eventId).toBe('evt_1');
  });

  it('the calendar sync targets an existing meeting id, so it cannot create one', () => {
    const sync = app.slice(app.indexOf('const syncMeetingToCalendar ='), app.indexOf('const startScheduledMeeting ='));
    expect(sync).toContain('await transitionMeeting({');
    expect(sync).not.toContain('persistMeeting(');
    expect(sync).not.toContain('newId(');
  });
});

describe('10/11/36/37. invitation and calendar are independent facts', () => {
  const combos = [
    ['scheduled, no invitation, no calendar', { invitation: null, calendar: null }],
    ['scheduled, invitation saved, no calendar', { invitation: { draftedAt: 'T1', savedAt: 'T2', sentAt: null, letterRef: 'l1' }, calendar: null }],
    ['scheduled, calendar synced, no invitation', { invitation: null, calendar: { provider: 'google', eventId: 'e', syncedAt: 'T' } }],
    ['scheduled, invitation sent + calendar synced', { invitation: { draftedAt: 'T1', savedAt: 'T2', sentAt: 'T3', letterRef: 'l1' }, calendar: { provider: 'microsoft', eventId: 'e', syncedAt: 'T' } }],
    ['scheduled, calendar failure', { invitation: null, calendar: null }],
    ['scheduled, invitation draft only', { invitation: { draftedAt: 'T1', savedAt: null, sentAt: null, letterRef: null }, calendar: null }],
  ];

  for (const [name, over] of combos) {
    it(`representable: ${name}`, () => {
      const m = sched(over);
      expect(isScheduledMeeting(m)).toBe(true);
      expect(declaredStatus(m)).toBe(MEETING_STATUS.SCHEDULED);
      expect(planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: m }).ok).toBe(true);
    });
  }

  it('scheduling implies neither — both start null', () => {
    expect(app).toContain('invitation: null, calendar: null,');
  });

  it('no fact is derived from another', () => {
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const syncMeetingToCalendar ='));
    expect(fn).not.toMatch(/letterOutput|letterType|invitation\./);
  });
});

describe('15-20. starting a scheduled meeting transitions the same meeting', () => {
  it('15/16/17/19. id, parentage and createdAt survive; status advances', async () => {
    const save = okSave();
    const result = await transitionMeeting({
      cases: [caseWith(sched())], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: '2026-10-06T10:02:00.000Z' }, saveCases: save,
    });
    expect(result.ok).toBe(true);
    const written = save.mock.calls[0][0][0].meetings;
    expect(written).toHaveLength(1);                       // no append
    expect(written[0].id).toBe('s1');
    expect(written[0].caseId).toBe('case-a');
    expect(written[0].createdAt).toBe('2026-09-23T09:00:00.000Z');
    expect(written[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('18. startedAt is set once and the schedule is preserved', async () => {
    const save = okSave();
    await transitionMeeting({
      cases: [caseWith(sched())], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: '2026-10-06T10:02:00.000Z' }, saveCases: save,
    });
    const written = save.mock.calls[0][0][0].meetings[0];
    expect(written.startedAt).toBe('2026-10-06T10:02:00.000Z');
    expect(written.schedule.date).toBe('2026-10-06');
    expect(written.schedule.method).toBe('Microsoft Teams');
    expect(written.manager).toBe('Jane Smith');
  });

  it('20. a second Start attempt on the same scheduled meeting fails closed', async () => {
    // First attempt wins; the meeting is now in_progress.
    const save = okSave();
    const second = await transitionMeeting({
      cases: [caseWith(sched({ status: MEETING_STATUS.IN_PROGRESS, startedAt: 'T' }))],
      caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: 'T2' }, saveCases: save,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(second.from).toBe(MEETING_STATUS.IN_PROGRESS);
    expect(save).not.toHaveBeenCalled();                   // and never replayed
  });

  it('the app starts a scheduled meeting by transition, never by creation', () => {
    const fn = app.slice(app.indexOf('const startScheduledMeeting ='), app.indexOf('const prepareScheduledMeeting ='));
    expect(fn).toContain('allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,');
    expect(fn).toContain('patch: { startedAt: startInstant() }, saveCases,');
    expect(fn).not.toContain('persistMeeting(');
    expect(fn).not.toContain('newId(');
    expect(fn).not.toContain('createdAt');
  });

  it('and enters the live screen only after the transition succeeds', () => {
    const fn = app.slice(app.indexOf('const startScheduledMeeting ='), app.indexOf('const prepareScheduledMeeting ='));
    expect(fn.indexOf('return { ok: false, reason: result?.reason };')).toBeLessThan(fn.indexOf('resumeMeeting(cs, started);'));
  });
});

describe('21/22. Prepare and Save operate on the same identity', () => {
  it('21. Prepare carries the scheduled meeting id', () => {
    const fn = app.slice(app.indexOf('const prepareScheduledMeeting ='), app.indexOf('const rescheduleCaseMeeting ='));
    expect(fn).toContain('meetingId: meeting.id,');
    expect(fn).toContain('setScreen(SCREENS.PREP);');
    expect(fn).not.toContain('newId(');
    expect(fn).not.toContain('persistMeeting(');
  });

  it('22. Review Save after scheduled -> started still patches the same id', () => {
    const started = sched({ status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-10-06T10:02:00.000Z' });
    const saved = { ...started, status: MEETING_STATUS.COMPLETED, record: 'Full record.' };
    const plan = planMeetingWrite({ cases: [caseWith(started)], caseId: 'case-a', meeting: saved });
    expect(plan.mode).toBe('patch');
    expect(plan.nextCases[0].meetings).toHaveLength(1);
    expect(plan.nextCases[0].meetings[0].id).toBe('s1');
    expect(plan.nextCases[0].meetings[0].createdAt).toBe('2026-09-23T09:00:00.000Z');
    expect(isMeetingComplete(plan.nextCases[0].meetings[0])).toBe(true);
  });
});

describe('23/24/30. rescheduling', () => {
  it('23/24. the same id survives and only logistics change', async () => {
    const save = okSave();
    await transitionMeeting({
      cases: [caseWith(sched({ chairUserId: OFFICER_A }))], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { schedule: { date: '2026-10-13', time: '14:00', method: 'In person', location: 'Room 2' }, date: '2026-10-13' },
      saveCases: save,
    });
    const w = save.mock.calls[0][0][0].meetings[0];
    expect(w.id).toBe('s1');
    expect(w.createdAt).toBe('2026-09-23T09:00:00.000Z');
    expect(w.schedule.date).toBe('2026-10-13');
    expect(w.schedule.time).toBe('14:00');
    expect(w.chairUserId).toBe(OFFICER_A);                 // untouched
    expect(w.status).toBe(MEETING_STATUS.SCHEDULED);
  });

  it('30. reschedule never patches chairUserId — an appeal chair is immutable', () => {
    const fn = app.slice(app.indexOf('const rescheduleCaseMeeting ='), app.indexOf('const cancelScheduledMeeting ='));
    expect(fn).not.toContain('chairUserId');
    expect(fn).toContain('patch: { schedule:');
  });

  it('rescheduling is audited rather than silent', () => {
    expect(app).toContain('audit("Meeting rescheduled"');
  });
});

describe('31-34. cancellation', () => {
  const cancelled = sched({ status: MEETING_STATUS.CANCELLED, cancelledAt: 'T', cancelledBy: 'Jane Smith', cancelledReason: 'appeal officer changed' });

  it('31/32. a cancelled meeting is neither resumable nor complete', () => {
    expect(isResumableMeeting(cancelled)).toBe(false);
    expect(isMeetingComplete(cancelled)).toBe(false);
    expect(isScheduledMeeting(cancelled)).toBe(false);
  });

  it('33. and never satisfies "a meeting was held"', () => {
    const cs = caseWith(cancelled);
    // the recipe's completion test is isMeetingComplete, which is false
    expect(cs.meetings.filter(isMeetingComplete)).toHaveLength(0);
    expect(scheduledMeetingsFor(cs)).toHaveLength(0);
  });

  it('cancellation preserves everything and deletes nothing', async () => {
    const save = okSave();
    await transitionMeeting({
      cases: [caseWith(sched({ chairUserId: OFFICER_A }))], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.CANCELLED,
      patch: { cancelledAt: 'T', cancelledBy: 'Jane Smith', cancelledReason: 'officer changed' }, saveCases: save,
    });
    const w = save.mock.calls[0][0][0].meetings;
    expect(w).toHaveLength(1);
    expect(w[0].id).toBe('s1');
    expect(w[0].schedule.date).toBe('2026-10-06');          // original schedule kept
    expect(w[0].chairUserId).toBe(OFFICER_A);               // original chair kept
    expect(w[0].cancelledBy).toBe('Jane Smith');
  });

  it('a completed meeting cannot be cancelled', async () => {
    const save = okSave();
    const r = await transitionMeeting({
      cases: [caseWith(sched({ status: MEETING_STATUS.COMPLETED, record: 'done' }))], caseId: 'case-a', meetingId: 's1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.CANCELLED, saveCases: save,
    });
    expect(r.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(save).not.toHaveBeenCalled();
  });

  it('34. a replacement meeting can be scheduled afterwards', () => {
    const plan = planMeetingWrite({ cases: [caseWith(cancelled)], caseId: 'case-a', meeting: sched({ id: 's2' }) });
    expect(plan.ok).toBe(true);
    expect(plan.nextCases[0].meetings).toHaveLength(2);
    expect(scheduledMeetingsFor(plan.nextCases[0]).map(m => m.id)).toEqual(['s2']);
  });
});

describe('38. multiple scheduled meetings are supported', () => {
  it('a case may have several, ordered soonest first', () => {
    const later = sched({ id: 'later', type: 'Disciplinary', schedule: { date: '2026-11-01', time: '09:00' }, date: '2026-11-01' });
    const sooner = sched({ id: 'sooner', schedule: { date: '2026-10-06', time: '10:00' }, date: '2026-10-06' });
    expect(scheduledMeetingsFor(caseWith(later, sooner)).map(m => m.id)).toEqual(['sooner', 'later']);
    expect(scheduledMeetingsFor(caseWith(sooner, later)).map(m => m.id)).toEqual(['sooner', 'later']);
  });

  it('same-day meetings order by time, and undated ones sort last', () => {
    const am = sched({ id: 'am', schedule: { date: '2026-10-06', time: '09:00' } });
    const pm = sched({ id: 'pm', schedule: { date: '2026-10-06', time: '15:00' } });
    const undated = sched({ id: 'undated', schedule: { date: null, time: null }, date: null });
    expect(scheduledMeetingsFor(caseWith(pm, undated, am)).map(m => m.id)).toEqual(['am', 'pm', 'undated']);
  });

  it('no one-scheduled-meeting-per-case rule is implied anywhere', () => {
    const src = readFileSync('src/lib/meetingLifecycle.js', 'utf8');
    const fn = src.slice(src.indexOf('export function scheduledMeetingsFor'), src.indexOf('// The live meeting on a case'));
    expect(fn).toContain('.filter(isScheduledMeeting)');
    expect(fn).not.toMatch(/\[0\]|find\(/);
  });

  it('scheduleInstant is tolerant of malformed logistics', () => {
    expect(Number.isNaN(scheduleInstant(null))).toBe(true);
    expect(Number.isNaN(scheduleInstant({}))).toBe(true);
    expect(Number.isNaN(scheduleInstant(sched({ schedule: { date: null }, date: null })))).toBe(true);
    // a malformed time is UNKNOWN, not midnight
    expect(Number.isNaN(scheduleInstant(sched({ schedule: { date: '2026-10-06', time: 'nonsense' } })))).toBe(true);
    expect(Number.isNaN(scheduleInstant(sched({ schedule: { date: '2026-10-06', time: null } })))).toBe(true);
    expect(Number.isNaN(scheduleInstant(sched({ schedule: { date: '2026-10-06', time: '10:00' } })))).toBe(false);
  });
});

describe('next-step engine — one shared rule, no recipe changes', () => {
  const investigationCase = (...meetings) => ({
    id: 'case-a', employeeName: 'Sam Patel', caseType: 'misconduct', stage: 'investigation', meetings,
  });

  it('stops recommending a meeting that is already scheduled', () => {
    const before = getNextStep(investigationCase(), {});
    expect(before.action).toBe('start_investigation');
    const after = getNextStep(investigationCase(sched()), {});
    expect(after.action).toBe('start_scheduled_meeting');
    expect(after.label).toBe('Start scheduled meeting');
    expect(after.scheduledMeetingId).toBe('s1');
    expect(after.reason).toContain('2026-10-06');
  });

  it('matches the scheduled meeting to the step by the same type matchers the recipes use', () => {
    // a scheduled DISCIPLINARY meeting must not satisfy an investigation step
    const mismatched = getNextStep(investigationCase(sched({ type: 'Disciplinary' })), {});
    expect(mismatched.action).toBe('start_investigation');
  });

  it('only rewrites hold-a-meeting steps, never anything else', () => {
    expect(withExistingMeeting(investigationCase(sched()), { action: 'outcome_letter', label: 'Draft outcome letter', meetingType: 'investigation' }).action).toBe('outcome_letter');
    expect(withExistingMeeting(investigationCase(sched()), null)).toBeNull();
  });

  it('a cancelled or completed meeting does not suppress the recommendation', () => {
    for (const status of [MEETING_STATUS.CANCELLED, MEETING_STATUS.COMPLETED]) {
      expect(getNextStep(investigationCase(sched({ status })), {}).action).not.toBe('start_scheduled_meeting');
    }
  });

  it('recipes themselves are untouched — the rule is applied once, afterwards', () => {
    expect(nextStepSrc).toContain('return withExistingMeeting(cs, baseNextStep(cs, ctx));');
    const recipes = nextStepSrc.slice(nextStepSrc.indexOf('function disciplinaryNextStep'));
    expect(recipes).not.toContain('scheduledMeetingsFor');
    expect(recipes).not.toContain('withExistingMeeting');
    expect(recipes).not.toContain('resumableMeetingFor');
  });

  it('a case with no scheduled meeting gets its exact prior answer', () => {
    const cs = investigationCase({ id: 'L', type: 'Investigation', record: 'held' });
    expect(getNextStep(cs, {})).toEqual(withExistingMeeting(cs, getNextStep(cs, {})));
  });
});

describe('25-30. appeal hearings', () => {
  it('25. scheduling stamps the appointed officer as chairUserId', () => {
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const syncMeetingToCalendar ='));
    expect(fn).toContain('chairUserId: appealManagerId || null,');
    expect(app).toContain('const appealManagerIdForCase = (caseId) =>');
    expect(app).toContain("caseAccess.find(a => a.caseId === caseId && a.role === \"appeal_manager\")?.userId || null;");
  });

  it('26. the database is the control — the client never decides', () => {
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const syncMeetingToCalendar ='));
    expect(fn).not.toMatch(/if\s*\([^)]*appealManagerId[^)]*\)\s*\{[^}]*return/);
    // and the trigger's verdicts are translated for the user
    expect(app).toContain('APPEAL_CHAIR_STALE_AT_START');
    expect(app).toContain('APPEAL_CHAIR_MISMATCH');
  });

  it('27/28/29. a stale scheduled hearing is readable, cancellable, and cannot be started', () => {
    const stale = sched({ type: 'Disciplinary Appeal', chairUserId: OFFICER_A });
    // still a normal scheduled meeting to every reader
    expect(isScheduledMeeting(stale)).toBe(true);
    expect(scheduledMeetingsFor(caseWith(stale))).toHaveLength(1);
    // the UI surfaces the mismatch before the user tries to start
    expect(caseView).toContain('const chairStale = isAppeal && !!m.chairUserId && !!currentAppealManagerAccess && m.chairUserId !== currentAppealManagerAccess.userId;');
    expect(caseView).toContain('Appeal officer changed — this hearing must be rearranged under the current officer. Cancel it and schedule a replacement.');
    expect(caseView).toContain('<button onClick={()=>onStartScheduledMeeting?.(cs, m)} disabled={chairStale}');
    expect(OFFICER_B).not.toBe(OFFICER_A);
  });

  it('the client-side warning is an affordance, not the control', () => {
    // Start still goes through the same transition, which the trigger guards.
    const fn = app.slice(app.indexOf('const startScheduledMeeting ='), app.indexOf('const prepareScheduledMeeting ='));
    expect(fn).not.toContain('chairStale');
    expect(fn).not.toMatch(/appeal_manager|caseAccess/);
  });

  it('nothing silently rewrites the chair', () => {
    const scheduleFn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const cancelScheduledMeeting ='));
    expect(scheduleFn).not.toMatch(/chairUserId:\s*appealManagerIdForCase/);
  });
});

describe('Schedule and Start are distinct intents', () => {
  it('the form offers both, and neither routes through the other', () => {
    expect(home).toContain('Schedule meeting');
    expect(home).toContain('await beginMeeting({');
    expect(home).toContain('await scheduleCaseMeeting?.({');
  });

  it('Schedule requires a date AND a time; Start requires neither', () => {
    expect(home).toContain('disabled={disabled||starting||!meetingSetup.date||!meetingSetup.time}');
    // Start and Prepare are untouched by the scheduling requirement
    expect(home).toContain('disabled={disabled||starting}');
    expect(home).toContain('onClick={()=>{ commit(); setScreen(SCREENS.PREP); }}');
  });

  it('Schedule returns to the case rather than entering the live screen', () => {
    const i = home.indexOf('await scheduleCaseMeeting?.({');
    expect(i).toBeGreaterThan(-1);
    const block = home.slice(i, i + 900);
    expect(block).toContain('if(r?.ok) setScreen(SCREENS.CASE_VIEW);');
    expect(block).not.toContain('SCREENS.RECORD');
  });
});

describe('timeline and display', () => {
  it('a scheduled meeting is never described as held', () => {
    const timeline = readFileSync('src/lib/caseTimeline.js', 'utf8');
    // the existing wording already keys on record presence, and a scheduled
    // meeting has none — so it reads "scheduled", not "held"
    expect(timeline).toContain('${m.type || "Meeting"} ${m.record ? "held" : "scheduled"}');
    expect(sched().record).toBeNull();
  });

  it('the Case View states it is not yet held, with its logistics', () => {
    expect(caseView).toContain('scheduled{when?` — ${when}`:""}');
    expect(caseView).toContain('Not yet held');
    expect(caseView).toContain('{m.calendar?.syncedAt&&<> · In your calendar</>}');
    expect(caseView).toContain('{m.invitation?.sentAt&&<> · Invitation sent</>}');
  });
});

describe('35/39/40. legacy compatibility', () => {
  it('35. letter artefacts are unaffected', () => {
    const letter = { id: 'l', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [] };
    expect(isScheduledMeeting(letter)).toBe(false);
    expect(scheduledMeetingsFor(caseWith(letter))).toHaveLength(0);
  });

  it('39. a legacy no-record meeting is not scheduled, not resumable, not complete', () => {
    const legacy = { id: 'L1', type: 'Investigation', record: '', savedAt: '2026-05-01T10:00:00.000Z' };
    expect(isScheduledMeeting(legacy)).toBe(false);
    expect(isResumableMeeting(legacy)).toBe(false);
    expect(isMeetingComplete(legacy)).toBe(false);
  });

  it('40. a legacy genuine meeting is untouched and still complete', () => {
    const legacy = { id: 'L2', type: 'Investigation', record: 'Full record.' };
    expect(isMeetingComplete(legacy)).toBe(true);
    expect(isScheduledMeeting(legacy)).toBe(false);
  });

  it('a legacy row can never be transitioned into the lifecycle', async () => {
    const save = okSave();
    const r = await transitionMeeting({
      cases: [caseWith({ id: 'L1', caseId: 'case-a', type: 'Investigation', record: 'old' })],
      caseId: 'case-a', meetingId: 'L1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save,
    });
    expect(r.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('audit events are user-meaningful and not duplicated', () => {
  it('scheduling, rescheduling and cancellation each have their own event', () => {
    expect(app).toContain('audit("Meeting scheduled"');
    expect(app).toContain('audit("Meeting rescheduled"');
    expect(app).toContain('audit("Meeting cancelled"');
    expect(app).toContain('audit("Calendar sync succeeded"');
    expect(app).toContain('audit("Calendar sync failed"');
  });

  it('no meeting content is duplicated into the audit detail', () => {
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const startScheduledMeeting ='));
    expect(fn).not.toMatch(/audit\([^)]*record/);
    expect(fn).not.toMatch(/audit\([^)]*transcript/);
  });
});


// ── Phase 2.3 HUMAN-UAT REMEDIATION ────────────────────────────────────────
//
// Human UAT found that Time and Meeting method / location were rendered only
// when meetingSetup.appealChairLocked was true — the APPEAL CHAIR SECURITY
// flag, set solely by CaseViewScreen's start_appeal_meeting handler. An
// Investigation could therefore never be given a time or a method, while
// Phase 2.3's Schedule action claimed to persist both. The coupling was
// accidental; only the visibility half is removed here.

describe('1-6. logistics controls render for every structured meeting type', () => {
  const timeBlock = home.slice(home.indexOf('htmlFor="meeting-time"') - 700, home.indexOf('htmlFor="meeting-location"') + 900);

  it('1/3/4. the Time control is no longer gated on appeal chair security', () => {
    // the block is rendered unconditionally — no appealChairLocked guard
    expect(home).not.toContain('{meetingSetup.appealChairLocked&&(\n            <div style={{display:"flex",gap:12');
    expect(timeBlock).toContain('<label htmlFor="meeting-time"');
    expect(timeBlock).not.toContain('appealChairLocked');
  });

  it('2. the Meeting method / location control renders too, relabelled', () => {
    expect(home).toContain('Meeting method / location');
    expect(home).toContain('placeholder="e.g. Microsoft Teams, Office, Phone"');
  });

  it('5/6. appeal chair locking and prefill are untouched', () => {
    // the chair field still locks for a structured appeal hearing
    expect(home).toContain('{meetingSetup.appealChairLocked ? (');
    expect(home).toContain('This is the appointed appeal officer.');
    // and the appeal route still prefills time/method from the invitation
    expect(caseView).toContain('const scheduled = isStructuredAppealHearing ? appealInvitationLogistics(cs) : null;');
    expect(caseView).toContain('time:scheduled?.time||"",');
    expect(caseView).toContain('locationOrMethod:scheduled?.locationOrMethod||"",');
  });

  it('the appeal chair security flag is still only ever set in one place', () => {
    expect(caseView).toContain('appealChairLocked:isStructuredAppealHearing,');
  });
});

describe('7-10. validation belongs to Schedule alone', () => {
  it('7/8. Schedule is refused without a time, at the primitive as well as the form', () => {
    expect(app).toContain('if(!time) { showToast("Enter the time the meeting is arranged for", "error"); return { ok: false, reason: \'invalid_schedule\' }; }');
    const fn = app.slice(app.indexOf('const scheduleCaseMeeting ='), app.indexOf('const syncMeetingToCalendar ='));
    // every guard returns BEFORE the write, so nothing persists, navigates or syncs
    const firstGuard = fn.indexOf("reason: 'invalid_schedule'");
    expect(firstGuard).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(fn.indexOf('await persistMeeting('));
  });

  it('a meeting type is required too', () => {
    expect(app).toContain('if(!type) { showToast("Choose the meeting type", "error"); return { ok: false, reason: \'invalid_schedule\' }; }');
  });

  it('9/10. Prepare and Start never require a time', () => {
    const prepBtn = home.slice(home.indexOf('onClick={()=>{ commit(); setScreen(SCREENS.PREP); }}') - 200, home.indexOf('Prepare meeting'));
    expect(prepBtn).not.toContain('meetingSetup.time');
    const startBtn = home.slice(home.indexOf('await beginMeeting({') - 900, home.indexOf('Start meeting'));
    expect(startBtn).not.toContain('!meetingSetup.time');
    // and beginMeeting itself has no time concept at all.
    //
    // Asserted as "reads no schedule data and validates no time" rather than as
    // a ban on the substring: since the Phase 2.3 continuity fix beginMeeting
    // DELEGATES to startScheduledMeeting for an already-persisted meeting, so
    // the word appears as an identifier. Comments are stripped for the same
    // reason they are elsewhere — prose names what the code must not do.
    const beginRaw = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('  // ── Release 1 Phase 2.3 — truthful scheduling'));
    const begin = beginRaw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(begin).not.toContain('.schedule');        // never reads the plan
    expect(begin).not.toContain('schedule?.');
    expect(begin).not.toContain('!time');            // never requires a time
    expect(begin).not.toContain('meetingSetup.time');
    expect(begin).not.toContain('Enter the time');
  });
});

describe('11-15. the persisted shape carries one logistics value', () => {
  it('11/12/13. date, time and method are persisted as supplied', () => {
    const m = sched({ schedule: { date: '2026-10-06', time: '10:00', method: 'Microsoft Teams' } });
    const plan = planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: m });
    const w = plan.nextCases[0].meetings[0];
    expect(w.schedule.date).toBe('2026-10-06');
    expect(w.schedule.time).toBe('10:00');
    expect(w.schedule.method).toBe('Microsoft Teams');
  });

  it('14. a new meeting never duplicates method into schedule.location', () => {
    expect(app).toContain('schedule: { date, time, method: method || null },');
    expect(app).not.toMatch(/location:\s*location\s*\|\|\s*null/);
    expect(app).not.toMatch(/location:\s*meetingSetup\.locationOrMethod/);
    expect(home).not.toMatch(/location:\s*meetingSetup\.locationOrMethod/);
    // and reschedule spreads rather than rewriting, so it cannot introduce one
    expect(app).toContain('patch: { schedule: { ...(meeting.schedule||{}), date, time, method: method || null }, date },');
  });

  it('15. reading a legacy object that already has schedule.location still works', () => {
    const legacyShaped = sched({ schedule: { date: '2026-10-06', time: '10:00', method: null, location: 'Room 2' } });
    // the Case View falls back to location when method is absent
    expect(caseView).toContain('const where = m.schedule?.location||m.schedule?.method||"";');
    // and Prepare seeds the form from either
    expect(app).toContain('locationOrMethod: meeting.schedule?.location || meeting.schedule?.method || "",');
    expect(legacyShaped.schedule.location).toBe('Room 2');
    expect(isScheduledMeeting(legacyShaped)).toBe(true);
  });
});

describe('16-18. ordering never invents a time', () => {
  it('16. a valid date and time gives a real sortable instant', () => {
    const at = scheduleInstant(sched({ schedule: { date: '2026-10-06', time: '10:00' } }));
    expect(Number.isNaN(at)).toBe(false);
    expect(at).toBe(Date.parse('2026-10-06T10:00:00'));
  });

  it('17. a missing or malformed time is unsortable, not midnight', () => {
    for (const time of [null, undefined, '', '   ', 'nonsense', '1000', '25:00:00']) {
      expect(Number.isNaN(scheduleInstant(sched({ schedule: { date: '2026-10-06', time } })))).toBe(true);
    }
    // and specifically NOT equal to midnight
    expect(scheduleInstant(sched({ schedule: { date: '2026-10-06', time: null } }))).not.toBe(Date.parse('2026-10-06T00:00:00'));
  });

  it('18. timeless scheduled meetings sort last, never first', () => {
    const timeless = sched({ id: 'timeless', schedule: { date: '2026-10-06', time: null } });
    const timed = sched({ id: 'timed', schedule: { date: '2026-10-06', time: '09:00' } });
    const later = sched({ id: 'later', schedule: { date: '2026-11-01', time: '09:00' } });
    expect(scheduledMeetingsFor(caseWith(timeless, timed, later)).map(m => m.id)).toEqual(['timed', 'later', 'timeless']);
    expect(scheduledMeetingsFor(caseWith(timed, timeless)).map(m => m.id)).toEqual(['timed', 'timeless']);
  });
});

describe('19-22. display and calendar are unchanged in substance', () => {
  it('19. the banner shows date and time together', () => {
    expect(caseView).toContain('const when = [m.schedule?.date&&fmtDate(m.schedule.date), m.schedule?.time].filter(Boolean).join(" at ");');
  });

  it('20. method/location is shown once, from a single value', () => {
    expect((caseView.match(/const where = /g) || []).length).toBe(1);
    expect(caseView).toContain('{where&&<>{where} · </>}');
  });

  it('21. the calendar path still refuses a missing time before any write', () => {
    const lib = readFileSync('src/lib/meetingScheduling.js', 'utf8');
    expect(lib).toContain('if (!date || !startTime) return null;');
    expect(app).toContain('if(!times) { showToast("Enter a valid date and time", "error"); return false; }');
    const calFn = app.slice(app.indexOf('const scheduleMeeting = async ({ caseId, meetingType'), app.indexOf('const appealManagerIdForCase'));
    expect(calFn.indexOf('if(!times)')).toBeLessThan(calFn.indexOf('scheduleCaseMeeting('));
  });

  it('22. scheduling from the case route implies no calendar event', () => {
    const block = home.slice(home.indexOf('await scheduleCaseMeeting?.({'), home.indexOf('await scheduleCaseMeeting?.({') + 900);
    expect(block).not.toContain('calendarRequest');
    // and with no calendarRequest the toast makes no calendar claim
    expect(app).toContain('showToast("Meeting scheduled");');
  });
});

describe('invitation drafting receives the logistics it can now be given', () => {
  it('the Draft invitation button carries time and method, not just the date', () => {
    const block = home.slice(home.indexOf('setPendingLetterType("invite")') - 1400, home.indexOf('setPendingLetterType("invite")'));
    expect(block).toContain('date:meetingSetup.date,');
    expect(block).toContain('time:meetingSetup.time||p.time||""');
    expect(block).toContain('locationOrMethod:meetingSetup.locationOrMethod||p.locationOrMethod||""');
  });

  it('and commit() still carries them into caseInfo for the save path', () => {
    expect(home).toContain('time:meetingSetup.time||"",locationOrMethod:meetingSetup.locationOrMethod||"",');
  });
});
