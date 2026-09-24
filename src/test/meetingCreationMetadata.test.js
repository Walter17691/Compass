import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, isMeetingComplete, isResumableMeeting, isScheduledMeeting,
} from '../lib/meetingLifecycle.js';
import {
  planMeetingWrite, persistMeeting, transitionMeeting, stampNewMeeting, WRITE_FAILURE,
} from '../lib/meetingWrites.js';

// Creation metadata immutability. Production human UAT, 2026-09-24.
//
// meeting_cad06fdb-24d5-4066-adad-e46aac10483c was created when scheduled at
// 2026-09-24T20:11:55.819Z. After "Save and go to case" it read
// 2026-09-24T20:50:23.987Z — exactly its savedAt — and createdBy had been
// re-stamped. The scheduling moment was destroyed, and with it the deliberate
// createdAt (first persisted) vs startedAt (meeting began) distinction that
// scheduling exists to make meaningful.
//
// Cause: saveMeetingToCaseImpl applies stampNewMeeting unconditionally, then
// planMeetingWrite's patch spread let the fresh values win.
//
// WHY THE EARLIER TEST MISSED IT. meetingStartResume.test.js asserted
// `out.createdAt === started.createdAt`, but hand-built its input as
// `{ ...started, record, status }` — an object that ALREADY carried the correct
// createdAt. It exercised planMeetingWrite alone, never the production
// composition stampNewMeeting -> persistMeeting -> planMeetingWrite. Every test
// below drives that composition, so each would fail against the old code.

const app = readFileSync('src/App.jsx', 'utf8');
const lib = readFileSync('src/lib/meetingWrites.js', 'utf8');
// Comments legitimately name the things the code must not do, so prohibitions
// are asserted against executable lines only.
const libCode = lib.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const T1 = '2026-09-24T20:11:55.819Z';   // scheduled  — creation
const T2 = '2026-09-24T20:15:11.833Z';   // started
const T3 = '2026-09-24T20:50:23.987Z';   // saved
const USER_A = 'UAT - HR Manager';
const USER_B = 'Someone Else';

const CASE_ID = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';
const MEETING_ID = 'meeting_cad06fdb-24d5-4066-adad-e46aac10483c';
const emptyCase = () => [{ id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings: [] }];

// The production save path, faithfully: build a fresh meeting object, stamp it
// with the CURRENT time and CURRENT user exactly as App.jsx:7606 does, then
// persist. This is the step the earlier test skipped.
const saveLikeProduction = async ({ cases, caseId, meetingId, now, by, fields = {}, saveCases }) => {
  const meeting = { id: meetingId, type: 'Investigation', ...fields };
  const stamped = stampNewMeeting(meeting, { caseId, now, by });
  return persistMeeting({ cases, caseId, meeting: stamped, saveCases });
};

// A saveCases that behaves like the real one: applies the write and reports ok.
const liveStore = initial => {
  const state = { cases: initial };
  const saveCases = vi.fn(async (next) => { state.cases = next; return { ok: true }; });
  return { state, saveCases, meeting: () => state.cases.find(c => c.id === CASE_ID).meetings.find(m => m.id === MEETING_ID) };
};

