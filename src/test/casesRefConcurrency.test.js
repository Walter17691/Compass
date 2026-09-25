import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEETING_STATUS, isScheduledMeeting, scheduledMeetingsFor } from '../lib/meetingLifecycle.js';
import { persistMeeting, stampNewMeeting, transitionMeeting } from '../lib/meetingWrites.js';

// P1 — "Couldn't save this meeting" when scheduling a SECOND meeting on a case.
// Production human UAT, 2026-09-24.
//
// Walter scheduled a Disciplinary meeting on a case that already held a
// completed Investigation meeting. Nothing persisted. The logs settled it:
//
//   20:50:24  PATCH …&updated_at=eq.2026-09-24T20:15:11.834+00:00  → 200, matched
//             (Investigation saved; database moved to 20:50:23.992)
//   21:11:59  PATCH …&updated_at=eq.2026-09-24T20:15:11.834+00:00  → 200, 0 rows
//
// The second write sent an updated_at from BEFORE the first. A conditional
// UPDATE matching nothing returns HTTP 200 with an empty array — no Postgres
// error, no non-2xx status — so it surfaced as reason:'conflict', which
// describeMeetingWriteFailure has no copy for, falling through to the generic
// "Couldn't save this meeting — please try again."
//
// Cause: casesRef is seeded once at mount (`useRef(cases)`) and was only ever
// reassigned inside saveCases. Neither loadCasesFromDB nor saveCaseToDB's
// success write-back touched it, so the ref lagged the database by exactly one
// write. Every meeting write reads the ref — it must, because chained writes in
// one synchronous run (schedule → calendar patch) depend on it — so the lag
// became a stale optimistic-concurrency key.
//
// Nothing to do with Disciplinary as a type, and nothing to do with the
// creation-metadata remediation: that rule only applies on PATCH inside
// planMeetingWrite, which this write never reached.

const app = readFileSync('src/App.jsx', 'utf8');

const CASE_ID = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';
const U0 = '2026-09-24T20:15:11.834+00:00';   // database value before the save
const U1 = '2026-09-24T20:50:23.992+00:00';   // database value after it

const completedInvestigation = () => ({
  id: 'meeting_cad06fdb', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
  createdAt: '2026-09-24T20:11:55.819Z', createdBy: 'UAT - HR Manager',
  startedAt: '2026-09-24T20:15:11.833Z', endedAt: '2026-09-24T20:44:29.384Z',
  schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams' }, record: 'Full record.',
});

