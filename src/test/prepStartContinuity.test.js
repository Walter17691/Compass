import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, declaredStatus, isScheduledMeeting, scheduledMeetingsFor,
  resumableMeetingFor, isMeetingComplete, isGenuineMeeting,
} from '../lib/meetingLifecycle.js';
import {
  WRITE_FAILURE, START_DECISION, planIdentifiedStart,
  transitionMeeting, persistMeeting, stampNewMeeting,
} from '../lib/meetingWrites.js';

// ─────────────────────────────────────────────────────────────────────────
// Release 1 Phase 2.3 — Prepare → Start must preserve scheduled identity.
//
// Proven in production by human UAT on 2026-09-25, case
// e2d474da-4b90-47a7-8e82-cfcaf17d92ef:
//
//   08:17:02  Schedule  -> meeting_6a8bdb7c  status scheduled, 2026-10-02 10:00
//   08:51:16  Prepare   -> no write at all; caseInfo.meetingId = meeting_6a8bdb7c
//   08:53:41  Start     -> meeting_352722cc  status in_progress, schedule NULL
//
// One hearing became two objects. The scheduled one was stranded (startedAt
// still null, still offering "Start scheduled meeting"), and the live one lost
// the planned time and method entirely.
//
// Root cause: PrepScreen called beginMeeting() with no arguments, and
// beginMeeting minted newId("meeting") unconditionally — it never consulted the
// authoritative id that prepareScheduledMeeting had already put in
// caseInfo.meetingId.
//
// The harness below models beginMeeting's real decision over a real cases array
// using the real primitives. honourIdentified:false reproduces the DEPLOYED
// behaviour and is asserted to produce the duplicate; true is the fix.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const prep = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
const home = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
const writes = readFileSync('src/lib/meetingWrites.js', 'utf8');

const stripComments = src => src
  .split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');

const appCode = stripComments(app);
const prepCode = stripComments(prep);
const homeCode = stripComments(home);
const writesCode = stripComments(writes);

const CASE_ID = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';
const INV_ID = 'meeting_cad06fdb-24d5-4066-adad-e46aac10483c';
const SCHED_ID = 'meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f';
const START_INSTANT = '2026-09-25T08:53:41.718Z';

const clone = v => JSON.parse(JSON.stringify(v));

// The completed Investigation, exactly as production holds it.
const completedInvestigation = (over = {}) => ({
  id: INV_ID, caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
  schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-09-24', createdAt: '2026-09-24T20:50:23.987Z', createdBy: 'UAT - HR Manager',
  startedAt: '2026-09-24T20:15:11.833Z', endedAt: '2026-09-24T20:44:29.384Z',
  record: '## Meeting Details\nType: Investigation Meeting\n', transcript: [1, 2, 3, 4],
  invitation: null, calendar: null, ...over,
});