describe('COMPOSITION — the real production path, T1 → T2 → T3', () => {
  it('createdAt and createdBy survive a later save by a different user', async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());

    // 1/2. schedule + persist at T1 by User A
    const scheduled = stampNewMeeting({
      id: MEETING_ID, type: 'Investigation', status: MEETING_STATUS.SCHEDULED,
      schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams' },
      startedAt: null, endedAt: null, record: null, transcript: [],
    }, { caseId: CASE_ID, now: T1, by: USER_A });
    expect((await persistMeeting({ cases: state.cases, caseId: CASE_ID, meeting: scheduled, saveCases })).mode).toBe('create');
    expect(meeting().createdAt).toBe(T1);
    expect(meeting().createdBy).toBe(USER_A);

    // 3. start at T2
    expect((await transitionMeeting({
      cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: T2 }, saveCases,
    })).ok).toBe(true);
    expect(meeting().createdAt).toBe(T1);
    expect(meeting().startedAt).toBe(T2);

    // 4. save at T3 by User B, through the real stamping path
    const saved = await saveLikeProduction({
      cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID, now: T3, by: USER_B,
      fields: {
        status: MEETING_STATUS.COMPLETED, record: 'Full record.', summary: 'Summary.',
        startedAt: T2, endedAt: '2026-09-24T20:44:29.384Z',
        savedAt: T3, savedBy: USER_B,
      },
      saveCases,
    });
    expect(saved.mode).toBe('patch');

    // 5. the invariant
    const m = meeting();
    expect(m.createdAt).toBe(T1);          // NOT T3 — this is the defect
    expect(m.createdBy).toBe(USER_A);      // NOT User B
    expect(m.startedAt).toBe(T2);
    expect(m.savedAt).toBe(T3);            // later-write metadata may move
    expect(m.savedBy).toBe(USER_B);
    expect(m.endedAt).toBe('2026-09-24T20:44:29.384Z');
    expect(m.status).toBe(MEETING_STATUS.COMPLETED);
  });

  it('and the case still holds exactly one meeting', async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());
    const scheduled = stampNewMeeting({ id: MEETING_ID, type: 'Investigation', status: MEETING_STATUS.SCHEDULED },
      { caseId: CASE_ID, now: T1, by: USER_A });
    await persistMeeting({ cases: state.cases, caseId: CASE_ID, meeting: scheduled, saveCases });
    await saveLikeProduction({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID, now: T3, by: USER_B,
      fields: { status: MEETING_STATUS.COMPLETED, record: 'r' }, saveCases });
    expect(state.cases[0].meetings).toHaveLength(1);
    expect(meeting().id).toBe(MEETING_ID);
  });

  it('the same holds for Start-now → completed (no scheduled step)', async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());
    const started = stampNewMeeting({ id: MEETING_ID, type: 'Investigation', status: MEETING_STATUS.IN_PROGRESS, startedAt: T2 },
      { caseId: CASE_ID, now: T2, by: USER_A });
    await persistMeeting({ cases: state.cases, caseId: CASE_ID, meeting: started, saveCases });
    expect(meeting().createdAt).toBe(T2);
    await saveLikeProduction({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID, now: T3, by: USER_B,
      fields: { status: MEETING_STATUS.COMPLETED, record: 'r', startedAt: T2, savedAt: T3, savedBy: USER_B }, saveCases });
    const m = meeting();
    expect(m.createdAt).toBe(T2);          // creation, not save
    expect(m.createdBy).toBe(USER_A);
    expect(m.startedAt).toBe(T2);
    expect(m.savedAt).toBe(T3);
    expect(state.cases[0].meetings).toHaveLength(1);
  });

  it('repeated saves never move creation metadata', async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());
    await persistMeeting({ cases: state.cases, caseId: CASE_ID,
      meeting: stampNewMeeting({ id: MEETING_ID, type: 'Investigation' }, { caseId: CASE_ID, now: T1, by: USER_A }), saveCases });
    for (const [n, who] of [['2026-09-25T09:00:00.000Z', 'X'], ['2026-09-26T09:00:00.000Z', 'Y'], ['2026-09-27T09:00:00.000Z', 'Z']]) {
      await saveLikeProduction({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID, now: n, by: who,
        fields: { record: 'r' + n }, saveCases });
      expect(meeting().createdAt).toBe(T1);
      expect(meeting().createdBy).toBe(USER_A);
    }
  });
});

describe('PATCH DEFENCE — an incoming patch cannot set creation metadata', () => {
  const stored = () => [{ id: CASE_ID, meetings: [{
    id: MEETING_ID, caseId: CASE_ID, type: 'Investigation', createdAt: T1, createdBy: USER_A,
  }] }];

  it('createdAt alone is rejected', () => {
    const out = planMeetingWrite({ cases: stored(), caseId: CASE_ID, meeting: { id: MEETING_ID, createdAt: '2999-01-01T00:00:00.000Z' } })
      .nextCases[0].meetings[0];
    expect(out.createdAt).toBe(T1);
    expect(out.createdBy).toBe(USER_A);
  });

  it('createdBy alone is rejected', () => {
    const out = planMeetingWrite({ cases: stored(), caseId: CASE_ID, meeting: { id: MEETING_ID, createdBy: 'Different User' } })
      .nextCases[0].meetings[0];
    expect(out.createdBy).toBe(USER_A);
    expect(out.createdAt).toBe(T1);
  });

  it('both together are rejected, and other fields still apply', () => {
    const out = planMeetingWrite({ cases: stored(), caseId: CASE_ID, meeting: {
      id: MEETING_ID, createdAt: '2999-01-01T00:00:00.000Z', createdBy: 'Different User',
      record: 'legitimately updated', status: MEETING_STATUS.COMPLETED,
    } }).nextCases[0].meetings[0];
    expect(out.createdAt).toBe(T1);
    expect(out.createdBy).toBe(USER_A);
    expect(out.record).toBe('legitimately updated');
    expect(out.status).toBe(MEETING_STATUS.COMPLETED);
  });

  it('a transition patch cannot set them either', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    await transitionMeeting({
      cases: [{ id: CASE_ID, meetings: [{ id: MEETING_ID, caseId: CASE_ID, status: MEETING_STATUS.SCHEDULED, createdAt: T1, createdBy: USER_A }] }],
      caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: T2, createdAt: '2999-01-01T00:00:00.000Z', createdBy: 'Different User' }, saveCases: save,
    });
    const w = save.mock.calls[0][0][0].meetings[0];
    expect(w.createdAt).toBe(T1);
    expect(w.createdBy).toBe(USER_A);
    expect(w.startedAt).toBe(T2);
  });

  it('null and undefined cannot erase them', () => {
    for (const v of [null, undefined, '']) {
      const out = planMeetingWrite({ cases: stored(), caseId: CASE_ID, meeting: { id: MEETING_ID, createdAt: v, createdBy: v } })
        .nextCases[0].meetings[0];
      expect(out.createdAt).toBe(T1);
      expect(out.createdBy).toBe(USER_A);
    }
  });

  it('the input objects are never mutated', () => {
    const cases = stored();
    const snapshot = JSON.parse(JSON.stringify(cases));
    planMeetingWrite({ cases, caseId: CASE_ID, meeting: { id: MEETING_ID, createdAt: 'X', createdBy: 'Y' } });
    expect(cases).toEqual(snapshot);
  });
});