// A faithful model of the shipped persistence contract:
//   saveCases(u, id) → casesRef.current = u; then saveCaseToDB(changed)
//   saveCaseToDB: if changed.updatedAt → conditional UPDATE on updated_at
//                 (0 rows ⇒ reason 'conflict'), else unconditional upsert.
// syncRef reproduces the fix; with syncRef false it reproduces the defect.
const makeApp = ({ syncRef, clock }) => {
  const db = { updatedAt: U0 };
  const initial = [{ id: CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', updatedAt: U0, meetings: [completedInvestigation()] }];
  const app = { state: initial, ref: initial, conflicts: 0, accepted: 0, upserts: 0 };

  const saveCaseToDB = (changed) => {
    if (changed.updatedAt) {
      if (changed.updatedAt !== db.updatedAt) { app.conflicts += 1; return { ok: false, reason: 'conflict' }; }
      const nowIso = clock();
      db.updatedAt = nowIso;
      app.accepted += 1;
      app.state = app.state.map(c => (c.id === changed.id ? { ...c, updatedAt: nowIso } : c));
      if (syncRef) app.ref = app.ref.map(c => (c.id === changed.id ? { ...c, updatedAt: nowIso } : c));
      return { ok: true };
    }
    // Unconditional upsert — no optimistic-concurrency check at all.
    app.upserts += 1;
    db.updatedAt = clock();
    return { ok: true };
  };

  const saveCases = vi.fn(async (u, changedId) => {
    app.ref = u;                                   // saveCases' own assignment
    app.state = u;
    const changed = u.find(c => c.id === changedId);
    return saveCaseToDB(changed);
  });

  return { app, db, saveCases, refCase: () => app.ref.find(c => c.id === CASE_ID) };
};

let t = 0;
const clock = () => [U1, '2026-09-24T21:11:59.999+00:00', '2026-09-24T21:20:00.000+00:00'][t++] || `2026-09-24T22:0${t}:00.000+00:00`;

const scheduleDisciplinary = ({ app, saveCases }) => persistMeeting({
  cases: app.ref, caseId: CASE_ID, saveCases,
  meeting: stampNewMeeting({
    id: 'meeting_disciplinary_1', type: 'Disciplinary', status: MEETING_STATUS.SCHEDULED,
    schedule: { date: '2026-10-02', time: '10:00', method: 'Microsoft Teams' },
    date: '2026-10-02', startedAt: null, endedAt: null, record: null, transcript: [],
    invitation: null, calendar: null,
  }, { caseId: CASE_ID, now: '2026-09-24T21:11:59.000Z', by: 'UAT - HR Manager' }),
});

// The first write: saving the Investigation record, exactly as it happened.
const saveInvestigation = ({ app, saveCases }) => persistMeeting({
  cases: app.state, caseId: CASE_ID, saveCases,
  meeting: { ...completedInvestigation(), record: 'Full record, saved.' },
});

describe('THE REPRODUCTION — schedule a second meeting after a successful save', () => {
  it('succeeds once the ref tracks the database', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    expect((await saveInvestigation(h)).ok).toBe(true);
    expect(h.db.updatedAt).toBe(U1);
    expect(h.refCase().updatedAt).toBe(U1);            // the fix

    const result = await scheduleDisciplinary(h);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('create');
    expect(h.app.conflicts).toBe(0);

    const meetings = h.refCase().meetings;
    expect(meetings).toHaveLength(2);                   // exactly one additional
    const added = meetings.find(m => m.id === 'meeting_disciplinary_1');
    expect(added.type).toBe('Disciplinary');
    expect(added.status).toBe(MEETING_STATUS.SCHEDULED);
    expect(added.caseId).toBe(CASE_ID);
    expect(added.schedule).toEqual({ date: '2026-10-02', time: '10:00', method: 'Microsoft Teams' });
    expect(added.createdAt).toBe('2026-09-24T21:11:59.000Z');
    expect(added.createdBy).toBe('UAT - HR Manager');
    expect(isScheduledMeeting(added)).toBe(true);
    expect(scheduledMeetingsFor(h.refCase()).map(m => m.id)).toEqual(['meeting_disciplinary_1']);
  });

  it('and the existing completed Investigation meeting is untouched', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    await saveInvestigation(h);
    await scheduleDisciplinary(h);
    const inv = h.refCase().meetings.find(m => m.id === 'meeting_cad06fdb');
    expect(inv.status).toBe(MEETING_STATUS.COMPLETED);
    expect(inv.startedAt).toBe('2026-09-24T20:15:11.833Z');
    expect(inv.endedAt).toBe('2026-09-24T20:44:29.384Z');
    expect(inv.createdAt).toBe('2026-09-24T20:11:55.819Z');
    expect(inv.createdBy).toBe('UAT - HR Manager');
  });

  it('REPRODUCES THE DEFECT — without the ref sync the same sequence conflicts', async () => {
    t = 0;
    const h = makeApp({ syncRef: false, clock });
    expect((await saveInvestigation(h)).ok).toBe(true);
    expect(h.db.updatedAt).toBe(U1);
    expect(h.refCase().updatedAt).toBe(U0);            // the defect: one write behind

    const result = await scheduleDisciplinary(h);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
    expect(h.app.conflicts).toBe(1);
    // The DATABASE is the evidence: the conditional write matched nothing, so
    // updated_at never moved and no meeting was persisted — exactly what the
    // production inspection found. The local array does hold the optimistic
    // append until saveCaseToDB's conflict branch reloads and discards it,
    // which is why the phantom self-heals rather than compounding.
    expect(h.db.updatedAt).toBe(U1);                    // unchanged by the failed write
    expect(h.app.accepted).toBe(1);                    // only the Investigation save landed
    expect(app).toContain('loadCasesFromDB();');       // the conflict branch reloads
  });

  it('the stale key is exactly the value the production logs show', async () => {
    t = 0;
    const h = makeApp({ syncRef: false, clock });
    await saveInvestigation(h);
    // the second write would be conditioned on 20:15:11.834 while the database
    // sits at 20:50:23.992 — the two URLs captured in edge_logs
    expect(h.refCase().updatedAt).toBe('2026-09-24T20:15:11.834+00:00');
    expect(h.db.updatedAt).toBe('2026-09-24T20:50:23.992+00:00');
  });
});

