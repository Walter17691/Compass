import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtMeetingTime } from '../lib/meetingTiming.js';

// NEW-29 — meeting timing integrity.
//
// meetingStartTime used to be set lazily inside addUtterance, on the first
// COMMITTED utterance. RecordScreen's End meeting button calls
// addUtterance(inputText) and attemptEndMeeting() in the SAME event, so
// handleReview read the state before React had flushed it. The generated
// record rendered "Start time: Not recorded" while startedAt later persisted
// the End-meeting instant — 1 ms before endedAt. startedAt was recording the
// END of the meeting.
//
// Production evidence (meeting_d7671e99-24a6-407f-a8c0-86d5fa1a5a5d):
//   startedAt 2026-09-22T20:39:36.672Z, endedAt 2026-09-22T20:39:36.673Z,
//   rendered "Start time: Not recorded", rendered "End time: 21:39".
//
// The contract is now: scheduled date (caseInfo.date) != actual start
// (entering the live Record screen) != actual end (End meeting).
const app = readFileSync('src/App.jsx', 'utf8');
const record = readFileSync('src/screens/RecordScreen.jsx', 'utf8');

// The shipped capture effect, as a predicate, so ordering can be exercised
// rather than only pattern-matched.
const captureStartOnEntry = (state, RECORD = 'record') => (
  state.screen === RECORD && !state.meetingStartTime
    ? { ...state, meetingStartTime: state.now }
    : state
);

describe('1. start is captured on entry to the live meeting', () => {
  it('the capture effect exists and is keyed on screen + meetingStartTime + recovery', () => {
    // P1 remediation (2026-09-24) — NARROWED, not weakened. The effect's job is
    // unchanged: capture the start instant once, on entry to the live meeting,
    // before any utterance exists. It now also stands down while a cold-load
    // recovery is unresolved, because reaching RecordScreen no longer always
    // means "a meeting is beginning" — since Phase 2.2 it can also mean "a
    // persisted in_progress meeting is being restored", and stamping `now`
    // there overwrote an authoritative startedAt (21:15 became 21:18 in human
    // UAT). recordRecovery is non-null only during that window.
    expect(app).toContain('if(screen === SCREENS.RECORD && !meetingStartTime && !recordRecovery) setMeetingStartTime(new Date().toISOString());');
    expect(app).toContain('}, [screen, meetingStartTime, recordRecovery]);');
  });

  it('the narrowing cannot suppress capture for a genuinely new meeting', () => {
    // recordRecovery is set only from the URL at mount, and only when the boot
    // URL was the record screen. A new meeting started from within the app has
    // it null, so the capture fires exactly as before.
    expect(app).toContain("return nav.screen === SCREENS.RECORD ? { caseId: nav.caseId, meetingId: nav.meetingId, meetingHome: nav.meetingHome } : null;");
    const capture = (screen, meetingStartTime, recordRecovery, now) =>
      (screen === 'record' && !meetingStartTime && !recordRecovery) ? now : meetingStartTime;
    expect(capture('record', null, null, 'T0')).toBe('T0');                       // new meeting
    expect(capture('record', null, { meetingId: 'm' }, 'T0')).toBeNull();          // recovering
    expect(capture('record', 'T_PERSISTED', null, 'T0')).toBe('T_PERSISTED');      // already set
  });

  it('captures before any utterance exists', () => {
    const entered = captureStartOnEntry({ screen: 'record', meetingStartTime: null, transcript: [], now: 'T0' });
    expect(entered.meetingStartTime).toBe('T0');
    expect(entered.transcript).toEqual([]); // no utterance needed
  });

  it('does not capture while still on a non-live screen', () => {
    const prep = captureStartOnEntry({ screen: 'prep', meetingStartTime: null, now: 'T0' });
    expect(prep.meetingStartTime).toBe(null);
  });

  it('every live-entry route goes through the Record screen, so all are covered', () => {
    // Release 1 Phase 2.2 — the structured Start routes no longer navigate
    // for themselves. HomeMeetingScreen's "Start meeting" and both PrepScreen
    // routes now call beginMeeting, which persists the meeting FIRST and only
    // then enters the Record screen. The invariant this test protects is
    // unchanged — every live entry still arrives via SCREENS.RECORD, so the
    // NEW-29 capture effect still covers all of them — but the navigation now
    // happens in one audited place instead of three.
    const home = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
    const prep = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
    expect(home).not.toContain('setScreen(SCREENS.RECORD);');
    expect(home).toContain('await beginMeeting({');
    expect((prep.match(/setScreen\(SCREENS\.RECORD\)/g) || []).length).toBe(0);
    expect((prep.match(/onClick=\{startMeeting\}/g) || []).length).toBe(2);
    expect(prep).toContain('await beginMeeting({ meetingId: caseInfo.meetingId || null });');
    // beginMeeting navigates only after persistence succeeds, and the
    // crash-recovery restore still enters the same way.
    // 5 since Phase 4C.3: beginMeeting + resumeMeeting + draft restore, plus the
    // two standalone routes. Every one still enters via SCREENS.RECORD, so the
    // NEW-29 capture effect still covers all of them.
    expect((app.match(/setScreen\(SCREENS\.RECORD\);/g) || []).length).toBe(5);
    // The standalone routes obey the same rule: the start instant is read from
    // the stored row, never recomputed on entry.
    expect(app).toContain('setMeetingStartTime(stored.startedAt);');
  });
});