describe('LEGACY — a patch never invents creation metadata', () => {
  // All 884 pre-lifecycle production rows carry neither field.
  const legacy = () => [{ id: CASE_ID, meetings: [{ id: 'legacy-1', type: 'Investigation', record: 'old notes' }] }];

  it('a legacy row stays without createdAt/createdBy after an unrelated patch', () => {
    const out = planMeetingWrite({ cases: legacy(), caseId: CASE_ID, meeting: { id: 'legacy-1', signStatus: 'signed' } })
      .nextCases[0].meetings[0];
    expect('createdAt' in out).toBe(false);
    expect('createdBy' in out).toBe(false);
    expect(out.signStatus).toBe('signed');
    expect(out.record).toBe('old notes');
  });

  it('even when the patch supplies them — history is not fabricated', () => {
    const out = planMeetingWrite({ cases: legacy(), caseId: CASE_ID, meeting: { id: 'legacy-1', createdAt: T3, createdBy: USER_B } })
      .nextCases[0].meetings[0];
    expect('createdAt' in out).toBe(false);
    expect('createdBy' in out).toBe(false);
  });

  it('and a save through the real stamping path cannot backfill one either', async () => {
    const { state, saveCases } = liveStore(legacy());
    await saveLikeProduction({ cases: state.cases, caseId: CASE_ID, meetingId: 'legacy-1', now: T3, by: USER_B,
      fields: { record: 'amended' }, saveCases });
    const m = state.cases[0].meetings[0];
    expect('createdAt' in m).toBe(false);
    expect('createdBy' in m).toBe(false);
    expect(m.record).toBe('amended');
  });
});