// The scheduled Disciplinary as it stood BEFORE Start — the real 17-key object.
const scheduledDisciplinary = (over = {}) => ({
  id: SCHED_ID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.SCHEDULED,
  schedule: { date: '2026-10-02', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-02', createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: null, endedAt: null, chairUserId: null, record: '', transcript: [],
  participants: [], manager: 'Jane Smith', invitation: null, calendar: null, ...over,
});

const caseWith = (...meetings) => ({ id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings });

// Models beginMeeting: the identified branch, then the Phase 2.2 cold branch.
const makeHarness = (initialCases, { honourIdentified = true } = {}) => {
  let db = clone(initialCases);
  let minted = 0;
  const saveCalls = [];

  const saveCases = vi.fn(async (next, changedId) => {
    // Write safety: single-case write path, changedId always supplied.
    saveCalls.push(changedId);
    db = clone(next);
    return { ok: true };
  });

  const beginMeeting = async ({ caseId, meetingId, type = 'Disciplinary', date = '2026-10-02',
                               startedAt = START_INSTANT } = {}) => {
    if (!caseId) return { ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED };

    const identified = meetingId || null;
    if (identified && honourIdentified) {
      const plan = planIdentifiedStart({ cases: db, caseId, meetingId: identified });
      if (plan.decision === START_DECISION.TRANSITION) {
        const r = await transitionMeeting({
          cases: db, caseId, meetingId: identified,
          allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
          patch: { startedAt }, saveCases,
        });
        return r?.ok ? { ok: true, meetingId: identified, mode: 'transition' }
                     : { ok: false, reason: r?.reason };
      }
      if (plan.decision === START_DECISION.RESUME) {
        return { ok: true, meetingId: identified, mode: 'resume' };
      }
      return { ok: false, reason: plan.reason };
    }

    const fresh = stampNewMeeting({
      id: `meeting_minted_${++minted}`, type, date,
      status: MEETING_STATUS.IN_PROGRESS, startedAt, endedAt: null,
      transcript: [], record: null,
    }, { caseId, now: startedAt, by: 'UAT - HR Manager' });
    const r = await persistMeeting({ cases: db, caseId, meeting: fresh, saveCases });
    return r?.ok ? { ok: true, meetingId: fresh.id, mode: r.mode }
                 : { ok: false, reason: r?.reason };
  };

  return {
    beginMeeting, saveCases, saveCalls,
    cases: () => db,
    theCase: () => db.find(c => c.id === CASE_ID),
    meetings: () => db.find(c => c.id === CASE_ID).meetings,
    meeting: id => db.find(c => c.id === CASE_ID).meetings.find(m => m.id === id),
  };
};

const startedCase = () => [caseWith(completedInvestigation(), scheduledDisciplinary())];

describe('0. the deployed behaviour is reproduced, then fixed', () => {
  it('0.1 OLD behaviour: ignoring the identified id forks the lifecycle', async () => {
    const h = makeHarness(startedCase(), { honourIdentified: false });
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });

    expect(res.ok).toBe(true);
    expect(res.mode).toBe('create');                 // appended, not patched
    expect(res.meetingId).not.toBe(SCHED_ID);        // a brand-new id
    expect(h.meetings()).toHaveLength(3);            // the duplicate
    // and the scheduled meeting is stranded, exactly as production shows
    expect(h.meeting(SCHED_ID).status).toBe(MEETING_STATUS.SCHEDULED);
    expect(h.meeting(SCHED_ID).startedAt).toBeNull();
    // the live object lost the plan
    expect(h.meeting(res.meetingId).schedule).toBeUndefined();
    // and Case View would offer to start the stranded one while one is live
    expect(scheduledMeetingsFor(h.theCase())).toHaveLength(1);
    expect(resumableMeetingFor(h.theCase()).meeting.id).toBe(res.meetingId);
  });

  it('0.2 NEW behaviour: the same id transitions, nothing is appended', async () => {
    const h = makeHarness(startedCase());
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });

    expect(res.ok).toBe(true);
    expect(res.mode).toBe('transition');
    expect(res.meetingId).toBe(SCHED_ID);            // C — no new id
    expect(h.meetings()).toHaveLength(2);            // E — count unchanged
    expect(h.meeting(SCHED_ID).status).toBe(MEETING_STATUS.IN_PROGRESS);  // D/I
  });
});

describe('1. A–L the continuity contract', () => {
  it('A. the scheduled meeting exists and is selected as scheduled', () => {
    const cs = caseWith(completedInvestigation(), scheduledDisciplinary());
    expect(isScheduledMeeting(scheduledDisciplinary())).toBe(true);
    expect(scheduledMeetingsFor(cs).map(m => m.id)).toEqual([SCHED_ID]);
  });

  it('B. Prepare hands Start that exact id', () => {
    // prepareScheduledMeeting writes meetingId, PrepScreen passes it back.
    const j = appCode.indexOf('const prepareScheduledMeeting');
    expect(appCode.slice(j, j + 900)).toContain('meetingId: meeting.id');
    expect(prepCode).toContain('beginMeeting({ meetingId: caseInfo.meetingId || null })');
  });

  it('C/D/E/I. one id, transitioned in place, count unchanged', async () => {
    const h = makeHarness(startedCase());
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(res.meetingId).toBe(SCHED_ID);
    expect(h.meetings().map(m => m.id)).toEqual([INV_ID, SCHED_ID]);
    expect(declaredStatus(h.meeting(SCHED_ID))).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('F/G. the planned schedule survives the start', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const m = h.meeting(SCHED_ID);
    expect(m.schedule).toEqual({ date: '2026-10-02', time: '10:00', method: 'Microsoft Teams' });
    expect(m.date).toBe('2026-10-02');
  });

  it('H. startedAt is added as an independent fact', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const m = h.meeting(SCHED_ID);
    expect(m.startedAt).toBe(START_INSTANT);
    // starting EARLY must not rewrite the plan: different dates coexist
    expect(m.startedAt.slice(0, 10)).toBe('2026-09-25');
    expect(m.schedule.date).toBe('2026-10-02');
    expect(m.endedAt).toBeNull();
  });

  it('J/K/L. parentage and creation metadata are untouched', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const m = h.meeting(SCHED_ID);
    expect(m.caseId).toBe(CASE_ID);
    expect(m.createdAt).toBe('2026-09-25T08:17:02.782Z');
    expect(m.createdBy).toBe('UAT - HR Manager');
    expect(m.invitation).toBeNull();
    expect(m.calendar).toBeNull();
  });

  it('the completed Investigation is byte-identical afterwards', async () => {
    const before = completedInvestigation();
    const h = makeHarness([caseWith(before, scheduledDisciplinary())]);
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(h.meeting(INV_ID)).toEqual(before);
  });
});

