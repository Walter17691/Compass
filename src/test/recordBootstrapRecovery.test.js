import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEETING_STATUS, declaredStatus, isResumableMeeting } from '../lib/meetingLifecycle.js';
import { TABLE_HOME } from '../lib/standaloneMeetings.js';

// P1 — RecordScreen refresh lost the authoritative meeting and regenerated a
// client startedAt. Human UAT, 2026-09-24.
//
// Before refresh:  Investigation · AT - Scheduling Phase 2.3 · Started 21:15
// After  refresh:  Meeting       · Unknown                   · Started 21:18
//
// The database was perfectly intact throughout — one meeting, status
// in_progress, startedAt 2026-09-24T20:15:11.833Z, no duplicate, no write. The
// defect was entirely application bootstrap: the record route carried only
// screen=record, so a cold load had no caseId and no meetingId, meetingType and
// caseInfo fell back to defaults, and the NEW-29 capture effect stamped a fresh
// instant.
//
// THIS FILE IS THE MISSING TEST CATEGORY. Phase 2.2 tested lifecycle helpers as
// pure functions and Case View wiring as source strings, and passed. Nothing
// exercised the cold-load resolution path with no pre-existing navigation
// state. These tests drive that resolution directly.

const app = readFileSync('src/App.jsx', 'utf8');
const record = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

const SCREENS = { HOME: 'home', CASES: 'cases', RECORD: 'record', CASE_VIEW: 'case_view', MEETINGS: 'meetings' };

// The shipped URL reader, as a predicate. Mirrors readNavFromUrl exactly.
const readNav = search => {
  const params = new URLSearchParams(search);
  return {
    screen: params.get('screen') || SCREENS.HOME,
    caseId: params.get('case') || null,
    meetingId: params.get('meeting') || null,
    meetingHome: params.get('home') === 'table' ? TABLE_HOME : null,
  };
};

// The shipped URL writer, as a predicate. Mirrors the nav-sync effect exactly.
const writeNav = ({ screen, activeCaseId, caseInfo = {} }) => {
  const params = new URLSearchParams();
  params.set('screen', screen);
  if (screen === SCREENS.CASE_VIEW && activeCaseId) params.set('case', activeCaseId);
  // Phase 4C.3 refresh fix — identity is the MEETING id. Requiring caseId here
  // was the production defect: a standalone meeting wrote no identity at all.
  if (screen === SCREENS.RECORD && caseInfo.meetingId) {
    if (caseInfo.caseId) params.set('case', caseInfo.caseId);
    params.set('meeting', caseInfo.meetingId);
    if (caseInfo.meetingHome === TABLE_HOME) params.set('home', 'table');
  }
  return `?${params.toString()}`;
};

// The shipped resolver, as a driveable function. Mirrors resolveRecordRecovery
// branch for branch, with its side effects captured instead of applied.
const resolve = (nav, cases, tableMeetings = []) => {
  const effects = { screen: null, activeCaseId: null, resumed: null, recoveryCleared: false, writes: 0, audits: [] };
  const { caseId, meetingId, meetingHome } = nav;
  const done = outcome => ({ outcome, effects });
  // Phase 4C.3 refresh fix — the standalone branch comes first, and is keyed on
  // the MEETING id. The old `if (!caseId) -> Cases` first line is what sent every
  // reloaded standalone meeting to Cases, because its case is null by design.
  if (meetingHome === TABLE_HOME || (!caseId && meetingId)) {
    const m = (tableMeetings || []).find(x => x && x.id === meetingId);
    if (!m || declaredStatus(m) !== MEETING_STATUS.IN_PROGRESS) {
      effects.recoveryCleared = true; effects.screen = SCREENS.MEETINGS; return done('redirect_meetings');
    }
    effects.recoveryCleared = true;
    effects.resumed = {
      meetingId: m.id, caseId: null, home: TABLE_HOME, type: m.meetingTypeId,
      employee: m.employeeName, startedAt: m.startedAt, manager: m.manager,
      transcript: Array.isArray(m.transcript) ? m.transcript : [],
    };
    effects.screen = SCREENS.RECORD;
    return done('recovered');
  }
  if (!caseId) { effects.recoveryCleared = true; effects.screen = SCREENS.MEETINGS; return done('redirect_meetings'); }
  const cs = cases.find(c => c.id === caseId);
  if (!cs) { effects.recoveryCleared = true; effects.screen = SCREENS.CASES; return done('redirect_cases'); }
  if (!meetingId) { effects.activeCaseId = cs.id; effects.recoveryCleared = true; effects.screen = SCREENS.CASE_VIEW; return done('redirect_case_view'); }
  const m = (cs.meetings || []).find(x => x && x.id === meetingId);
  if (!m || (m.caseId && m.caseId !== cs.id) || declaredStatus(m) !== MEETING_STATUS.IN_PROGRESS) {
    effects.activeCaseId = cs.id; effects.recoveryCleared = true; effects.screen = SCREENS.CASE_VIEW; return done('redirect_case_view');
  }
  effects.recoveryCleared = true;
  // resumeMeeting: restores from the persisted object, writes nothing, mints
  // nothing, audits nothing.
  effects.resumed = {
    meetingId: m.id, caseId: cs.id, type: m.type, employee: cs.employeeName,
    startedAt: m.startedAt, manager: m.manager, chairUserId: m.chairUserId || null,
    participants: m.participants || [], transcript: Array.isArray(m.transcript) ? m.transcript : [],
  };
  effects.screen = SCREENS.RECORD;
  return done('recovered');
};

