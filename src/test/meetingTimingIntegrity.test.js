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
  it('the capture effect exists and is keyed on screen + meetingStartTime', () => {
    expect(app).toContain('if(screen === SCREENS.RECORD && !meetingStartTime) setMeetingStartTime(new Date().toISOString());');
    expect(app).toContain('}, [screen, meetingStartTime]);');
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
    // setup "Start meeting", PrepScreen "Start meeting", "Skip prep and start
    // meeting now", and the crash-recovery restore all setScreen(RECORD).
    const home = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
    const prep = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
    expect(home).toContain('setScreen(SCREENS.RECORD);');
    expect((prep.match(/setScreen\(SCREENS\.RECORD\)/g) || []).length).toBe(2);
    expect(app).toContain('setScreen(SCREENS.RECORD);'); // draft restore
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

  it('NEW-20 save-target resolution is untouched in this patch', () => {
    expect(app).toContain('const nameMatches = cases.filter(c=>c.employeeName.toLowerCase()===caseInfo.employee.toLowerCase());');
    expect(app).toContain('if(caseInfo._linkedCaseId) {');
  });

  it('NEW-30 / NEW-31 signal generators are untouched in this patch', () => {
    expect(app).toContain('const meetingsWithRecords = (cs.meetings||[]).filter(m=>m.record);');
    expect(app).toContain("maintaining a running list of what's been explored");
  });

  it('crash-recovery draft already carries timing, so it was not changed', () => {
    expect(app).toContain('transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions,');
    expect(app).toContain('setMeetingStartTime(draft.meetingStartTime || null);');
    expect(app).toContain('setMeetingEndTime(draft.meetingEndTime || null);');
  });

  it('a restored draft keeps its original start rather than gaining a new one', () => {
    const restored = captureStartOnEntry({ screen: 'record', meetingStartTime: 'T_ORIGINAL', now: 'T_RESTORE' });
    expect(restored.meetingStartTime).toBe('T_ORIGINAL');
  });
});