describe('chained writes still work — why the ref cannot simply be replaced by state', () => {
  it('a calendar patch immediately after scheduling finds the new meeting', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    const scheduled = await scheduleDisciplinary(h);
    expect(scheduled.ok).toBe(true);
    // React state would not yet carry the new meeting inside the same
    // synchronous run; the ref does, which is why meeting writes read it.
    const patched = await transitionMeeting({
      cases: h.app.ref, caseId: CASE_ID, meetingId: 'meeting_disciplinary_1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { calendar: { provider: 'google', eventId: 'evt_1', syncedAt: 'T' } },
      saveCases: h.saveCases,
    });
    expect(patched.ok).toBe(true);
    expect(patched.mode).toBe('patch');
    expect(h.refCase().meetings).toHaveLength(2);       // still no duplicate
    expect(h.refCase().meetings.find(m => m.id === 'meeting_disciplinary_1').calendar.eventId).toBe('evt_1');
  });

  it('several consecutive meeting writes all succeed', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    await saveInvestigation(h);
    await scheduleDisciplinary(h);
    const reschedule = await transitionMeeting({
      cases: h.app.ref, caseId: CASE_ID, meetingId: 'meeting_disciplinary_1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.SCHEDULED,
      patch: { schedule: { date: '2026-10-09', time: '14:00', method: 'Office' }, date: '2026-10-09' },
      saveCases: h.saveCases,
    });
    expect(reschedule.ok).toBe(true);
    expect(h.app.conflicts).toBe(0);
    expect(h.refCase().meetings).toHaveLength(2);
  });
});

describe('the quieter hazard the staleness was masking', () => {
  it('a ref entry with no updatedAt bypasses optimistic concurrency entirely', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    // simulate the mount-time ref seeded from a cache entry with no updatedAt
    h.app.ref = h.app.ref.map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'updatedAt')));
    await scheduleDisciplinary(h);
    expect(h.app.upserts).toBe(1);        // unconditional write — no check ran
    expect(h.app.conflicts).toBe(0);
  });

  it('after the fix a saved case always carries a real updatedAt on the ref', async () => {
    t = 0;
    const h = makeApp({ syncRef: true, clock });
    await saveInvestigation(h);
    expect(h.refCase().updatedAt).toBeTruthy();
    expect(h.refCase().updatedAt).toBe(h.db.updatedAt);
  });
});

describe('the shipped synchronisation', () => {
  it('a database load refreshes the ref, not only state', () => {
    expect(app).toContain('const loadedCases = data.map(mapCaseRow).map(ensureEvidenceIds);');
    expect(app).toContain('setCases(loadedCases);');
    expect(app).toContain('casesRef.current = loadedCases;');
  });

  it('a successful case write advances the ref alongside state', () => {
    expect(app).toContain('setCases(prev => prev.map(c => c.id===caseObj.id ? {...c, updatedAt: nowIso} : c));');
    expect(app).toContain('casesRef.current = casesRef.current.map(c => c.id===caseObj.id ? {...c, updatedAt: nowIso} : c);');
  });

  it('meeting writes still read the ref — the fix does not change who reads what', () => {
    // 8 since the Phase 2.3 continuity fix: beginMeeting's identified-start
    // branch resolves the named meeting from the same fresh ref every other
    // meeting write already reads. A new meeting write MUST appear here — if
    // this count rises with a site reading stale `cases` state instead, that is
    // the defect this suite exists to catch.
    expect((app.match(/cases: casesRef\.current/g) || []).length).toBe(8);
  });

  it('and the canonical save still reads state, which was never stale', () => {
    expect(app).toContain('? await persistMeeting({ cases, caseId, meeting: stampedMeeting, saveCases })');
  });
});