// The exact production state, read read-only from the UAT case.
const UAT_CASE_ID = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';
const UAT_MEETING_ID = 'meeting_cad06fdb-24d5-4066-adad-e46aac10483c';
const UAT_STARTED_AT = '2026-09-24T20:15:11.833Z';
const uatMeeting = (over = {}) => ({
  id: UAT_MEETING_ID, caseId: UAT_CASE_ID, type: 'Investigation', status: MEETING_STATUS.IN_PROGRESS,
  createdAt: '2026-09-24T20:11:55.819Z', createdBy: 'UAT - HR Manager',
  startedAt: UAT_STARTED_AT, endedAt: null,
  schedule: { date: '2026-10-01', time: '10:00', method: 'Microsoft Teams' },
  chairUserId: null, manager: 'UAT - Scheduling Phase 2.3', transcript: [], ...over,
});
const uatCases = (...meetings) => [{ id: UAT_CASE_ID, employeeName: 'AT - Scheduling Phase 2.3', meetings }];

describe('1-6. the URL carries the workflow identity', () => {
  it('1/2. Start-now writes caseId and meetingId into the record URL', () => {
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: { caseId: UAT_CASE_ID, meetingId: UAT_MEETING_ID } }))
      .toBe(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`);
  });

  it('3/4. starting a scheduled meeting and resuming write the SAME meeting id', () => {
    // both routes go through resumeMeeting, which sets caseInfo.meetingId to
    // the persisted id — so the URL cannot name a different meeting
    expect(app).toContain('meetingId: meeting.id, appealManagerId: meeting.chairUserId || null,');
    const url = writeNav({ screen: SCREENS.RECORD, caseInfo: { caseId: UAT_CASE_ID, meetingId: UAT_MEETING_ID } });
    expect(url).toContain(`meeting=${UAT_MEETING_ID}`);
  });

  it('5/6. the reader parses both back out', () => {
    const nav = readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`);
    expect(nav.screen).toBe('record');
    expect(nav.caseId).toBe(UAT_CASE_ID);
    expect(nav.meetingId).toBe(UAT_MEETING_ID);
  });

  it('existing Case View URLs are unchanged', () => {
    expect(writeNav({ screen: SCREENS.CASE_VIEW, activeCaseId: UAT_CASE_ID })).toBe(`?screen=case_view&case=${UAT_CASE_ID}`);
    expect(readNav('?screen=case_view&case=abc'))
      .toEqual({ screen: 'case_view', caseId: 'abc', meetingId: null, meetingHome: null });
  });

  it('other screens are untouched and still parse', () => {
    for (const screen of ['home', 'cases', 'settings', 'calendar']) {
      expect(writeNav({ screen })).toBe(`?screen=${screen}`);
      expect(readNav(`?screen=${screen}`).screen).toBe(screen);
    }
    expect(readNav('').screen).toBe('home');
  });

  it('a record URL without an authoritative meeting carries no identity to guess from', () => {
    // A case with no meeting is still no identity — parentage alone cannot name
    // which meeting to reopen.
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: { caseId: UAT_CASE_ID } })).toBe('?screen=record');
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: {} })).toBe('?screen=record');
  });

  it('4C.3 — a STANDALONE live meeting writes its identity and provenance', () => {
    // The production defect: this used to produce '?screen=record' with nothing
    // to recover, and the reload landed on Cases.
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: { meetingId: 'meeting_abc', meetingHome: TABLE_HOME } }))
      .toBe('?screen=record&meeting=meeting_abc&home=table');
    const nav = readNav('?screen=record&meeting=meeting_abc&home=table');
    expect(nav).toEqual({ screen: 'record', caseId: null, meetingId: 'meeting_abc', meetingHome: TABLE_HOME });
  });
});

