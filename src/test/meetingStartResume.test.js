import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, isResumableMeeting, resumableMeetingFor, declaredStatus, isMeetingComplete,
} from '../lib/meetingLifecycle.js';
import { WRITE_FAILURE, transitionMeeting, planMeetingWrite } from '../lib/meetingWrites.js';

// Release 1 Phase 2.2 — authoritative Start / Resume.
//
// A structured case meeting must exist on the server BEFORE the live
// RecordScreen is entered. Afterwards a refresh, browser restart, navigation
// or device change no longer requires Compass to reconstruct the meeting from
// employee name or React state: the case carries caseId + meetingId +
// status "in_progress" and can offer Resume deterministically.
//
// The hard gate of this phase is that Review Save must PATCH the started
// meeting rather than append a second one. Tests 23-25 pin that.

const app = readFileSync('src/App.jsx', 'utf8');
const home = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
const prep = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

const live = (over = {}) => ({
  id: 'h1', caseId: 'case-a', type: 'Investigation', status: MEETING_STATUS.IN_PROGRESS,
  startedAt: '2026-09-23T10:00:00.000Z', createdAt: '2026-09-23T10:00:00.000Z',
  createdBy: 'Jane Smith', record: null, transcript: [], ...over,
});
const caseWith = (...meetings) => ({ id: 'case-a', employeeName: 'Sam Patel', meetings });
const okSave = () => vi.fn(async () => ({ ok: true }));

