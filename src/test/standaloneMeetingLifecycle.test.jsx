import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  startStandaloneMeeting, endStandaloneMeeting, persistStandaloneReviewDraft,
  persistStandaloneTranscript, fetchStandaloneMeeting, transitionStandaloneMeeting,
  STANDALONE_WRITE, STANDALONE_FAILURE, describeStandaloneFailure,
} from '../lib/standaloneMeetingWrites.js';
import { meetingPatchToRow, newStandaloneMeetingRow, TABLE_HOME } from '../lib/standaloneMeetings.js';
import { caseForPersistence, assertNoTableResident, isTableResident, TableResidentInCaseError } from '../lib/meetingStore.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { caseRequirement, caseRequirementNotice, CASE_REQUIREMENT } from '../lib/meetingCaseRequirement.js';

// Phase 4C.3 — standalone Start / Resume / End.
//
// The security matrix lives in RLS and is proven against the real table with JWT
// impersonation (recorded in the report). This file proves the parts that are
// genuinely code: the storage boundary, the creation gate, idempotency, and that
// every lifecycle write for a table-resident meeting is routed away from
// cases.meetings.

const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

// ── A minimal in-memory Supabase stand-in ──────────────────────────────────
// Records every call so a test can assert not just the result but WHICH table was
// touched — which is the whole point when the defect being prevented is "the
// wrong store was written to".
function fakeDb(seed = []) {
  const rows = seed.map(r => ({ ...r }));
  const calls = [];
  const api = {
    rows, calls,
    from(table) {
      calls.push({ op: 'from', table });
      const ctx = { table, filters: [], statusIn: null };
      const chain = {
        insert(row) {
          ctx.op = 'insert'; ctx.row = row;
          return chain;
        },
        update(patch) { ctx.op = 'update'; ctx.patch = patch; return chain; },
        select() { ctx.selected = true; return chain; },
        eq(col, val) { ctx.filters.push([col, val]); return chain; },
        in(col, vals) { ctx.statusIn = { col, vals }; return chain; },
        order() { return chain; },
        maybeSingle() { return Promise.resolve(run(ctx, rows, calls, 'maybeSingle')); },
        single() { return Promise.resolve(run(ctx, rows, calls, 'single')); },
        then(res, rej) { return Promise.resolve(run(ctx, rows, calls, 'many')).then(res, rej); },
      };
      return chain;
    },
  };
  return api;
}

function run(ctx, rows, calls, shape) {
  calls.push({ op: ctx.op, table: ctx.table, filters: ctx.filters, statusIn: ctx.statusIn, patch: ctx.patch, row: ctx.row });
  if (ctx.op === 'insert') {
    if (rows.some(r => r.id === ctx.row.id)) {
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }
    const created = { created_at: 'CREATED', updated_at: 'CREATED', ...ctx.row };
    rows.push(created);
    return { data: created, error: null };
  }
  let matched = rows.filter(r => ctx.filters.every(([c, v]) => r[c] === v));
  if (ctx.statusIn) matched = matched.filter(r => ctx.statusIn.vals.includes(r[ctx.statusIn.col]));
  if (ctx.op === 'update') {
    matched.forEach(r => Object.assign(r, ctx.patch));
    return { data: matched.map(r => ({ ...r })), error: null };
  }
  if (shape === 'maybeSingle' || shape === 'single') {
    return { data: matched[0] ? { ...matched[0] } : null, error: null };
  }
  return { data: matched.map(r => ({ ...r })), error: null };
}