describe('CREATE semantics — unchanged', () => {
  it('a new meeting still gets id, caseId, createdAt and createdBy', () => {
    const stamped = stampNewMeeting({ id: 'fresh', type: 'Investigation' }, { caseId: CASE_ID, now: T1, by: USER_A });
    const out = planMeetingWrite({ cases: emptyCase(), caseId: CASE_ID, meeting: stamped }).nextCases[0].meetings[0];
    expect(out.id).toBe('fresh');
    expect(out.caseId).toBe(CASE_ID);
    expect(out.createdAt).toBe(T1);
    expect(out.createdBy).toBe(USER_A);
  });

  it('Phase 2.1 parentage is untouched', async () => {
    const save = vi.fn();
    expect((await persistMeeting({ cases: emptyCase(), caseId: null, meeting: { id: 'x' }, saveCases: save })).reason)
      .toBe(WRITE_FAILURE.PARENT_REQUIRED);
    expect((await persistMeeting({ cases: emptyCase(), caseId: 'gone', meeting: { id: 'x' }, saveCases: save })).reason)
      .toBe(WRITE_FAILURE.NOT_FOUND);
    expect(planMeetingWrite({ cases: [{ id: CASE_ID, meetings: [{ id: 'm', caseId: 'other' }] }], caseId: CASE_ID, meeting: { id: 'm' } }).reason)
      .toBe(WRITE_FAILURE.PARENTAGE_MISMATCH);
    expect(save).not.toHaveBeenCalled();
    expect(libCode).not.toContain('employeeName');
  });

  it('the single-case write path is still the only one used', () => {
    expect(lib).toContain('await saveCases(plan.nextCases, caseId)');
    expect((libCode.match(/saveCases\(/g) || []).length).toBe(1);
  });
});

describe('LIFECYCLE — creation metadata holds across every transition', () => {
  const run = async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());
    await persistMeeting({ cases: state.cases, caseId: CASE_ID, meeting: stampNewMeeting({
      id: MEETING_ID, type: 'Investigation', status: MEETING_STATUS.SCHEDULED,
      schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams' },
    }, { caseId: CASE_ID, now: T1, by: USER_A }), saveCases });
    const seen = [];
    const snap = label => seen.push({ label, createdAt: meeting().createdAt, createdBy: meeting().createdBy });
    snap('scheduled');
    await transitionMeeting({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { calendar: { provider: 'google', eventId: 'e', syncedAt: T1 } }, saveCases });
    snap('calendar synced');
    await transitionMeeting({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { schedule: { date: '2026-10-08', time: '11:00', method: 'Office' }, date: '2026-10-08' }, saveCases });
    snap('rescheduled');
    await transitionMeeting({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: T2 }, saveCases });
    snap('started');
    await saveLikeProduction({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID, now: T3, by: USER_B,
      fields: { status: MEETING_STATUS.COMPLETED, record: 'r', startedAt: T2, endedAt: '2026-09-24T20:44:29.384Z', savedAt: T3, savedBy: USER_B }, saveCases });
    snap('completed');
    return { seen, meeting, state };
  };

  it('every stage reports the original creation metadata', async () => {
    const { seen } = await run();
    expect(seen.map(s => s.label)).toEqual(['scheduled', 'calendar synced', 'rescheduled', 'started', 'completed']);
    for (const s of seen) {
      expect(s.createdAt).toBe(T1);
      expect(s.createdBy).toBe(USER_A);
    }
  });

  it('while the lifecycle itself advances correctly', async () => {
    const { meeting, state } = await run();
    const m = meeting();
    expect(m.status).toBe(MEETING_STATUS.COMPLETED);
    expect(m.startedAt).toBe(T2);                       // immutable after Start
    expect(m.endedAt).toBe('2026-09-24T20:44:29.384Z');
    expect(m.schedule).toEqual({ date: '2026-10-08', time: '11:00', method: 'Office' });
    expect(m.calendar.eventId).toBe('e');
    expect(isMeetingComplete(m)).toBe(true);
    expect(isResumableMeeting(m)).toBe(false);
    expect(isScheduledMeeting(m)).toBe(false);
    expect(state.cases[0].meetings).toHaveLength(1);    // no duplicate anywhere
  });

  it('a cancelled meeting keeps its creation metadata too', async () => {
    const { state, saveCases, meeting } = liveStore(emptyCase());
    await persistMeeting({ cases: state.cases, caseId: CASE_ID, meeting: stampNewMeeting(
      { id: MEETING_ID, type: 'Investigation', status: MEETING_STATUS.SCHEDULED }, { caseId: CASE_ID, now: T1, by: USER_A }), saveCases });
    await transitionMeeting({ cases: state.cases, caseId: CASE_ID, meetingId: MEETING_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.CANCELLED,
      patch: { cancelledAt: T3, cancelledBy: USER_B, cancelledReason: 'officer changed' }, saveCases });
    const m = meeting();
    expect(m.createdAt).toBe(T1);
    expect(m.createdBy).toBe(USER_A);
    expect(m.cancelledBy).toBe(USER_B);
  });
});

describe('the invariant is enforced centrally, not per caller', () => {
  it('planMeetingWrite owns the rule, so every write path inherits it', () => {
    expect(lib).toContain('const IMMUTABLE_ON_PATCH = ["createdAt", "createdBy"];');
    expect(lib).toContain('function patchMeeting(stored, incoming, caseId) {');
    expect(lib).toContain('if (key in stored) next[key] = stored[key];');
    expect(lib).toContain('else delete next[key];');
    // the patch branch goes through it
    expect(lib).toContain('? meetings.map((m, i) => (i === index ? patchMeeting(m, meeting, caseId) : m))');
  });

  it('the save path may keep stamping — on a patch the stamp cannot land', () => {
    // deliberately unchanged: the caller cannot know whether the write is a
    // create or a patch until planMeetingWrite decides
    expect(app).toContain('const stampedMeeting = stampNewMeeting(meeting, { caseId, by: currentUser?.name || "HR Manager" });');
  });

  it('no transitionMeeting caller in the app passes creation metadata', () => {
    const patches = app.match(/patch: \{[^}]*\}/g) || [];
    expect(patches.length).toBeGreaterThan(3);
    for (const p of patches) {
      expect(p).not.toContain('createdAt');
      expect(p).not.toContain('createdBy');
    }
  });

  it('nothing in the app reads meeting-level creation metadata for logic', () => {
    // so no behaviour depended on the broken values
    expect(app).not.toMatch(/meeting\.createdAt|m\.createdAt\s*[<>=]/);
  });
});