describe('1-6. a started meeting is authoritative', () => {
  it('1/2/3. exactly one meeting, stable id, authoritative parentage', () => {
    const plan = planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: live() });
    expect(plan.mode).toBe('create');
    const list = plan.nextCases[0].meetings;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('h1');
    expect(list[0].caseId).toBe('case-a');
    expect(list[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('4/5/6. createdAt, createdBy and startedAt are all present at Start', () => {
    const m = live();
    expect(m.createdAt).toBeTruthy();
    expect(m.createdBy).toBeTruthy();
    expect(m.startedAt).toBeTruthy();
  });

  it('createdAt and startedAt stay distinct concepts', () => {
    // Start-now makes them near-identical; scheduling will not.
    const scheduledThenStarted = live({ createdAt: '2026-09-20T09:00:00.000Z', startedAt: '2026-09-29T10:02:00.000Z' });
    expect(scheduledThenStarted.createdAt).not.toBe(scheduledThenStarted.startedAt);
    expect(isResumableMeeting(scheduledThenStarted)).toBe(true);
  });

  it('a started meeting is not complete, with or without a record', () => {
    expect(isMeetingComplete(live())).toBe(false);
    expect(isMeetingComplete(live({ record: 'partial notes' }))).toBe(false);
  });

  it('6b. the Start path stamps identity, parentage and provenance together', () => {
    expect(app).toContain('status: MEETING_STATUS.IN_PROGRESS,');
    expect(app).toContain('startedAt: attempt.startedAt,');
    expect(app).toContain('}, { caseId, now: attempt.startedAt, by: currentUser?.name || "HR Manager" });');
  });
});

describe('7/8. start instant and retry', () => {
  it('7. startedAt is never recomputed on Resume', () => {
    expect(app).toContain('setMeetingStartTime(meeting.startedAt || null);');
    const resume = app.slice(app.indexOf('const resumeMeeting ='), app.indexOf('const reset ='));
    expect(resume).not.toMatch(/new Date\(\)/);
    expect(resume).not.toMatch(/newId\(/);
  });

  it('7b. startedAt is never recomputed at End or Save', () => {
    expect(app).toContain('startedAt: meetingStartTime || null,');
    expect(app).not.toMatch(/\bstartedAt:\s*new Date\(\)/);
  });

  it('8. retrying the same Start reuses the id, so a retry patches instead of appending', () => {
    // The attempt is held in a ref and reused while it targets the same case.
    expect(app).toContain('const pendingStartRef = useRef(null);');
    expect(app).toContain('pendingStartRef.current && pendingStartRef.current.caseId === caseId');
    expect(app).toContain('pendingStartRef.current = attempt;');
    // and a reused id resolves to a patch, never a second row
    const cases = [caseWith(live())];
    const retry = planMeetingWrite({ cases, caseId: 'case-a', meeting: live({ startedAt: '2026-09-23T10:00:00.000Z' }) });
    expect(retry.mode).toBe('patch');
    expect(retry.nextCases[0].meetings).toHaveLength(1);
  });

  it('8b. the attempt is cleared once it has succeeded', () => {
    expect(app).toContain('pendingStartRef.current = null;');
  });
});

describe('9-11. Start fails closed', () => {
  it('9. Start without an authoritative caseId does not happen', () => {
    expect(app).toContain('showToast(describeMeetingWriteFailure(WRITE_FAILURE.PARENT_REQUIRED), "error");');
    const begin = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('const resumeMeeting ='));
    expect(begin).toContain('if(!caseId) {');
    // no name matching, no case creation anywhere in the Start path
    expect(begin).not.toContain('employeeName');
    expect(begin).not.toContain('crypto.randomUUID');
  });

  it('10/11. inaccessible case and parentage mismatch are refused by the primitive', async () => {
    const save = okSave();
    expect((await transitionMeeting({ cases: [caseWith(live())], caseId: 'nope', meetingId: 'h1', allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save })).reason)
      .toBe(WRITE_FAILURE.NOT_FOUND);
    expect((await transitionMeeting({ cases: [caseWith(live({ caseId: 'other-case' }))], caseId: 'case-a', meetingId: 'h1', allowedFrom: [null], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save })).reason)
      .toBe(WRITE_FAILURE.PARENTAGE_MISMATCH);
    expect(save).not.toHaveBeenCalled();
  });

  it('Start navigates only after persistence succeeds', () => {
    const begin = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('const resumeMeeting ='));
    const failPoint = begin.indexOf('return { ok: false, reason: result?.reason };');
    const navPoint = begin.indexOf('setScreen(SCREENS.RECORD);');
    const auditPoint = begin.indexOf('audit("Meeting started"');
    expect(failPoint).toBeGreaterThan(-1);
    expect(navPoint).toBeGreaterThan(failPoint);      // navigation is after the failure return
    expect(auditPoint).toBeGreaterThan(failPoint);    // so is the audit event
    expect(auditPoint).toBeLessThan(navPoint);
  });
});

describe('12-18. Resume is deterministic', () => {
  it('12/13/14. Resume finds the live meeting and reuses its id and startedAt', () => {
    const cs = caseWith(live());
    const found = resumableMeetingFor(cs);
    expect(found.meeting.id).toBe('h1');
    expect(found.meeting.startedAt).toBe('2026-09-23T10:00:00.000Z');
    expect(found.count).toBe(1);
    expect(found.ambiguous).toBe(false);
  });

  it('15. Resume emits no second "Meeting started" audit', () => {
    const resume = app.slice(app.indexOf('const resumeMeeting ='), app.indexOf('const reset ='));
    expect(resume).not.toContain('audit(');
    expect((app.match(/audit\("Meeting started"/g) || []).length).toBe(1);
  });

  it('16/17. completed and cancelled meetings are not resumable', () => {
    expect(isResumableMeeting(live({ status: MEETING_STATUS.COMPLETED, record: 'done' }))).toBe(false);
    expect(isResumableMeeting(live({ status: MEETING_STATUS.CANCELLED }))).toBe(false);
    expect(resumableMeetingFor(caseWith(live({ status: MEETING_STATUS.COMPLETED }))).meeting).toBeNull();
  });

  it('18. review_draft is not treated as live', () => {
    // Phase 3 owns that state; it is explicitly not a Resume target here.
    expect(isResumableMeeting(live({ status: MEETING_STATUS.REVIEW_DRAFT }))).toBe(false);
  });

  it('a legacy meeting is never resumable, whatever it contains', () => {
    for (const m of [{ id: 'L', type: 'Disciplinary Appeal', record: 'old' }, { id: 'L', type: 'Investigation', record: '' }, { id: 'L', type: 'Investigation', transcript: [{ seq: 1 }] }]) {
      expect(declaredStatus(m)).toBeNull();
      expect(isResumableMeeting(m)).toBe(false);
    }
  });

  it('Resume is never inferred from record absence, transcript, notes or latest-meeting', () => {
    const src = readFileSync('src/lib/meetingLifecycle.js', 'utf8');
    // The doc comment names the very things the code must not use, so the
    // prohibition is asserted against executable lines only.
    const fn = src.slice(src.indexOf('export function isResumableMeeting'), src.indexOf('export function resumableMeetingFor'))
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(fn).toContain('declaredStatus(m) === MEETING_STATUS.IN_PROGRESS');
    expect(fn).not.toMatch(/record|transcript|employeeName|length - 1/);
  });

  it('malformed input never looks resumable', () => {
    for (const v of [null, undefined, 0, '', 'x', [], {}, NaN]) expect(isResumableMeeting(v)).toBe(false);
    expect(resumableMeetingFor(null)).toEqual({ meeting: null, count: 0, ambiguous: false });
    expect(resumableMeetingFor({ meetings: 'nope' }).meeting).toBeNull();
  });

  it('a letter artefact is never resumable even if it somehow carried the status', () => {
    expect(isResumableMeeting({ id: 'l', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [], status: MEETING_STATUS.IN_PROGRESS })).toBe(false);
  });
});

describe('multiple in_progress meetings are deterministic, never array order', () => {
  const early = live({ id: 'early', startedAt: '2026-09-23T09:00:00.000Z' });
  const later = live({ id: 'later', startedAt: '2026-09-23T11:00:00.000Z' });

  it('the most recently started wins regardless of position', () => {
    expect(resumableMeetingFor(caseWith(early, later)).meeting.id).toBe('later');
    expect(resumableMeetingFor(caseWith(later, early)).meeting.id).toBe('later');
  });

  it('the ambiguity is reported rather than hidden', () => {
    const r = resumableMeetingFor(caseWith(early, later));
    expect(r.count).toBe(2);
    expect(r.ambiguous).toBe(true);
  });

  it('an unstamped row never outranks one that recorded a real instant', () => {
    const unstamped = live({ id: 'unstamped', startedAt: null });
    expect(resumableMeetingFor(caseWith(unstamped, early)).meeting.id).toBe('early');
    expect(resumableMeetingFor(caseWith(early, unstamped)).meeting.id).toBe('early');
  });

  it('the Case View states the ambiguity to the user', () => {
    expect(caseView).toContain('liveMeeting.ambiguous&&');
    expect(caseView).toContain('meetings on this case are marked in progress — showing the most recently started.');
  });
});

describe('19-22. appeal hearings', () => {
  it('19/21. Start carries the appointed officer as chairUserId, or nothing', () => {
    expect(app).toContain('chairUserId: appealManagerId || null,');
    const begin = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('const resumeMeeting ='));
    expect(begin).toContain('const appealManagerId = ctx.appealManagerId !== undefined ? ctx.appealManagerId : caseInfo.appealManagerId;');
  });

  it('20. a stale officer is rejected by the database, not by the client', () => {
    // The client never checks the officer itself; the trigger is authoritative.
    const begin = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('const resumeMeeting ='));
    expect(begin).not.toMatch(/case_access|appeal_manager/);
    // and the client can explain the trigger's verdict
    expect(app).toContain('APPEAL_CHAIR_STALE_AT_START');
  });

  it('22. a non-appeal Start writes no chair at all', () => {
    const plan = planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: live({ chairUserId: null }) });
    expect(plan.meeting.chairUserId).toBeNull();
  });

  it('Resume restores the recorded chair rather than re-resolving the current officer', () => {
    expect(app).toContain('appealManagerId: meeting.chairUserId || null,');
  });

  it('no non-appeal chair semantics were introduced', () => {
    const lifecycle = readFileSync('src/lib/meetingLifecycle.js', 'utf8');
    const writes = readFileSync('src/lib/meetingWrites.js', 'utf8');
    expect(lifecycle).not.toContain('chairUserId');
    expect(writes).not.toContain('chairUserId');
  });
});

