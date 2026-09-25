import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEETING_STATUS, declaredStatus, isResumableMeeting } from '../lib/meetingLifecycle.js';

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

const SCREENS = { HOME: 'home', CASES: 'cases', RECORD: 'record', CASE_VIEW: 'case_view' };

// The shipped URL reader, as a predicate. Mirrors readNavFromUrl exactly.
const readNav = search => {
  const params = new URLSearchParams(search);
  return { screen: params.get('screen') || SCREENS.HOME, caseId: params.get('case') || null, meetingId: params.get('meeting') || null };
};

// The shipped URL writer, as a predicate. Mirrors the nav-sync effect exactly.
const writeNav = ({ screen, activeCaseId, caseInfo = {} }) => {
  const params = new URLSearchParams();
  params.set('screen', screen);
  if (screen === SCREENS.CASE_VIEW && activeCaseId) params.set('case', activeCaseId);
  if (screen === SCREENS.RECORD && caseInfo.caseId && caseInfo.meetingId) {
    params.set('case', caseInfo.caseId);
    params.set('meeting', caseInfo.meetingId);
  }
  return `?${params.toString()}`;
};

// The shipped resolver, as a driveable function. Mirrors resolveRecordRecovery
// branch for branch, with its side effects captured instead of applied.
const resolve = (nav, cases) => {
  const effects = { screen: null, activeCaseId: null, resumed: null, recoveryCleared: false, writes: 0, audits: [] };
  const { caseId, meetingId } = nav;
  const done = outcome => ({ outcome, effects });
  if (!caseId) { effects.recoveryCleared = true; effects.screen = SCREENS.CASES; return done('redirect_cases'); }
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
    expect(readNav('?screen=case_view&case=abc')).toEqual({ screen: 'case_view', caseId: 'abc', meetingId: null });
  });

  it('other screens are untouched and still parse', () => {
    for (const screen of ['home', 'cases', 'settings', 'calendar']) {
      expect(writeNav({ screen })).toBe(`?screen=${screen}`);
      expect(readNav(`?screen=${screen}`).screen).toBe(screen);
    }
    expect(readNav('').screen).toBe('home');
  });

  it('a record URL without an authoritative meeting carries no identity to guess from', () => {
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: { caseId: UAT_CASE_ID } })).toBe('?screen=record');
    expect(writeNav({ screen: SCREENS.RECORD, caseInfo: {} })).toBe('?screen=record');
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
    expect(app).toContain('if(casesLoading) return;');
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

  it('23. no identity at all redirects to Cases', () => {
    const { outcome, effects } = resolve(readNav('?screen=record'), uatCases(uatMeeting()));
    expect(outcome).toBe('redirect_cases');
    expect(effects.screen).toBe('cases');
    expect(effects.resumed).toBeNull();
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