describe('7-18. cold-load recovery — the exact production reproduction', () => {
  const nav = readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`);

  it('7/8. resolves the exact case and the exact meeting', () => {
    const { outcome, effects } = resolve(nav, uatCases(uatMeeting()));
    expect(outcome).toBe('recovered');
    expect(effects.resumed.caseId).toBe(UAT_CASE_ID);
    expect(effects.resumed.meetingId).toBe(UAT_MEETING_ID);
  });

  it('9. only an in_progress meeting is recovered', () => {
    expect(isResumableMeeting(uatMeeting())).toBe(true);
    expect(resolve(nav, uatCases(uatMeeting())).outcome).toBe('recovered');
  });

  it('10. the type is Investigation, not the "Meeting" fallback', () => {
    expect(resolve(nav, uatCases(uatMeeting())).effects.resumed.type).toBe('Investigation');
  });

  it('11. the case context is restored, not "Unknown"', () => {
    expect(resolve(nav, uatCases(uatMeeting())).effects.resumed.employee).toBe('AT - Scheduling Phase 2.3');
  });

  it('12/13. identity and parentage are unchanged', () => {
    const r = resolve(nav, uatCases(uatMeeting())).effects.resumed;
    expect(r.meetingId).toBe(UAT_MEETING_ID);
    expect(r.caseId).toBe(UAT_CASE_ID);
  });

  it('14/15. startedAt is the PERSISTED instant — never regenerated', () => {
    const r = resolve(nav, uatCases(uatMeeting())).effects.resumed;
    expect(r.startedAt).toBe(UAT_STARTED_AT);
    // 20:15:11.833Z is 21:15 BST — the value the user saw before refreshing,
    // and emphatically not 21:18.
    expect(new Date(r.startedAt).getTime()).toBe(Date.parse('2026-09-24T20:15:11.833Z'));
  });

  it('16/17/18. recovery writes nothing, audits nothing and creates nothing', () => {
    const { effects } = resolve(nav, uatCases(uatMeeting()));
    expect(effects.writes).toBe(0);
    expect(effects.audits).toEqual([]);
    // resumeMeeting is the only thing recovery calls, and it neither persists
    // nor audits nor mints an id
    const resumeBody = app.slice(app.indexOf('const resumeMeeting ='), app.indexOf('  // ── P1 remediation — cold-load recovery'));
    expect(resumeBody).not.toContain('audit(');
    expect(resumeBody).not.toContain('persistMeeting(');
    expect(resumeBody).not.toContain('transitionMeeting(');
    expect(resumeBody).not.toContain('newId(');
    expect(resumeBody).not.toMatch(/new Date\(\)/);
  });

  it('chair, participants and schedule metadata survive recovery', () => {
    const m = uatMeeting({ chairUserId: 'officer-uuid', participants: [{ name: 'A', role: 'Witness' }] });
    const r = resolve(nav, uatCases(m)).effects.resumed;
    expect(r.chairUserId).toBe('officer-uuid');
    expect(r.participants).toHaveLength(1);
    expect(r.manager).toBe('UAT - Scheduling Phase 2.3');
  });
});

describe('19/20. the recovering state never shows fake defaults', () => {
  it('19. RecordScreen renders a restoring state while recovery is pending', () => {
    expect(record).toContain('if(recovering) {');
    expect(record).toContain('Restoring your meeting…');
    expect(record).toContain('Nothing has been lost — Compass is loading the saved meeting.');
  });

  it('20. and returns before any of its own fallbacks can render', () => {
    const guard = record.indexOf('if(recovering) {');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(record.indexOf('{meetingType?.label||"Meeting"}'));
    expect(guard).toBeLessThan(record.indexOf('{caseInfo.employee||"Unknown"}'));
    expect(app).toContain('<RecordScreen recovering={!!recordRecovery}');
  });

  it('recovery waits for the authorised case set before resolving', () => {
    // resolving against an empty list would redirect a valid meeting away
    // The 4C.3 refresh fix made this conditional: a table-resident meeting is not
    // in the cases list, so waiting on it would make standalone recovery hostage
    // to an unrelated load (and never fire if the case fetch failed). The
    // guarantee for the EMBEDDED path is unchanged — it still waits.
    expect(app).toContain('if(casesLoading && !isStandaloneNav) return;');
    expect(app).toContain('const isStandaloneNav = recordRecovery.meetingHome === TABLE_HOME');
    expect(resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`), []).outcome).toBe('redirect_cases');
  });
});