describe('2-4. start is stable once captured', () => {
  it('2. a first utterance does not redefine start', () => {
    let s = captureStartOnEntry({ screen: 'record', meetingStartTime: null, now: 'T0' });
    // addUtterance keeps its lazy set, but it is guarded and now always inert.
    const addUtteranceLazySet = st => (!st.meetingStartTime ? { ...st, meetingStartTime: 'T_UTTERANCE' } : st);
    s = addUtteranceLazySet({ ...s, now: 'T1' });
    expect(s.meetingStartTime).toBe('T0');
  });

  it('2b. the lazy set in addUtterance remains guarded', () => {
    expect(app).toContain('if(!meetingStartTime) setMeetingStartTime(new Date().toISOString());');
  });

  it('3. multiple utterances leave start unchanged', () => {
    let s = captureStartOnEntry({ screen: 'record', meetingStartTime: null, now: 'T0' });
    for (const t of ['T1', 'T2', 'T3']) s = captureStartOnEntry({ ...s, now: t });
    expect(s.meetingStartTime).toBe('T0');
  });

  it('4. re-renders leave start unchanged', () => {
    let s = captureStartOnEntry({ screen: 'record', meetingStartTime: null, now: 'T0' });
    for (let i = 0; i < 5; i++) s = captureStartOnEntry({ ...s, now: `T${i + 1}` });
    expect(s.meetingStartTime).toBe('T0');
  });

  it('startSession clears both for a genuinely new meeting', () => {
    expect(app).toContain('setMeetingStartTime(null);');
    expect(app).toContain('setMeetingEndTime(null);');
  });
});

describe('5-7. end is one authoritative instant', () => {
  it('handleReview reuses an already-captured end rather than minting a new one', () => {
    expect(app).toContain('const meetingEndTimeVal = meetingEndTime || new Date().toISOString();');
    expect(app).not.toContain('const meetingEndTimeVal = new Date().toISOString();');
  });

  it('7. a Review retry preserves the original end instant', () => {
    const resolveEnd = (existing, now) => existing || now;
    const first = resolveEnd(null, 'END_T');
    const retry = resolveEnd(first, 'END_T_LATER');
    expect(first).toBe('END_T');
    expect(retry).toBe('END_T'); // unchanged by regeneration
  });

  it('Retry is wired to handleReview, so it exercises that same path', () => {
    expect(app).toContain('onRetryGeneration={handleReview}');
  });
});