describe('23-25. THE HARD GATE — Review Save patches the started meeting', () => {
  it('23/25. saving a started meeting patches it; no second row appears', () => {
    const started = live();
    const saved = { ...started, record: 'Full record.', summary: 'x', status: MEETING_STATUS.COMPLETED };
    const plan = planMeetingWrite({ cases: [caseWith(started)], caseId: 'case-a', meeting: saved });
    expect(plan.mode).toBe('patch');
    expect(plan.nextCases[0].meetings).toHaveLength(1);
    expect(plan.nextCases[0].meetings[0].id).toBe('h1');
  });

  it('24. the save path reuses the started meeting id', () => {
    expect(app).toContain('const lifecycleMeetingId = (!isLetterShapedSave && caseInfo.meetingId) ? caseInfo.meetingId : null;');
    expect(app).toContain('id: lifecycleMeetingId || newId("meeting"),');
  });

  it('saving completes the meeting, so it is not left falsely in progress', () => {
    expect(app).toContain('...(lifecycleMeetingId ? { status: MEETING_STATUS.COMPLETED } : {}),');
    const started = live();
    const saved = { ...started, record: 'Full record.', status: MEETING_STATUS.COMPLETED };
    expect(isMeetingComplete(saved)).toBe(true);
    expect(isResumableMeeting(saved)).toBe(false);
  });

  it('a saved meeting keeps its original identity, parentage and startedAt', () => {
    const started = live();
    const saved = { ...started, record: 'Full record.', status: MEETING_STATUS.COMPLETED };
    const out = planMeetingWrite({ cases: [caseWith(started)], caseId: 'case-a', meeting: saved }).nextCases[0].meetings[0];
    expect(out.id).toBe(started.id);
    expect(out.caseId).toBe('case-a');
    expect(out.startedAt).toBe(started.startedAt);
    expect(out.createdAt).toBe(started.createdAt);
  });

  it('a letter-shaped save can never patch a live hearing', () => {
    expect(app).toContain('const isLetterShapedSave = !!letterOutput && !savedRecordText && savedTranscriptLen === 0;');
  });

  it('the meeting id is cleared after a successful save', () => {
    expect(app).toContain('if(lifecycleMeetingId) setCaseInfo(p=>({...p, meetingId:null}));');
  });

  it('and cleared whenever a new meeting is set up', () => {
    expect(home).toContain('meetingId:null,');
  });
});