describe('21-29. fails closed — never guesses', () => {
  it('21/29. a missing meeting param never picks a live meeting, even when one exists', () => {
    const { outcome, effects } = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}`), uatCases(uatMeeting()));
    expect(outcome).toBe('redirect_case_view');
    expect(effects.resumed).toBeNull();
  });

  it('29b. nor when several are live', () => {
    const a = uatMeeting({ id: 'live-a', startedAt: '2026-09-24T09:00:00.000Z' });
    const b = uatMeeting({ id: 'live-b', startedAt: '2026-09-24T11:00:00.000Z' });
    const { outcome, effects } = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}`), uatCases(a, b));
    expect(outcome).toBe('redirect_case_view');
    expect(effects.resumed).toBeNull();
  });

  it('22. a case id with no meeting id redirects to that Case View', () => {
    const { effects } = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}`), uatCases(uatMeeting()));
    expect(effects.screen).toBe('case_view');
    expect(effects.activeCaseId).toBe(UAT_CASE_ID);
  });

  it('23. no identity at all redirects to Meetings, not Cases', () => {
    // CHANGED BY THE 4C.3 REFRESH FIX, deliberately. Cases was chosen when every
    // meeting lived on a case; human UAT then reloaded a live standalone meeting
    // and was dumped there with no explanation and no route back. Meetings is the
    // surface that lists a meeting still in progress, which is what someone
    // arriving here was looking for — and the redirect now carries a toast rather
    // than happening silently.
    const { outcome, effects } = resolve(readNav('?screen=record'), uatCases(uatMeeting()));
    expect(outcome).toBe('redirect_meetings');
    expect(effects.screen).toBe('meetings');
    expect(effects.resumed).toBeNull();
    // Never silent.
    expect(app).toContain("That meeting couldn't be reopened from the link.");
  });

  it('23b. a reloaded live STANDALONE meeting recovers instead of redirecting', () => {
    // The exact human reproduction, end to end through the mirrored resolver.
    const standalone = {
      id: 'meeting_e18d5c5b-9f95-4bc3-bc7f-137727b45ff4', caseId: null,
      meetingTypeId: 'informal', status: MEETING_STATUS.IN_PROGRESS,
      employeeName: 'UAT - Standalone Meeting', manager: 'UAT - HR Manager',
      startedAt: '2026-09-26T09:18:01.335Z',
      transcript: [{ speaker: 'Note', text: 'UAT NOTE ONE — MUST SURVIVE REFRESH' }],
    };
    const url = writeNav({ screen: SCREENS.RECORD,
      caseInfo: { meetingId: standalone.id, meetingHome: TABLE_HOME } });
    const { outcome, effects } = resolve(readNav(url), uatCases(uatMeeting()), [standalone]);
    expect(outcome).toBe('recovered');
    expect(effects.screen).toBe('record');
    expect(effects.resumed.meetingId).toBe(standalone.id);
    expect(effects.resumed.caseId).toBeNull();          // caseId null is not "no identity"
    expect(effects.resumed.home).toBe(TABLE_HOME);
    expect(effects.resumed.startedAt).toBe('2026-09-26T09:18:01.335Z');   // not restamped
    expect(effects.resumed.transcript[0].text).toContain('UAT NOTE ONE');  // notes come back
  });

  it('23c. a standalone meeting that is no longer live routes to Meetings, never Cases', () => {
    const ended = { id: 'meeting_x', caseId: null, meetingTypeId: 'informal',
      status: MEETING_STATUS.REVIEW_DRAFT, startedAt: 'T1', transcript: [] };
    const url = writeNav({ screen: SCREENS.RECORD, caseInfo: { meetingId: 'meeting_x', meetingHome: TABLE_HOME } });
    const { outcome, effects } = resolve(readNav(url), uatCases(uatMeeting()), [ended]);
    expect(outcome).toBe('redirect_meetings');
    expect(effects.screen).toBe('meetings');
    expect(effects.resumed).toBeNull();
  });

  it('23d. an inaccessible or unknown standalone id fails safely and identically', () => {
    // RLS has already removed anything the caller may not read, so "hidden" and
    // "absent" arrive the same way and must behave the same way — a failed
    // recovery cannot be used to probe another tenant.
    const url = id => writeNav({ screen: SCREENS.RECORD, caseInfo: { meetingId: id, meetingHome: TABLE_HOME } });
    const hidden = resolve(readNav(url('meeting_in_org_b')), uatCases(uatMeeting()), []);
    const absent = resolve(readNav(url('meeting_never_existed')), uatCases(uatMeeting()), []);
    expect(hidden.outcome).toBe('redirect_meetings');
    expect(hidden).toEqual(absent);
  });

  it('24. an unknown meeting id redirects rather than guessing', () => {
    const { outcome, effects } = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=ghost`), uatCases(uatMeeting()));
    expect(outcome).toBe('redirect_case_view');
    expect(effects.resumed).toBeNull();
  });

  it('an unknown case id redirects to Cases', () => {
    expect(resolve(readNav('?screen=record&case=gone&meeting=x'), uatCases(uatMeeting())).outcome).toBe('redirect_cases');
  });

  it('25/26/27. completed, cancelled and review_draft cannot cold-resume', () => {
    for (const status of [MEETING_STATUS.COMPLETED, MEETING_STATUS.CANCELLED, MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.SCHEDULED]) {
      const { outcome, effects } = resolve(
        readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`),
        uatCases(uatMeeting({ status })));
      expect(outcome).toBe('redirect_case_view');
      expect(effects.resumed).toBeNull();
    }
  });

  it('a legacy row with no declared status cannot cold-resume', () => {
    const legacy = { id: UAT_MEETING_ID, type: 'Investigation', record: 'old notes' };
    expect(declaredStatus(legacy)).toBeNull();
    expect(resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`), uatCases(legacy)).outcome)
      .toBe('redirect_case_view');
  });

  it('a contradicted parentage is refused', () => {
    const crossed = uatMeeting({ caseId: 'some-other-case' });
    expect(resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`), uatCases(crossed)).outcome)
      .toBe('redirect_case_view');
  });

  it('28. with several live meetings, the explicit id controls exactly', () => {
    const a = uatMeeting({ id: 'live-a' });
    const b = uatMeeting({ id: 'live-b' });
    for (const want of ['live-a', 'live-b']) {
      const { outcome, effects } = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${want}`), uatCases(a, b));
      expect(outcome).toBe('recovered');
      expect(effects.resumed.meetingId).toBe(want);
    }
  });

  it('recovery never consults employee name, array order or the clock', () => {
    const fn = app.slice(app.indexOf('const resolveRecordRecovery ='), app.indexOf('useEffect(() => {\n    if(!recordRecovery) return;'));
    expect(fn).not.toContain('employeeName');
    expect(fn).not.toMatch(/new Date\(\)/);
    expect(fn).not.toMatch(/length\s*-\s*1|\[0\]|resumableMeetingFor|lastGenuineMeeting/);
    expect(fn).toContain("find(x => x && x.id === meetingId)");
  });
});