const START = { orgId: 'org-a', createdBy: 'user-1', meetingTypeId: 'informal', employeeName: 'Dana Keys', startedAt: 'T_START' };

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the hard storage boundary', () => {
  it('1. the ONE cases.meetings write site is guarded', () => {
    // There is exactly one place any meeting reaches the column, and the value
    // written is the guarded one — not caseObj.meetings.
    expect(appCode).toContain('const safeCase = caseForPersistence(caseObj);');
    expect(appCode).toContain('meetings: safeCase.meetings || [],');
    expect(appCode).not.toContain('meetings: caseObj.meetings || [],');
    // Exactly one `meetings:` key in the saveCaseToDB payload.
    const payload = appCode.slice(appCode.indexOf('const saveCaseToDB = async'), appCode.indexOf('const deleteCaseFromDB'));
    expect((payload.match(/^\s*meetings:/gm) || []).length).toBe(1);
  });

  it('1. contamination is reported, never silent', () => {
    expect(appCode).toContain("console.error(");
    const guard = appCode.slice(appCode.indexOf('const safeCase = caseForPersistence'), appCode.indexOf('const payload = {'));
    expect(guard).toContain('Blocked table-resident meeting');
    expect(guard).toContain('isTableResident');
  });

  it('4. a table-resident meeting cannot be persisted into cases.meetings', () => {
    const table = { id: 'meeting_t', storageHome: TABLE_HOME, caseId: null };
    const legacy = { id: '1786221627942', record: 'legacy' };
    const contaminated = { id: 'case-1', meetings: [legacy, table] };
    expect(caseForPersistence(contaminated).meetings).toEqual([legacy]);
    expect(() => assertNoTableResident([legacy, table])).toThrow(TableResidentInCaseError);
    // And a linked table meeting is stripped too — being case-linked does not
    // move it back into the JSONB column.
    const linked = { id: 'meeting_t2', storageHome: TABLE_HOME, caseId: 'case-1' };
    expect(caseForPersistence({ id: 'case-1', meetings: [linked] }).meetings).toEqual([]);
  });

  it('1. the guard is free for a clean case, so every existing write is unaffected', () => {
    const clean = { id: 'case-1', meetings: [{ id: 'legacy' }] };
    expect(caseForPersistence(clean)).toBe(clean);   // identical reference
  });

  it('1. what the boundary strips is decided by the explicit marker, not a heuristic', () => {
    // A meeting the write layer produced carries storageHome; the 884 legacy
    // embedded rows carry nothing, and must never be mistaken for table rows.
    expect(isTableResident({ id: 'm', storageHome: TABLE_HOME })).toBe(true);
    expect(isTableResident({ id: '1786221627942' })).toBe(false);
    expect(isTableResident({ id: 'm', caseId: null })).toBe(false);   // no caseId ≠ standalone
    expect(isTableResident(null)).toBe(false);
  });

  it('2. every cases.meetings writer reaches the database through the guarded boundary', () => {
    // The disposition of all 13 known direct-mutation sites is the same and is
    // structural: each rebuilds a CASE's own meetings array and hands it to
    // saveCases, which calls saveCaseToDB — the single guarded boundary. None of
    // them can reach the column by another route.
    ['src/App.jsx', 'src/components/caseTabs/MeetingsTab.jsx', 'src/components/NotetakerView.jsx']
      .forEach(path => {
        const src = readFileSync(path, 'utf8');
        // No file writes the cases table directly except through saveCaseToDB.
        const direct = (src.match(/from\(['"]cases['"]\)/g) || []).length;
        if (path === 'src/App.jsx') expect(direct).toBeGreaterThan(0); // load + saveCaseToDB + delete
        else expect(direct, path).toBe(0);
      });
    // saveCases is the only caller of saveCaseToDB for a changed case.
    expect(appCode).toContain('return saveCaseToDB(changed);');
  });

  it('2. no writer can address the standalone store through a case path', () => {
    // The inverse direction: the case-shaped writers never touch public.meetings.
    ['src/components/caseTabs/MeetingsTab.jsx', 'src/components/NotetakerView.jsx'].forEach(path => {
      const src = readFileSync(path, 'utf8');
      expect(src, path).not.toContain("from('meetings')");
      expect(src, path).not.toContain('standaloneMeetingWrites');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. creation', () => {
  it('5/6/7. informal, return and investigation each create exactly one row', async () => {
    for (const type of ['informal', 'return', 'investigation']) {
      const db = fakeDb();
      const r = await startStandaloneMeeting(db, { ...START, meetingTypeId: type, id: `meeting_${type}` });
      expect(r.ok, type).toBe(true);
      expect(r.outcome).toBe(STANDALONE_WRITE.OK);
      expect(db.rows).toHaveLength(1);
      expect(db.rows[0].meeting_type_id).toBe(type);
      expect(db.rows[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
      expect(db.calls.some(c => c.table === 'meetings')).toBe(true);
    }
  });

  it('8/9/10. case-required, appeal and deferred types are refused', async () => {
    const blocked = {
      disciplinary: STANDALONE_FAILURE.NOT_ELIGIBLE,
      'appeal-disciplinary': STANDALONE_FAILURE.NOT_ELIGIBLE,
      'appeal-grievance': STANDALONE_FAILURE.NOT_ELIGIBLE,
      'appeal-dismissal': STANDALONE_FAILURE.NOT_ELIGIBLE,
      'redundancy-atrisk': STANDALONE_FAILURE.NOT_ELIGIBLE,
      formal: STANDALONE_FAILURE.NOT_ELIGIBLE,
      grievance: STANDALONE_FAILURE.NOT_ELIGIBLE,
      probation: STANDALONE_FAILURE.NOT_ELIGIBLE,
      pdp: STANDALONE_FAILURE.NOT_ELIGIBLE,
    };
    for (const [type, reason] of Object.entries(blocked)) {
      const db = fakeDb();
      const r = await startStandaloneMeeting(db, { ...START, meetingTypeId: type, id: 'meeting_x' });
      expect(r.ok, type).toBe(false);
      expect(r.reason, type).toBe(reason);
      // Nothing was written, and no query was even attempted.
      expect(db.rows, type).toHaveLength(0);
      expect(db.calls, type).toHaveLength(0);
    }
  });

  it('8/9. the UI gate agrees with the write gate, type for type', () => {
    expect(caseRequirement('disciplinary')).toBe(CASE_REQUIREMENT.REQUIRED);
    expect(caseRequirementNotice('disciplinary', false).title).toBe('This meeting is part of a formal case');
    ['informal', 'return', 'investigation'].forEach(t => {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.STANDALONE_ALLOWED);
      expect(caseRequirementNotice(t, false), t).toBeNull();
    });
    ['formal', 'grievance'].forEach(t => {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.PENDING_ARCHITECTURE);
      expect(caseRequirementNotice(t, false), t).not.toBeNull();
    });
  });

  it('11. the id comes from newId("meeting") and nothing else', () => {
    const begin = appCode.slice(appCode.indexOf('const beginStandaloneMeeting ='), appCode.indexOf('const beginMeeting = async'));
    expect(begin).toContain('newId("meeting")');
    expect(begin).not.toContain('crypto.randomUUID');
    expect(begin).not.toContain('Date.now');
  });

  it('12/13/14. no case_id, no case, no embedded meeting', async () => {
    const db = fakeDb();
    await startStandaloneMeeting(db, { ...START, id: 'meeting_a' });
    expect(db.rows[0]).not.toHaveProperty('case_id');
    expect(db.calls.every(c => c.table === undefined || c.table === 'meetings')).toBe(true);
    // The row builder cannot express a parent or a link even if asked.
    const row = newStandaloneMeetingRow({ id: 'x', orgId: 'o', createdBy: 'u', meetingTypeId: 'informal', caseId: 'case-1' });
    expect(row).not.toHaveProperty('case_id');
    // And the standalone Start path in App.jsx creates no case.
    const begin = appCode.slice(appCode.indexOf('const beginStandaloneMeeting ='), appCode.indexOf('const beginMeeting = async'));
    ['createCase', 'saveCases', 'persistMeeting', 'stampNewMeeting', 'employeeName ==='].forEach(f =>
      expect(begin, f).not.toContain(f));
  });

  it('15. a double Start creates ONE row and keeps the first start instant', async () => {
    const db = fakeDb();
    const first = await startStandaloneMeeting(db, { ...START, id: 'meeting_same', startedAt: 'T1' });
    const second = await startStandaloneMeeting(db, { ...START, id: 'meeting_same', startedAt: 'T2_LATER' });
    expect(first.ok && second.ok).toBe(true);
    expect(second.outcome).toBe(STANDALONE_WRITE.ALREADY_EXISTS);
    expect(db.rows).toHaveLength(1);
    // The decisive assertion: the retry adopted the STORED instant, so a
    // double-click cannot move the recorded start of the meeting.
    expect(db.rows[0].started_at).toBe('T1');
    expect(second.meeting.startedAt).toBe('T1');
  });

  it('15. the pending-attempt ref is what makes the retry reuse one id', () => {
    const begin = appCode.slice(appCode.indexOf('const beginStandaloneMeeting ='), appCode.indexOf('const beginMeeting = async'));
    expect(begin).toContain('pendingStandaloneRef.current');
    expect(begin).toContain('? pendingStandaloneRef.current');
    // Cleared only after a confirmed success.
    expect(begin.indexOf('pendingStandaloneRef.current = null;')).toBeGreaterThan(begin.indexOf('if(!result.ok)'));
  });

  it('a failed Start does not enter the live screen and never falls back to a case', () => {
    const begin = appCode.slice(appCode.indexOf('const beginStandaloneMeeting ='), appCode.indexOf('const beginMeeting = async'));
    const failure = begin.slice(begin.indexOf('if(!result.ok)'), begin.indexOf('pendingStandaloneRef.current = null;'));
    expect(failure).toContain('return { ok: false');
    expect(failure).not.toContain('setScreen');
    expect(failure).not.toContain('saveCases');
  });

  it('requires an org and an authenticated user', async () => {
    const db = fakeDb();
    expect((await startStandaloneMeeting(db, { ...START, orgId: null, id: 'm' })).reason).toBe(STANDALONE_FAILURE.ORG_REQUIRED);
    expect((await startStandaloneMeeting(db, { ...START, createdBy: null, id: 'm' })).reason).toBe(STANDALONE_FAILURE.CREATOR_REQUIRED);
    expect((await startStandaloneMeeting(db, { ...START, id: '' })).reason).toBe(STANDALONE_FAILURE.ID_REQUIRED);
    expect(db.rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. resume', () => {
  const live = () => ({ id: 'meeting_live', org_id: 'org-a', case_id: null, meeting_type_id: 'informal',
    status: MEETING_STATUS.IN_PROGRESS, employee_name: 'Dana Keys', started_at: 'T_START',
    transcript: [{ speaker: 'Mgr', text: 'hello' }], created_by: 'user-1' });

  it('16/17. a refresh finds the same row, by id', async () => {
    const db = fakeDb([live()]);
    const r = await fetchStandaloneMeeting(db, 'meeting_live');
    expect(r.ok).toBe(true);
    expect(r.meeting.id).toBe('meeting_live');
    expect(r.meeting.storageHome).toBe(TABLE_HOME);
    expect(r.meeting.transcript).toHaveLength(1);
    expect(db.calls.find(c => c.op === 'from').table).toBe('meetings');
  });

  it('17/42. Resume resolves by id and provenance, never by employee name', () => {
    const resume = appCode.slice(appCode.indexOf('const resumeStandaloneMeeting ='), appCode.indexOf('const continueStandaloneReview ='));
    // Both reopen paths go through loadStandaloneMeeting, which is the single
    // place fetchStandaloneMeeting is called and failures are translated.
    expect(resume).toContain('await loadStandaloneMeeting(meetingId)');
    const loader = appCode.slice(appCode.indexOf('const loadStandaloneMeeting ='), appCode.indexOf('const applyStandaloneMeetingToLive ='));
    expect(loader).toContain('fetchStandaloneMeeting(supabase, meetingId)');
    expect(loader).toContain('describeStandaloneFailure(result.reason)');
    // Provenance is stamped by the shared applier, which cold-load recovery uses
    // too — the refresh fix made them one path rather than two.
    expect(resume).toContain('applyStandaloneMeetingToLive(meeting)');
    const applier = appCode.slice(appCode.indexOf('const applyStandaloneMeetingToLive ='),
                                  appCode.indexOf('const resumeStandaloneMeeting ='));
    expect(applier).toContain('meetingHome: TABLE_HOME');
    ['employeeName ===', 'toLowerCase', 'casesRef', 'cases.find']
      .forEach(f => { expect(resume, f).not.toContain(f); expect(applier, f).not.toContain(f); });
    // Discovery hands over an id only.
    expect(readFileSync('src/screens/MeetingsScreen.jsx', 'utf8')).toContain('onResume?.(entry.id)');
  });

  it('18. Resume does not restamp startedAt — there is no patch path to it', async () => {
    const db = fakeDb([live()]);
    await fetchStandaloneMeeting(db, 'meeting_live');
    expect(db.rows[0].started_at).toBe('T_START');
    // Structural: started_at is absent from the patch allow-list entirely.
    expect(meetingPatchToRow({ startedAt: 'HACKED' })).toEqual({});
    expect(meetingPatchToRow({ startedAt: 'X', endedAt: 'Y' })).toEqual({ ended_at: 'Y' });
  });

  it('16. a refresh mid-meeting keeps the notes — the draft liveness check asks the RIGHT store', async () => {
    // The defect this protects against: the embedded liveness check looks the
    // meeting up in cases.meetings, so for a table-resident meeting it found
    // nothing, concluded the meeting was no longer live, and DELETED the draft —
    // losing every note since Start, because the transcript is only persisted at
    // End. The check must be routed by storage home.
    // Anchored AFTER the start index: confirmDialog is called in several places
    // and an unanchored search finds an earlier one, collapsing the slice.
    const recStart = appCode.indexOf('const draftIsTableResident =');
    const recovery = appCode.slice(recStart, appCode.indexOf('const ok = await confirmDialog({', recStart));
    expect(recovery).toContain("draft.caseInfo?.meetingHome === TABLE_HOME");
    // The embedded check is now skipped for a table-resident draft...
    expect(recovery).toContain('if(draft.caseInfo?.meetingId && !draftIsTableResident)');
    // ...and the standalone one asks public.meetings for the same guarantee.
    expect(recovery).toContain('await fetchStandaloneMeeting(supabase, draft.caseInfo.meetingId)');
    expect(recovery).toContain("live.meeting.status !== MEETING_STATUS.IN_PROGRESS");
    expect(recovery).toContain('orgLsSet("compass_meeting_draft", null)');
    // The draft carries the storage home in the first place.
    expect(appCode).toContain('transcript, inputText, meetingType, caseInfo, meetingStartTime');
    expect(appCode).toContain('meetingHome: TABLE_HOME');
  });

  it('16. a draft for a meeting that is no longer live is still discarded, in both stores', async () => {
    // Both branches must reach the same discard, or a stale draft could be
    // offered for a meeting that has already been ended elsewhere.
    // Anchored AFTER the start index: confirmDialog is called in several places
    // and an unanchored search finds an earlier one, collapsing the slice.
    const recStart = appCode.indexOf('const draftIsTableResident =');
    const recovery = appCode.slice(recStart, appCode.indexOf('const ok = await confirmDialog({', recStart));
    expect((recovery.match(/orgLsSet\("compass_meeting_draft", null\)/g) || []).length).toBe(2);
    // And an unreadable meeting counts as not live, so RLS closes it too.
    expect(recovery).toContain('if(!live.ok ||');
  });

  it('19/20. an inaccessible meeting is indistinguishable from one that does not exist', async () => {
    const db = fakeDb([live()]);
    const hidden = await fetchStandaloneMeeting(db, 'meeting_in_org_b');   // RLS filtered it out
    const absent = await fetchStandaloneMeeting(db, 'meeting_never_made');
    expect(hidden).toEqual({ ok: false, reason: STANDALONE_FAILURE.NOT_FOUND });
    expect(hidden).toEqual(absent);
    // And the message reveals nothing either way.
    expect(describeStandaloneFailure(STANDALONE_FAILURE.NOT_FOUND))
      .toBe(describeStandaloneFailure(STANDALONE_FAILURE.DENIED));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. live writes route by storage home', () => {
  it('21/22/23. End writes the transcript to the TABLE, never to cases.meetings', async () => {
    const db = fakeDb([{ id: 'm', org_id: 'org-a', case_id: null, status: MEETING_STATUS.IN_PROGRESS, started_at: 'T1', created_by: 'u' }]);
    const r = await endStandaloneMeeting(db, { id: 'm', endedAt: 'T2', transcript: [{ speaker: 'A', text: 'x' }] });
    expect(r.ok).toBe(true);
    expect(db.rows[0].transcript).toEqual([{ speaker: 'A', text: 'x' }]);
    expect(db.calls.filter(c => c.table).every(c => c.table === 'meetings')).toBe(true);
  });

  it('23. the standalone End branch calls no case writer at all', () => {
    const branch = appCode.slice(appCode.indexOf('if(caseInfo.meetingHome === TABLE_HOME && caseInfo.meetingId)'),
                                 appCode.indexOf('} else if(caseInfo.caseId && caseInfo.meetingId) {'));
    expect(branch).toContain('endStandaloneMeeting(supabase');
    ['saveCases', 'transitionMeeting', 'persistMeeting', 'planMeetingEnd', 'casesRef']
      .forEach(f => expect(branch, f).not.toContain(f));
  });

  it('24. a failed End does not silently fall back to embedded storage', () => {
    const branch = appCode.slice(appCode.indexOf('if(caseInfo.meetingHome === TABLE_HOME && caseInfo.meetingId)'),
                                 appCode.indexOf('} else if(caseInfo.caseId && caseInfo.meetingId) {'));
    const failure = branch.slice(branch.indexOf('if(!ended.ok)'));
    expect(failure).toContain('return { ok: false');
    expect(failure).not.toContain('saveCases');
    expect(failure).not.toContain('transitionMeeting');
  });

  it('16. the REAL resolver has a standalone branch, and it is reached before any caseId test', () => {
    // WHY THIS TEST SHAPE. recordBootstrapRecovery.test.js drives a hand-written
    // MIRROR of resolveRecordRecovery. A mirror proves the intended logic is sound
    // but can never prove the shipped function still matches it — which is exactly
    // how the caseId-first redirect survived into production and dumped a live
    // standalone meeting onto Cases. These assertions are on the real source.
    const resolver = appCode.slice(appCode.indexOf('const resolveRecordRecovery = async'),
                                   appCode.indexOf('const m = (cs.meetings||[]).find'));
    expect(resolver.length).toBeGreaterThan(400);
    // Identity is the meeting id; parentage is not consulted to decide existence.
    expect(resolver).toContain('if(meetingHome === TABLE_HOME || (!caseId && meetingId))');
    expect(resolver).toContain('await fetchStandaloneMeeting(supabase, meetingId)');
    expect(resolver).toContain('applyStandaloneMeetingToLive(loaded.meeting)');
    // And it comes FIRST — before the branch that reads caseId.
    expect(resolver.indexOf('meetingHome === TABLE_HOME'))
      .toBeLessThan(resolver.indexOf('if(!caseId)'));
    // Nothing in the resolver may send a standalone meeting to Cases any more.
    const standaloneBranch = resolver.slice(resolver.indexOf('if(meetingHome === TABLE_HOME'),
                                            resolver.indexOf('if(!caseId)'));
    expect(standaloneBranch).not.toContain('SCREENS.CASES');
    expect(standaloneBranch).toContain('SCREENS.MEETINGS');
    // Only a live meeting is reopened as live.
    expect(standaloneBranch).toContain("declaredStatus(loaded.meeting) !== MEETING_STATUS.IN_PROGRESS");
  });

  it('16. the REAL url writer carries the meeting id without needing a case', () => {
    // recordBootstrapRecovery.test.js drives a MIRROR of this writer, which cannot
    // detect the shipped one regressing — the same blind spot that let the defect
    // ship. This asserts the real nav-sync effect.
    const sync = appCode.slice(appCode.indexOf("params.set('screen', screen);"),
                               appCode.indexOf('const nextSearch ='));
    expect(sync).toContain("if (screen === SCREENS.RECORD && caseInfo.meetingId) {");
    expect(sync).toContain("if (caseInfo.caseId) params.set('case', caseInfo.caseId);");
    expect(sync).toContain("params.set('meeting', caseInfo.meetingId);");
    expect(sync).toContain("if (caseInfo.meetingHome === TABLE_HOME) params.set('home', 'table');");
    // The production defect, asserted gone: the meeting param must not be
    // conditional on a case existing.
    expect(sync).not.toContain("screen === SCREENS.RECORD && caseInfo.caseId && caseInfo.meetingId");
    // And the reader parses the provenance back out.
    expect(appCode).toContain("meetingHome: params.get('home') === 'table' ? TABLE_HOME : null,");
  });

  it('16. standalone recovery is not held hostage to the cases load', () => {
    const effect = appCode.slice(appCode.indexOf('const isStandaloneNav = recordRecovery.meetingHome'),
                                 appCode.indexOf('resolveRecordRecovery(recordRecovery);'));
    expect(effect).toContain('if(casesLoading && !isStandaloneNav) return;');
  });

  it('11/12. typed notes are persisted to public.meetings and survive a reload', async () => {
    // The human UAT defect: two notes were typed into a live standalone meeting,
    // the page was reloaded, and BOTH were lost — the row had an empty transcript
    // because the only write points were Start and End. localStorage was the sole
    // store for the conversation.
    const db = fakeDb([{ id: 'm', org_id: 'org-a', case_id: null,
      status: MEETING_STATUS.IN_PROGRESS, started_at: 'T1', transcript: [], created_by: 'u' }]);
    const notes = [
      { speaker: 'Note', text: 'UAT NOTE ONE — MUST SURVIVE REFRESH' },
      { speaker: 'Note', text: 'UAT NOTE TWO — SAME MEETING MUST RESUME' },
    ];
    const saved = await persistStandaloneTranscript(db, { id: 'm', transcript: notes });
    expect(saved.ok).toBe(true);
    // Persisted to the TABLE, and to nothing else.
    expect(db.calls.filter(c => c.table).every(c => c.table === 'meetings')).toBe(true);
    // And a reload — a fresh fetch — returns both.
    const reloaded = await fetchStandaloneMeeting(db, 'm');
    expect(reloaded.meeting.transcript).toHaveLength(2);
    expect(reloaded.meeting.transcript[0].text).toContain('UAT NOTE ONE');
    expect(reloaded.meeting.transcript[1].text).toContain('UAT NOTE TWO');
    // The lifecycle did not move as a side effect of saving notes.
    expect(db.rows[0].status).toBe(MEETING_STATUS.IN_PROGRESS);
    expect(db.rows[0].started_at).toBe('T1');
  });

  it('11. a late note autosave cannot resurrect a meeting that has ended', async () => {
    const db = fakeDb([{ id: 'm', org_id: 'org-a', case_id: null,
      status: MEETING_STATUS.REVIEW_DRAFT, started_at: 'T1', ended_at: 'T2',
      transcript: [{ speaker: 'A', text: 'final' }], created_by: 'u' }]);
    const r = await persistStandaloneTranscript(db, { id: 'm', transcript: [{ speaker: 'A', text: 'stale' }] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(STANDALONE_FAILURE.STALE_STATUS);
    expect(db.rows[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(db.rows[0].transcript).toEqual([{ speaker: 'A', text: 'final' }]);
  });

  it('11. the autosave is wired, debounced, and standalone-only', () => {
    // End-anchored on CODE, not a comment: appCode has comment lines stripped, so
    // a comment anchor resolves to -1 and the slice silently runs to end of file.
    const autoStart = appCode.indexOf('const liveNotesTimerRef =');
    const autosave = appCode.slice(autoStart,
      appCode.indexOf('const draft = orgLs("compass_meeting_draft", null);', autoStart));
    expect(autosave.length).toBeGreaterThan(200);
    // Asserted as the awaited expression, not merely a substring somewhere in the
    // block — a call wrapped in dead code would otherwise satisfy it.
    expect(autosave).toContain('const result = await persistStandaloneTranscript(supabase, {');
    expect(autosave).toContain('caseInfo.meetingHome !== TABLE_HOME || !caseInfo.meetingId) return;');
    expect(autosave).toContain('1500');
    // Only writes when something actually changed, and only records success.
    expect(autosave).toContain("if(serialised === liveNotesSavedRef.current) return;");
    expect(autosave).toContain('if(result.ok)');
    // It must never reach a case writer.
    ['saveCases', 'transitionMeeting(', 'persistMeeting'].forEach(f => expect(autosave, f).not.toContain(f));
  });

  it('a successful save stops the browser claiming the notes are unsaved', () => {
    const guard = appCode.slice(appCode.indexOf("const standaloneLive = caseInfo.meetingHome === TABLE_HOME;"),
                                appCode.indexOf("window.addEventListener('beforeunload', handler);"));
    // Dirty for a standalone meeting means genuinely unsaved, not merely non-empty.
    expect(guard).toContain("JSON.stringify(transcript) !== liveNotesSavedRef.current");
    // The embedded path is unchanged: its notes really are browser-only until End.
    expect(guard).toContain('transcript.length > 0 || !!inputText.trim()');
  });

  it('the live transcript is React state during the meeting, so nothing writes per utterance', () => {
    const addUtterance = appCode.slice(appCode.indexOf('const addUtterance = async text =>'), appCode.indexOf('const handleKeyDown ='));
    ['saveCases', 'endStandaloneMeeting', 'transitionMeeting', 'from(\'meetings\')']
      .forEach(f => expect(addUtterance, f).not.toContain(f));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. end', () => {
  const liveRow = () => ({ id: 'm', org_id: 'org-a', case_id: null, status: MEETING_STATUS.IN_PROGRESS,
    started_at: 'T_START', ended_at: null, created_by: 'u' });

  it('25/26/27/28. patches the same row into review_draft, stamping ended_at only', async () => {
    const db = fakeDb([liveRow()]);
    const r = await endStandaloneMeeting(db, { id: 'm', endedAt: 'T_END', transcript: [] });
    expect(r.ok).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].id).toBe('m');
    expect(db.rows[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(db.rows[0].ended_at).toBe('T_END');
    expect(db.rows[0].started_at).toBe('T_START');   // untouched
  });

  it('26. End does NOT complete the meeting', async () => {
    const db = fakeDb([liveRow()]);
    await endStandaloneMeeting(db, { id: 'm', endedAt: 'T_END' });
    expect(db.rows[0].status).not.toBe(MEETING_STATUS.COMPLETED);
  });

  it('29. a duplicate End writes nothing and does not move ended_at', async () => {
    const db = fakeDb([liveRow()]);
    await endStandaloneMeeting(db, { id: 'm', endedAt: 'T_END' });
    const again = await endStandaloneMeeting(db, { id: 'm', endedAt: 'T_MUCH_LATER' });
    expect(again.ok).toBe(true);
    expect(again.outcome).toBe(STANDALONE_WRITE.ALREADY_IN_STATE);
    expect(db.rows[0].ended_at).toBe('T_END');       // not restamped
    expect(db.rows[0].started_at).toBe('T_START');
  });

  it('cannot drag a completed meeting backwards into review', async () => {
    const db = fakeDb([{ ...liveRow(), status: MEETING_STATUS.COMPLETED, ended_at: 'T_END' }]);
    const r = await endStandaloneMeeting(db, { id: 'm', endedAt: 'T_LATER' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(STANDALONE_FAILURE.STALE_STATUS);
    expect(db.rows[0].status).toBe(MEETING_STATUS.COMPLETED);
    expect(db.rows[0].ended_at).toBe('T_END');
  });

  it('a transition cannot be tricked into a different target status by its patch', async () => {
    const db = fakeDb([liveRow()]);
    await transitionStandaloneMeeting(db, {
      id: 'm', allowedFrom: [MEETING_STATUS.IN_PROGRESS], toStatus: MEETING_STATUS.REVIEW_DRAFT,
      patch: { status: MEETING_STATUS.COMPLETED },
    });
    expect(db.rows[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. review handoff and draft persistence', () => {
  const draftRow = () => ({ id: 'm', org_id: 'org-a', case_id: null, status: MEETING_STATUS.REVIEW_DRAFT,
    started_at: 'T1', ended_at: 'T2', review_draft: null, created_by: 'u' });

  it('30. Review opens the same table meeting, by id', () => {
    const cont = appCode.slice(appCode.indexOf('const continueStandaloneReview ='), appCode.indexOf('const resolveRecordRecovery ='));
    expect(cont).toContain('await loadStandaloneMeeting(meetingId)');
    expect(cont).toContain('meetingHome: TABLE_HOME');
    expect(cont).toContain('setScreen(SCREENS.REVIEW);');
    expect(cont).not.toContain('casesRef');
  });

  it('31/32. the draft persists server-side to public.meetings.review_draft', async () => {
    const db = fakeDb([draftRow()]);
    const r = await persistStandaloneReviewDraft(db, { id: 'm', reviewDraft: { record: 'edited by hand' } });
    expect(r.ok).toBe(true);
    expect(db.rows[0].review_draft).toEqual({ record: 'edited by hand' });
    expect(db.calls.filter(c => c.table).every(c => c.table === 'meetings')).toBe(true);
    // Reopening returns the edit — the refresh case.
    const back = await fetchStandaloneMeeting(db, 'm');
    expect(back.meeting.reviewDraft).toEqual({ record: 'edited by hand' });
  });

  it('33. autosave cannot complete the meeting', async () => {
    const db = fakeDb([draftRow()]);
    await persistStandaloneReviewDraft(db, { id: 'm', reviewDraft: { record: 'x' } });
    expect(db.rows[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    // It is a self-transition, so a meeting that has left review refuses the draft
    // instead of being pulled back.
    const gone = fakeDb([{ ...draftRow(), status: MEETING_STATUS.COMPLETED }]);
    const r = await persistStandaloneReviewDraft(gone, { id: 'm', reviewDraft: { record: 'stale' } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(STANDALONE_FAILURE.STALE_STATUS);
    expect(gone.rows[0].review_draft).toBeNull();
  });

  it('31. autosave is routed by storage home, and the standalone branch needs no caseId', () => {
    const persist = appCode.slice(appCode.indexOf('const persistReviewDraft = async'), appCode.indexOf('// Debounced autosave'));
    expect(persist).toContain('const standalone = caseInfo.meetingHome === TABLE_HOME;');
    expect(persist).toContain('persistStandaloneReviewDraft(supabase');
    expect(persist).toContain('if(!meetingId || (!standalone && !caseId))');
    // The suspend-on-conflict rule is shared, not duplicated: both stores report
    // the same "stale_status" string, so one branch handles both.
    expect(persist).toContain('setDraftStatus("saving")');
  });

  it('34/35. the employee-facing record still excludes internal advisory content', () => {
    const cont = appCode.slice(appCode.indexOf('const continueStandaloneReview ='), appCode.indexOf('const resolveRecordRecovery ='));
    // NEW-39: split on read, employee-facing into the editable surface, internal
    // into advisorNotes — the same rule as the embedded reopen.
    expect(cont).toContain('splitMeetingRecord(existingDraft.record)');
    expect(cont).toContain('setReviewOutput(restored.employeeFacing)');
    expect(cont).toContain('setAdvisorNotes(existingDraft.advisorNotes || restored.internal)');
  });

  it('a standalone record is not offered a confirm or signature action it cannot perform', () => {
    const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
    expect(review).toContain('{standalone&&reviewOutput&&!editingRecord&&(');
    expect(review).toContain('{!standalone&&!signatureEligible&&reviewOutput&&!editingRecord&&(');
    expect(review).toContain('{!standalone&&signatureEligible&&reviewOutput&&!editingRecord&&(');
    expect(review).toContain('{!standalone && (<>');
    // And it says why, rather than leaving a missing button unexplained.
    expect(review).toContain("can't be confirmed or sent for signature yet");
    expect(review).toContain('saved automatically');
  });

  it('36/37. no Quality Check blocking popup returns, and advisory mode is intact', () => {
    const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
    // Assert against EXECUTABLE lines only. A comment legitimately names the
    // thing the code must not be — line 225 explains that the advisory panel IS
    // the end-meeting quality check, now non-blocking — and asserting over
    // comments punishes the explanation rather than the behaviour.
    const code = review.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(code).not.toMatch(/proceed anyway/i);
    expect(code).not.toMatch(/setShowQualityCheck|qualityCheckModal|blockOnGaps/i);
    // The non-blocking advisory panel remains, rendered inline and never as a
    // gate: nothing conditions the save/send blocks on reviewGaps being empty.
    expect(code).toContain('reviewGaps.length>0&&!editingRecord&&(');
    expect(code).not.toMatch(/reviewGaps\.length\s*===\s*0\s*&&/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G/H. wiring and regression boundaries', () => {
  it('38/40. the live and review states are the two that need attention', () => {
    const discovery = readFileSync('src/lib/meetingDiscovery.js', 'utf8');
    expect(discovery).toContain("ACTIVATED_ACTIONS = Object.freeze([\"resume\", \"continue_review\"])");
  });

  it('39/41. the surface routes each action to the matching handler', () => {
    const screenSrc = readFileSync('src/screens/MeetingsScreen.jsx', 'utf8');
    expect(screenSrc).toContain('if (entry.primaryAction.action === "resume") onResume?.(entry.id);');
    expect(screenSrc).toContain('if (entry.primaryAction.action === "continue_review") onContinueReview?.(entry.id);');
    expect(app).toContain('onResume={resumeStandaloneMeeting}');
    expect(app).toContain('onContinueReview={continueStandaloneReview}');
  });

  it('43. the embedded Start path is untouched by the standalone branch', () => {
    // Phase 2.1's refusal still stands for every type that is not eligible, and
    // the embedded cold start still goes through persistMeeting.
    expect(appCode).toContain('showToast(describeMeetingWriteFailure(WRITE_FAILURE.PARENT_REQUIRED), "error");');
    expect(appCode).toContain('const result = await persistMeeting({ cases: casesRef.current, caseId, meeting, saveCases });');
    expect(appCode).toContain('if(isStandaloneEligible(type?.id))');
  });

  it('44/45. scheduling and appeal-chair paths are not reachable from a standalone meeting', () => {
    const begin = appCode.slice(appCode.indexOf('const beginStandaloneMeeting ='), appCode.indexOf('const beginMeeting = async'));
    // chairUserId is never set on a standalone meeting, so the appeal-chair
    // trigger's subject matter cannot be created here — and the database CHECK
    // rejects appeal types outright.
    expect(begin).not.toContain('appealManagerId');
    expect(begin).not.toContain('chairUserId:');
    expect(begin).not.toContain('schedule');
  });

  it('17-in-4C.2 terms: no standalone module touches the cases table', () => {
    ['src/lib/standaloneMeetingWrites.js', 'src/lib/standaloneMeetings.js',
      'src/lib/meetingTableGateway.js', 'src/lib/meetingDiscovery.js'].forEach(path => {
      const src = readFileSync(path, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      expect(src, path).not.toContain("from('cases')");
      expect(src, path).not.toContain('cases.meetings');
      expect(src, path).not.toContain('saveCases');
    });
  });

  it('48. DSAR still receives standalone meetings as their own category', () => {
    const dsar = readFileSync('src/lib/dsarCompile.js', 'utf8');
    expect(dsar).toContain('standaloneMeetings = []');
    expect(dsar).toContain('standaloneMeetings: subjectStandaloneMeetings');
    expect(dsar).toContain('standalone: true');
  });
});