describe('2. M cold Start Now is preserved (Phase 2.2)', () => {
  it('M.1 no identified id still creates exactly one in_progress meeting', async () => {
    const h = makeHarness([caseWith(completedInvestigation())]);
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: null });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('create');
    expect(h.meetings()).toHaveLength(2);
    expect(h.meeting(res.meetingId).status).toBe(MEETING_STATUS.IN_PROGRESS);
    expect(h.meeting(res.meetingId).startedAt).toBe(START_INSTANT);
    expect(h.meeting(res.meetingId).createdAt).toBe(START_INSTANT);
  });

  it('M.2 an omitted meetingId is treated as cold, not as an error', async () => {
    const h = makeHarness([caseWith()]);
    const res = await h.beginMeeting({ caseId: CASE_ID });
    expect(res.ok).toBe(true);
    expect(h.meetings()).toHaveLength(1);
  });

  it('M.3 cold start still fails closed with no caseId', async () => {
    const h = makeHarness([caseWith()]);
    const res = await h.beginMeeting({ caseId: null });
    expect(res).toEqual({ ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED });
    expect(h.meetings()).toHaveLength(0);
  });

  it('M.4 HomeMeetingScreen states the cold intent explicitly', () => {
    // It must pass meetingId rather than leave it undefined, because commit()
    // has only just queued setCaseInfo — the documented React race.
    const i = homeCode.indexOf('await beginMeeting({');
    expect(i).toBeGreaterThan(-1);
    expect(homeCode.slice(i, i + 460)).toContain('meetingId: null');
  });
});