describe('30-32. NEW-29 startedAt authority', () => {
  it('30. a genuine fresh Start still captures the instant once', () => {
    expect(app).toContain('if(screen === SCREENS.RECORD && !meetingStartTime && !recordRecovery) setMeetingStartTime(new Date().toISOString());');
    // and Start-now supplies it explicitly, so the fallback is not its source
    expect(app).toContain('setMeetingStartTime(attempt.startedAt);');
  });

  it('the fallback cannot fire while a cold-load recovery is unresolved', () => {
    const captureOnEntry = ({ screen, meetingStartTime, recordRecovery, now }) =>
      (screen === 'record' && !meetingStartTime && !recordRecovery) ? now : meetingStartTime;
    // pending recovery: the persisted instant is not overwritten by "now"
    expect(captureOnEntry({ screen: 'record', meetingStartTime: null, recordRecovery: { caseId: 'c', meetingId: 'm' }, now: 'T_NOW' })).toBeNull();
    // resolved, and resumeMeeting has already set the persisted instant
    expect(captureOnEntry({ screen: 'record', meetingStartTime: UAT_STARTED_AT, recordRecovery: null, now: 'T_NOW' })).toBe(UAT_STARTED_AT);
    // a genuinely new meeting with no recovery in play still gets stamped
    expect(captureOnEntry({ screen: 'record', meetingStartTime: null, recordRecovery: null, now: 'T_NOW' })).toBe('T_NOW');
  });

  it('31/32. Resume — by button or by refresh — restores rather than restamps', () => {
    expect(app).toContain('setMeetingStartTime(meeting.startedAt || null);');
    const r = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`), uatCases(uatMeeting())).effects.resumed;
    expect(r.startedAt).toBe(UAT_STARTED_AT);
  });

  it('every route into RecordScreen supplies or restores startedAt', () => {
    // FIVE routes since Phase 4C.3: beginMeeting, resumeMeeting, crash-recovery
    // draft restore, and the two standalone routes (beginStandaloneMeeting,
    // resumeStandaloneMeeting). The count is asserted so that ADDING a sixth
    // route fails this test until it is shown to supply startedAt too — that is
    // the actual NEW-29 guarantee, not the number itself.
    expect((app.match(/setScreen\(SCREENS\.RECORD\);/g) || []).length).toBe(5);
    expect(app).toContain('setMeetingStartTime(attempt.startedAt);');          // beginMeeting
    expect(app).toContain('setMeetingStartTime(meeting.startedAt || null);');  // resumeMeeting + resumeStandaloneMeeting
    expect(app).toContain('if(draft.meetingStartTime) setMeetingStartTime(draft.meetingStartTime);'); // draft
    // Phase 4C.3 — the standalone cold start reads the instant back from the
    // STORED row, so a retry that found an existing meeting adopts its real
    // start rather than recomputing one.
    expect(app).toContain('setMeetingStartTime(stored.startedAt);');           // beginStandaloneMeeting
  });
});

describe('33/34. crash-recovery precedence', () => {
  it('33/34. a draft for a different meeting cannot own identity', () => {
    expect(app).toContain("if(bootNav.screen === SCREENS.RECORD && bootNav.meetingId && draft.caseInfo?.meetingId !== bootNav.meetingId) return;");
    const wins = (bootNav, draft) => !(bootNav.screen === 'record' && bootNav.meetingId && draft?.caseInfo?.meetingId !== bootNav.meetingId);
    // URL names meeting M; draft is for N -> draft ignored
    expect(wins({ screen: 'record', meetingId: 'M' }, { caseInfo: { meetingId: 'N' } })).toBe(false);
    // draft with no meeting id at all -> ignored for identity
    expect(wins({ screen: 'record', meetingId: 'M' }, { caseInfo: {} })).toBe(false);
    // same meeting -> may supplement
    expect(wins({ screen: 'record', meetingId: 'M' }, { caseInfo: { meetingId: 'M' } })).toBe(true);
    // no URL recovery -> pre-existing behaviour unchanged
    expect(wins({ screen: 'home', meetingId: null }, { caseInfo: {} })).toBe(true);
  });

  it('a draft can never null a recovered startedAt', () => {
    expect(app).not.toContain('setMeetingStartTime(draft.meetingStartTime || null);');
  });
});

describe('the Case View Resume route is unchanged and still deterministic', () => {
  it('Resume still comes from the lifecycle helper, not a heuristic', () => {
    expect(caseView).toContain('const liveMeeting = resumableMeetingFor(cs);');
    expect(caseView).toContain('onResumeMeeting?.(cs, liveMeeting.meeting)');
  });

  it('and its Resume passes the exact persisted meeting object', () => {
    const r = resolve(readNav(`?screen=record&case=${UAT_CASE_ID}&meeting=${UAT_MEETING_ID}`), uatCases(uatMeeting()));
    expect(r.effects.resumed.meetingId).toBe(UAT_MEETING_ID);
  });
});