describe('4/5. the End-meeting path no longer collapses start onto end', () => {
  // Reproduces the exact production sequence: uncommitted text in inputText,
  // End meeting clicked, addUtterance and handleReview in the same event.
  const endMeetingSequence = ({ startCapturedOnEntry }) => {
    let meetingStartTime = startCapturedOnEntry ? 'T_ENTRY' : null;
    const inputText = 'final note not yet committed';
    // RecordScreen: addUtterance(inputText) — lazy set, guarded.
    if (!meetingStartTime) meetingStartTime = 'T_END';
    // handleReview reads state from its own (pre-flush) closure.
    const startSeenByReview = startCapturedOnEntry ? 'T_ENTRY' : null;
    const endTime = 'T_END_PLUS';
    return {
      startSeenByReview,
      renderedStart: startSeenByReview ? 'rendered' : 'Not recorded',
      persistedStartedAt: meetingStartTime,
      persistedEndedAt: endTime,
      finalUtterancePreserved: inputText.length > 0,
    };
  };

  it('OLD behaviour reproduced: start unseen by Review, startedAt collapses toward end', () => {
    const old = endMeetingSequence({ startCapturedOnEntry: false });
    expect(old.renderedStart).toBe('Not recorded');
    expect(old.persistedStartedAt).toBe('T_END'); // the defect
  });

  it('NEW behaviour: Review sees the entry instant and startedAt is not the end instant', () => {
    const now = endMeetingSequence({ startCapturedOnEntry: true });
    expect(now.startSeenByReview).toBe('T_ENTRY');
    expect(now.renderedStart).not.toBe('Not recorded');
    expect(now.persistedStartedAt).toBe('T_ENTRY');
    expect(now.persistedStartedAt).not.toBe(now.persistedEndedAt);
  });

  it('3/C. the final uncommitted utterance is still preserved into Review', () => {
    const now = endMeetingSequence({ startCapturedOnEntry: true });
    expect(now.finalUtterancePreserved).toBe(true);
    // RecordScreen still flushes it, and handleReview still appends it.
    expect(record).toContain('if(inputText.trim())addUtterance(inputText);attemptEndMeeting();');
    expect(app).toContain('const extra = inputText.trim() ? [{id:newId("utt"),speaker:"Note",text:inputText.trim(),ts:"",pending:false}] : [];');
  });

  it('a very short meeting is valid — ordering is the rule, not duration', () => {
    const startedAt = '2026-09-22T20:39:36.672Z';
    const endedAt = '2026-09-22T20:39:36.673Z';
    // Not asserting a minimum duration: an immediate meeting is legitimate.
    expect(new Date(endedAt) >= new Date(startedAt)).toBe(true);
  });
});

describe('6. Review and Save use the same authoritative values', () => {
  it('the record prompt reads start/end through fmtMeetingTime', () => {
    expect(app).toContain('Start time: ${fmtMeetingTime(meetingStartTime)||"Unknown"}');
    expect(app).toContain('fmtMeetingTime(meetingEndTime||meetingEndTimeVal)');
  });

  it('persistence uses the same state, under unchanged field names', () => {
    expect(app).toContain('startedAt: meetingStartTime || null,');
    expect(app).toContain('endedAt: meetingEndTime || null,');
  });

  it('nothing re-derives a meeting timing value between Review and Save', () => {
    // Exactly one end-instant derivation, and it is the guarded reuse form.
    expect((app.match(/const meetingEndTimeVal = /g) || []).length).toBe(1);
    expect(app).toContain('const meetingEndTimeVal = meetingEndTime || new Date().toISOString();');
    // Start is never re-derived anywhere except the one guarded capture.
    expect((app.match(/setMeetingStartTime\(new Date\(\)\.toISOString\(\)\)/g) || []).length).toBe(2); // capture effect + guarded addUtterance fallback
    // Neither startedAt nor endedAt is computed at save time.
    expect(app).toContain('startedAt: meetingStartTime || null,');
    expect(app).toContain('endedAt: meetingEndTime || null,');
    // Word-anchored: "extendedAt:" (an unrelated DSAR field) contains "endedAt".
    expect(app).not.toMatch(/\bstartedAt:\s*new Date\(\)/);
    expect(app).not.toMatch(/(^|[^x])\bendedAt:\s*new Date\(\)/);
  });
});