describe('3. N–Q fail closed, never fall back to create', () => {
  const expectRejected = (plan, reason) => {
    expect(plan.decision).toBe(START_DECISION.REJECT);
    expect(plan.reason).toBe(reason);
  };

  it('N. an id that does not exist is rejected, not created', async () => {
    const h = makeHarness(startedCase());
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: 'meeting_does_not_exist' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(h.meetings()).toHaveLength(2);           // nothing appended
    expect(h.saveCases).not.toHaveBeenCalled();     // nothing written at all
  });

  it('N.2 an empty/blank id is rejected rather than silently going cold', () => {
    expectRejected(planIdentifiedStart({ cases: startedCase(), caseId: CASE_ID, meetingId: '   ' }),
      WRITE_FAILURE.INVALID_MEETING);
  });

  it('O. a meeting belonging to another case is rejected', async () => {
    const other = { id: 'case-other', employeeName: 'Someone Else',
      meetings: [scheduledDisciplinary({ id: 'meeting_foreign', caseId: 'case-other' })] };
    const h = makeHarness([caseWith(completedInvestigation(), scheduledDisciplinary()), other]);
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: 'meeting_foreign' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(h.meetings()).toHaveLength(2);
    // and the other case is untouched
    expect(h.cases().find(c => c.id === 'case-other').meetings).toHaveLength(1);
    expect(h.cases().find(c => c.id === 'case-other').meetings[0].status).toBe(MEETING_STATUS.SCHEDULED);
  });

  it('O.2 a stored meeting claiming a different parent is a mismatch', () => {
    const cases = [caseWith(scheduledDisciplinary({ caseId: 'case-elsewhere' }))];
    expectRejected(planIdentifiedStart({ cases, caseId: CASE_ID, meetingId: SCHED_ID }),
      WRITE_FAILURE.PARENTAGE_MISMATCH);
  });

  it('P. cancelled and completed meetings cannot be started', async () => {
    for (const status of [MEETING_STATUS.CANCELLED, MEETING_STATUS.COMPLETED, MEETING_STATUS.REVIEW_DRAFT]) {
      const h = makeHarness([caseWith(scheduledDisciplinary({ status }))]);
      const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(WRITE_FAILURE.STALE_STATUS);
      expect(h.meetings()).toHaveLength(1);
      expect(h.meeting(SCHED_ID).status).toBe(status);   // unchanged
      expect(h.saveCases).not.toHaveBeenCalled();
    }
  });

  it('P.2 a legacy row with no declared status cannot be swept into the lifecycle', () => {
    const legacy = scheduledDisciplinary();
    delete legacy.status;
    const plan = planIdentifiedStart({ cases: [caseWith(legacy)], caseId: CASE_ID, meetingId: SCHED_ID });
    expectRejected(plan, WRITE_FAILURE.STALE_STATUS);
    expect(plan.from).toBeNull();
  });

  it('Q. an already in_progress meeting resumes and cannot duplicate', async () => {
    const live = scheduledDisciplinary({ status: MEETING_STATUS.IN_PROGRESS, startedAt: START_INSTANT });
    const h = makeHarness([caseWith(completedInvestigation(), live)]);
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('resume');
    expect(res.meetingId).toBe(SCHED_ID);
    expect(h.meetings()).toHaveLength(2);
    expect(h.saveCases).not.toHaveBeenCalled();        // resume writes nothing
    expect(h.meeting(SCHED_ID).startedAt).toBe(START_INSTANT);  // never restamped
  });

  it('Q.2 pressing Start twice yields one meeting, not two', async () => {
    const h = makeHarness(startedCase());
    const first = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const second = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(first.mode).toBe('transition');
    expect(second.mode).toBe('resume');
    expect(first.meetingId).toBe(second.meetingId);
    expect(h.meetings()).toHaveLength(2);
    expect(h.meeting(SCHED_ID).startedAt).toBe(START_INSTANT);
  });

  it('the source never creates after a rejected identified start', () => {
    const i = appCode.indexOf('const identifiedMeetingId = ctx.meetingId || null;');
    expect(i).toBeGreaterThan(-1);
    const branch = appCode.slice(i, appCode.indexOf('const attempt =', i));
    expect(branch).toContain('return { ok: false, reason: plan.reason };');
    expect(branch).not.toContain('newId(');
  });
});

describe('4. S/T letter artefacts and canonical classification', () => {
  it('S. a letter-only artefact can never be started as a meeting', () => {
    const letter = { id: 'meeting_letter', caseId: CASE_ID, type: 'Disciplinary',
      status: MEETING_STATUS.SCHEDULED, letterType: 'invite',
      record: '', transcript: [], letterOutput: 'Dear AT, you are invited…' };
    expect(isGenuineMeeting(letter)).toBe(false);
    expectRejectedInvalid(planIdentifiedStart({ cases: [caseWith(letter)], caseId: CASE_ID, meetingId: 'meeting_letter' }));
  });

  it('T. a genuine meeting carrying letterType AND a record stays genuine', () => {
    const both = scheduledDisciplinary({
      letterType: 'invite', letterOutput: 'Dear AT…',
      record: 'The hearing was held and the employee responded.',
    });
    expect(isGenuineMeeting(both)).toBe(true);
    // classification comes from the canonical helpers, so it remains startable
    const plan = planIdentifiedStart({ cases: [caseWith(both)], caseId: CASE_ID, meetingId: SCHED_ID });
    expect(plan.decision).toBe(START_DECISION.TRANSITION);
  });

  function expectRejectedInvalid(plan) {
    expect(plan.decision).toBe(START_DECISION.REJECT);
    expect(plan.reason).toBe(WRITE_FAILURE.INVALID_MEETING);
  }
});