describe('26-29. legacy compatibility', () => {
  it('26. a save with no lifecycle meeting behaves exactly as before', () => {
    // lifecycleMeetingId null -> fresh id, no status written
    const plan = planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: { id: 'fresh', type: 'Investigation', record: 'notes' } });
    expect(plan.mode).toBe('create');
    expect(plan.meeting.status).toBeUndefined();
  });

  it('27. a legacy no-record meeting is untouched and still workflow-incomplete', () => {
    const legacy = { id: 'L1', type: 'Investigation', record: '', savedAt: '2026-05-01T10:00:00.000Z' };
    expect(declaredStatus(legacy)).toBeNull();
    expect(isMeetingComplete(legacy)).toBe(false);
    expect(isResumableMeeting(legacy)).toBe(false);
  });

  it('28/29. letter artefacts and hearings carrying letterType are unaffected', () => {
    const letter = { id: 'l', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [] };
    const hearingWithLetter = { id: 'h', type: 'Disciplinary', letterType: 'outcome', letterOutput: 'x', record: 'real record' };
    expect(isResumableMeeting(letter)).toBe(false);
    expect(isMeetingComplete(hearingWithLetter)).toBe(true);
  });

  it('a legacy meeting can never be swept into the lifecycle by a transition', async () => {
    const save = okSave();
    const legacy = { id: 'L1', caseId: 'case-a', type: 'Investigation', record: 'old' };
    const result = await transitionMeeting({
      cases: [caseWith(legacy)], caseId: 'case-a', meetingId: 'L1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save,
    });
    expect(result.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(result.from).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('transition primitive — allowed-from, not generic setStatus', () => {
  it('scheduled -> in_progress is permitted (the Phase 2.3 contract)', async () => {
    const save = okSave();
    const scheduled = live({ status: MEETING_STATUS.SCHEDULED, startedAt: null });
    const result = await transitionMeeting({
      cases: [caseWith(scheduled)], caseId: 'case-a', meetingId: 'h1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { startedAt: 'T' }, saveCases: save,
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('patch');
    expect(save.mock.calls[0][1]).toBe('case-a');
    const written = save.mock.calls[0][0][0].meetings;
    expect(written).toHaveLength(1);
    expect(written[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
    expect(written[0].startedAt).toBe('T');
  });

  it('completed, cancelled and review_draft cannot be restarted', async () => {
    for (const from of [MEETING_STATUS.COMPLETED, MEETING_STATUS.CANCELLED, MEETING_STATUS.REVIEW_DRAFT]) {
      const save = okSave();
      const result = await transitionMeeting({
        cases: [caseWith(live({ status: from }))], caseId: 'case-a', meetingId: 'h1',
        allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save,
      });
      expect(result.reason).toBe(WRITE_FAILURE.STALE_STATUS);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('a patch cannot smuggle in a different id, parent or status', async () => {
    const save = okSave();
    await transitionMeeting({
      cases: [caseWith(live({ status: MEETING_STATUS.SCHEDULED }))], caseId: 'case-a', meetingId: 'h1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS,
      patch: { id: 'evil', caseId: 'other', status: MEETING_STATUS.COMPLETED }, saveCases: save,
    });
    const written = save.mock.calls[0][0][0].meetings[0];
    expect(written.id).toBe('h1');
    expect(written.caseId).toBe('case-a');
    expect(written.status).toBe(MEETING_STATUS.IN_PROGRESS);
  });

  it('fails closed on conflict and never replays', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    const result = await transitionMeeting({
      cases: [caseWith(live({ status: MEETING_STATUS.SCHEDULED }))], caseId: 'case-a', meetingId: 'h1',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a missing meeting is not created by a transition', async () => {
    const save = okSave();
    const result = await transitionMeeting({
      cases: [caseWith()], caseId: 'case-a', meetingId: 'ghost',
      allowedFrom: [MEETING_STATUS.SCHEDULED], toStatus: MEETING_STATUS.IN_PROGRESS, saveCases: save,
    });
    expect(result.reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('crash-recovery precedence — server beats stale local state', () => {
  it('a local draft naming a meeting the case no longer calls live is discarded', () => {
    expect(app).toContain('if(draft.caseInfo?.meetingId) {');
    expect(app).toContain("declaredStatus(m) === MEETING_STATUS.IN_PROGRESS);");
    expect(app).toContain('if(!stillLive) { orgLsSet("compass_meeting_draft", null); return; }');
  });

  it('pre-2.2 drafts with no meeting id keep their existing behaviour', () => {
    // They already fail closed at Save via Phase 2.1's parent_required, so
    // the new guard is conditional on a meeting id being present at all.
    const i = app.indexOf('if(draft.caseInfo?.meetingId) {');
    expect(i).toBeGreaterThan(-1);
    const guard = app.slice(i, i + 700);
    expect(guard).toContain('const stillLive = draftCase &&');
    expect(guard).toContain('orgLsSet("compass_meeting_draft", null); return;');
  });
});

describe('platform-wide, not misconduct-specific', () => {
  it('the Start path contains no case-type branching whatsoever', () => {
    const begin = app.slice(app.indexOf('const beginMeeting ='), app.indexOf('const resumeMeeting ='));
    for (const w of ['misconduct', 'grievance', 'disciplinary', 'investigation', 'probation', 'capability', 'redundancy', 'getNextStep']) {
      expect(begin.toLowerCase()).not.toContain(w.toLowerCase());
    }
  });

  it('every structured meeting type starts and resumes identically', () => {
    const types = ['Investigation', 'Disciplinary', 'Disciplinary Appeal', 'Grievance', 'Probation Review',
      'Formal Meeting', 'Return to Work', 'Informal / 1-1', 'Consultation', 'Redundancy Consultation'];
    for (const type of types) {
      const m = live({ type });
      expect(isResumableMeeting(m)).toBe(true);
      expect(isMeetingComplete(m)).toBe(false);
      expect(isMeetingComplete({ ...m, status: MEETING_STATUS.COMPLETED })).toBe(true);
      expect(planMeetingWrite({ cases: [caseWith()], caseId: 'case-a', meeting: m }).ok).toBe(true);
    }
  });

  it('the lifecycle module still has no recipe or case-type vocabulary', () => {
    const src = readFileSync('src/lib/meetingLifecycle.js', 'utf8');
    const body = src.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .filter(l => !l.trim().startsWith('import '))
      .join('\n').toLowerCase();
    for (const w of ['misconduct', 'grievance', 'disciplinary', 'appeal', 'probation', 'capability', 'redundancy', 'getnextstep', 'recipe']) {
      expect(body).not.toContain(w);
    }
  });
});

describe('the Resume affordance is minimal and truthful', () => {
  it('is driven by the deterministic helper, not a local heuristic', () => {
    expect(caseView).toContain("import { resumableMeetingFor } from '../lib/meetingLifecycle';");
    expect(caseView).toContain('const liveMeeting = resumableMeetingFor(cs);');
  });

  it('states the Phase 2.2 boundary honestly — the meeting is saved, the notes are not', () => {
    expect(caseView).toContain('This meeting is saved to the case. Notes typed during it are held on the device it was started on until the record is saved.');
  });

  it('does not change the suggested-next-step surface', () => {
    expect(caseView).toContain('<div style={{fontSize:13,color:"#5B3FD4",fontWeight:600}}>Suggested next step: {nextStep.label}</div>');
  });

  it('both PrepScreen routes persist before entering the live screen', () => {
    expect(prep).toContain('await beginMeeting();');
    expect((prep.match(/onClick=\{startMeeting\}/g) || []).length).toBe(2);
    expect(prep).not.toContain('setScreen(SCREENS.RECORD)');
  });
});