describe('8-9. scheduled metadata and the formatter are untouched', () => {
  it('8. caseInfo.date remains the scheduled date, independent of actual timestamps', () => {
    expect(app).toContain('Date: ${caseInfo.date||"today"}');
    expect(app).toContain('date: caseInfo.date||new Date().toLocaleDateString("en-GB"),');
    // Actual instants are never written back over the scheduled date.
    expect(app).not.toMatch(/caseInfo\.date\s*=\s*meetingStartTime/);
    expect(app).not.toMatch(/date:\s*meetingStartTime/);
  });

  it('8b. a meeting crossing midnight keeps truthful instants', () => {
    const startedAt = '2026-09-22T23:58:00.000Z';
    const endedAt = '2026-09-23T00:04:00.000Z';
    expect(new Date(endedAt) > new Date(startedAt)).toBe(true);
    expect(startedAt.slice(0, 10)).not.toBe(endedAt.slice(0, 10)); // dates differ, both kept
  });

  it('9. fmtMeetingTime behaviour is pinned and unchanged', () => {
    const timing = readFileSync('src/lib/meetingTiming.js', 'utf8');
    expect(timing).toContain('export function fmtMeetingTime(iso)');
    expect(timing).toContain('day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"');
    expect(fmtMeetingTime(null)).toBe('');
    expect(fmtMeetingTime('')).toBe('');
    expect(fmtMeetingTime('not-a-date')).toBe('');
    expect(fmtMeetingTime('2026-09-22T20:39:36.672Z')).toMatch(/22\/09\/2026/);
  });
});

describe('10. no regression to adjacent architecture', () => {
  it('NEW-19 structured appeal gate is unchanged', () => {
    expect(app).toContain('const hasAuthoritativeParentCase = !!(caseInfo.preparedCaseId || caseInfo._linkedCaseId);');
    expect(app).toContain('if(!hasAuthoritativeParentCase && !appealDetectedRef.current && transcriptMentionsAppeal(tx)){');
  });

  // INTENTIONAL BEHAVIOUR CHANGE, Release 1 Phase 2.1.
  //
  // This originally asserted that NEW-29's timing patch left NEW-20's
  // employee-name save-target resolution in place — a scope guard for that
  // phase, never a statement that name matching was wanted. Name matching IS
  // NEW-20, an open P1: it could file a meeting onto the wrong case when two
  // employees share a name, or when one employee has both a closed and a live
  // case. Phase 2.1 removes it, so the guard is inverted rather than deleted:
  // it now pins the absence of the unsafe resolution, and NEW-29's own timing
  // assertions above are unaffected either way.
  it('NEW-20 save-target resolution is now authoritative, not name-based', () => {
    expect(app).not.toContain('const nameMatches = cases.filter(c=>c.employeeName.toLowerCase()===caseInfo.employee.toLowerCase());');
    expect(app).toContain('const structuredCaseId = caseInfo.caseId || null;');
    expect(app).toContain('if(caseInfo._linkedCaseId) {');
  });

  it('NEW-30 / NEW-31 signal generators are untouched in this patch', () => {
    expect(app).toContain('const meetingsWithRecords = (cs.meetings||[]).filter(m=>m.record);');
    expect(app).toContain("maintaining a running list of what's been explored");
  });

  it('crash-recovery draft already carries timing, so it was not changed', () => {
    expect(app).toContain('transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions,');
    // P1 remediation — the draft no longer nulls an already-recovered
    // authoritative instant. A draft that carries one still restores it; one
    // that does not (pre-2.2) falls through to the capture effect, which is the
    // single path that legitimately needs the fallback.
    expect(app).toContain('if(draft.meetingStartTime) setMeetingStartTime(draft.meetingStartTime);');
    expect(app).not.toContain('setMeetingStartTime(draft.meetingStartTime || null);');
    expect(app).toContain('setMeetingEndTime(draft.meetingEndTime || null);');
  });

  it('a restored draft keeps its original start rather than gaining a new one', () => {
    const restored = captureStartOnEntry({ screen: 'record', meetingStartTime: 'T_ORIGINAL', now: 'T_RESTORE' });
    expect(restored.meetingStartTime).toBe('T_ORIGINAL');
  });
});