describe('5. R appeal security is not weakened', () => {
  it('R.1 the appeal chair is carried through the transition, never rewritten', async () => {
    const CHAIR = '11111111-1111-1111-1111-111111111111';
    const appeal = scheduledDisciplinary({
      id: 'meeting_appeal', type: 'Disciplinary Appeal', chairUserId: CHAIR,
    });
    const h = makeHarness([caseWith(appeal)]);
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: 'meeting_appeal' });
    expect(res.ok).toBe(true);
    expect(h.meeting('meeting_appeal').chairUserId).toBe(CHAIR);
    expect(h.meeting('meeting_appeal').status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('R.2 the identified path never patches chairUserId itself', () => {
    const i = appCode.indexOf('const identifiedMeetingId = ctx.meetingId || null;');
    const branch = appCode.slice(i, appCode.indexOf('const attempt =', i));
    expect(branch).not.toContain('chairUserId');
    // and the shared transition it delegates to patches startedAt only
    const j = appCode.indexOf('const startScheduledMeeting');
    const body = appCode.slice(j, j + 900);
    expect(body).toContain('patch: { startedAt: startInstant() }');
    expect(body).not.toContain('chairUserId');
  });

  it('R.3 the database remains the control — the client sends a bare transition', () => {
    // The appeal trigger revalidates on the scheduled -> in_progress move.
    // Nothing here may pre-empt or bypass it.
    const j = appCode.indexOf('const startScheduledMeeting');
    const body = appCode.slice(j, j + 900);
    expect(body).toContain('allowedFrom: [MEETING_STATUS.SCHEDULED]');
    expect(body).toContain('toStatus: MEETING_STATUS.IN_PROGRESS');
  });
});

describe('6. write safety and concurrency', () => {
  it('6.1 exactly one single-case write, with changedId supplied', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(h.saveCases).toHaveBeenCalledTimes(1);
    expect(h.saveCalls).toEqual([CASE_ID]);
  });

  it('6.2 a failed transition is never replayed as a create', async () => {
    let db = clone(startedCase());
    const saveCases = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    const attempt = await transitionMeeting({
      cases: db, caseId: CASE_ID, meetingId: SCHED_ID,
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: START_INSTANT }, saveCases,
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe('conflict');
    // the local array is untouched and no second id was minted
    expect(db.find(c => c.id === CASE_ID).meetings).toHaveLength(2);
    expect(db.find(c => c.id === CASE_ID).meetings[1].status).toBe(MEETING_STATUS.SCHEDULED);
  });

  it('6.3 the identified branch delegates rather than reimplementing', () => {
    const i = appCode.indexOf('const identifiedMeetingId = ctx.meetingId || null;');
    const branch = appCode.slice(i, appCode.indexOf('const attempt =', i));
    expect(branch).toContain('startScheduledMeeting(cs, plan.meeting)');
    expect(branch).not.toContain('transitionMeeting(');   // no second implementation
    expect(branch).not.toContain('persistMeeting(');
    expect(branch).not.toContain('stampNewMeeting(');
  });

  it('6.4 planIdentifiedStart writes nothing', () => {
    const i = writesCode.indexOf('export function planIdentifiedStart');
    const body = writesCode.slice(i, writesCode.indexOf('\n}', i));
    expect(body).not.toContain('saveCases');
    expect(body).not.toContain('await');
  });
});

describe('7. the Case View duplicate hazard cannot arise from the fixed path', () => {
  it('7.1 after a corrected start there is no scheduled meeting left to offer', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const cs = h.theCase();
    // exactly one live meeting, and NOTHING still advertised as scheduled
    expect(resumableMeetingFor(cs).meeting.id).toBe(SCHED_ID);
    expect(scheduledMeetingsFor(cs)).toEqual([]);
  });

  it('7.2 the old path produced exactly that hazard', async () => {
    const h = makeHarness(startedCase(), { honourIdentified: false });
    const res = await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    const cs = h.theCase();
    expect(resumableMeetingFor(cs).meeting.id).toBe(res.meetingId);
    expect(scheduledMeetingsFor(cs)).toHaveLength(1);    // the stranded one
    expect(scheduledMeetingsFor(cs)[0].id).toBe(SCHED_ID);
  });

  it('7.3 the completed Investigation is still complete and separate', async () => {
    const h = makeHarness(startedCase());
    await h.beginMeeting({ caseId: CASE_ID, meetingId: SCHED_ID });
    expect(isMeetingComplete(h.meeting(INV_ID))).toBe(true);
    expect(h.meetings()).toHaveLength(2);
  });
});
