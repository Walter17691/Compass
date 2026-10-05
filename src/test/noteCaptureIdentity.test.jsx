import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordScreen } from '../screens/RecordScreen.jsx';
import {
  CAPTURE_CHANNEL, UNATTRIBUTED_SPEAKER,
  isSegmentable, segmentId, belongsToCapture, pendingCapture,
  isFaithfulPartition, resolveSpeaker, attributeCapture, reconcileCapture, captureCount,
} from '../lib/noteCapture.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST UAT BLOCKER — FOUR TYPED NOTES BECAME EIGHT.
//
// Human UAT, production case ZZ UAT Trust Slice, Investigation meeting. The
// tester pressed Enter four times and Compass said "8 notes captured", with the
// timestamps grouped 1 / 2 / 4 / 1 and attribution alternating between the
// chair and the employee.
//
// The duplicates were NOT duplicate database writes — the persisted meeting
// transcript was empty, because an embedded meeting's notes live in React state
// until End. They were not a double render either: every one had its own
// crypto.randomUUID. They were FABRICATED NOTES, produced by the attribution
// call, because addUtterance appended every element of the model's reply and
// the reply re-emitted the `Recent:` context lines it had been given.
//
// These tests are BEHAVIOURAL. The centrepiece replays the field evidence
// through both the old and the new algorithm: the old one must still produce
// eight notes in exactly the observed shape — otherwise this suite has no
// detection power and every assertion below is decoration — and the new one
// must produce four.
// ═══════════════════════════════════════════════════════════════════════════

const CHAIR = 'UAT D4.3 (test)';
const EMPLOYEE = 'ZZ UAT Trust Slice — Sam Testcase';
const ALLOWED = [CHAIR, EMPLOYEE];

// The four notes the tester actually typed, and when.
const TYPED = [
  { text: 'Asked Sam about the missing stock count on 2 October.', ts: '20:45:40', who: CHAIR },
  { text: 'Sam said they were not working on 2 October.', ts: '20:45:48', who: EMPLOYEE },
  { text: 'Sam said they had informed their manager that they were unavailable.', ts: '20:45:56', who: EMPLOYEE },
  { text: 'Sam was asked whether they had any evidence of that conversation and said they would check.', ts: '20:46:05', who: CHAIR },
];
// Observed timestamps, in order, as rendered in production.
const OBSERVED_TS = ['20:45:40', '20:45:48', '20:45:56', '20:46:05'];

/**
 * The model's reply, as observed in the field: for captures 1-3 it echoed the
 * context lines back and appended the new one; for capture 4 it returned only
 * the new one. That is what produces the 1 / 2 / 4 / 1 grouping.
 */
const fieldReply = (step, recent, note) => {
  const echo = step < 3 ? recent.map(u => ({ speaker: u.speaker, text: u.text })) : [];
  return [...echo, { speaker: note.who, text: note.text }];
};

const recentOf = (state) => state.filter(u => !u.pending).slice(-5);

// The algorithm as it shipped, reproduced verbatim in shape so the suite can
// prove it detects the defect. Ids are unique per element, which is exactly why
// no text- or key-based check could ever have caught this.
function captureOldWay(state, note, step, counter) {
  const pendingId = `utt_${counter.n++}`;
  const recent = recentOf(state);
  const next = [...state, { id: pendingId, speaker: '...', text: note.text, ts: note.ts, pending: true }];
  const parsed = fieldReply(step, recent, note);
  const items = parsed.map((u, i) => ({
    id: i === 0 ? pendingId : `utt_${counter.n++}`,
    speaker: u.speaker, text: u.text, ts: note.ts, aiAttributed: true,
  }));
  return [...next.filter(u => u.id !== pendingId), ...items];
}

// The algorithm as it now is: the same three steps addUtterance performs.
function captureNewWay(state, note, step, counter, channel = CAPTURE_CHANNEL.TYPING) {
  const captureId = `utt_${counter.n++}`;
  const recent = recentOf(state);
  const capture = pendingCapture({ captureId, channel, text: note.text, ts: note.ts });
  const withPending = [...state, capture];
  const entries = attributeCapture(capture, fieldReply(step, recent, note), { allowedSpeakers: ALLOWED });
  return reconcileCapture(withPending, captureId, entries);
}

// Replay all four captures through one algorithm, from a clean id counter.
const run = (fn, channel) => {
  const counter = { n: 1 };
  return TYPED.reduce((state, note, i) => fn(state, note, i, counter, channel), []);
};

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the field evidence, replayed', () => {
  it('1. CONTROL: the old algorithm still turns four typed notes into eight', () => {
    // If this ever stops failing in the old shape, the suite below is vacuous.
    const out = run(captureOldWay);
    expect(out).toHaveLength(8);
  });

  it('2. CONTROL: and in exactly the timestamp grouping the tester reported', () => {
    const out = run(captureOldWay);
    const grouped = OBSERVED_TS.map(ts => out.filter(u => u.ts === ts).length);
    expect(grouped).toEqual([1, 2, 4, 1]);
  });

  it('3. CONTROL: every fabricated note had a distinct id, so no key-based check could see it', () => {
    const out = run(captureOldWay);
    expect(new Set(out.map(u => u.id)).size).toBe(8);
  });

  it('4. the new algorithm keeps four notes for four captures', () => {
    expect(run(captureNewWay)).toHaveLength(4);
  });

  it('5. and keeps them in the order they were typed, with the text verbatim', () => {
    expect(run(captureNewWay).map(u => u.text)).toEqual(TYPED.map(n => n.text));
  });

  it('6. one capture event per note, counted by write identity', () => {
    expect(captureCount(run(captureNewWay))).toBe(4);
  });

  it('7. attribution still happens — this is not fixed by discarding the speaker', () => {
    expect(run(captureNewWay).map(u => u.speaker)).toEqual(TYPED.map(n => n.who));
  });

  it('8. a note the participant legitimately repeats is NOT deduplicated', () => {
    // The explicit non-goal. Identical text said twice is two notes.
    const twice = [TYPED[1], TYPED[1]];
    const c = { n: 1 };
    const out = twice.reduce((s, note) => {
      const captureId = `utt_${c.n++}`;
      const cap = pendingCapture({ captureId, channel: CAPTURE_CHANNEL.TYPING, text: note.text, ts: note.ts });
      return reconcileCapture([...s, cap], captureId,
        attributeCapture(cap, [{ speaker: note.who, text: note.text }], { allowedSpeakers: ALLOWED }));
    }, []);
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe(out[1].text);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. one capture, one identity', () => {
  const cap = () => pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.TYPING, text: 'A line', ts: '09:00:00' });

  it('9. a capture is recorded before any network call, and marked pending', () => {
    const c = cap();
    expect(c.id).toBe('c1');
    expect(c.pending).toBe(true);
    expect(c.text).toBe('A line');
  });

  it('10. segment ids are DERIVED from the capture, so a replay recomputes them', () => {
    expect(segmentId('c1', 0)).toBe('c1');
    expect(segmentId('c1', 1)).toBe('c1#1');
    expect(segmentId('c1', 1)).toBe(segmentId('c1', 1));
  });

  it('11. membership is by derivation, not by text or timestamp', () => {
    expect(belongsToCapture({ id: 'c1' }, 'c1')).toBe(true);
    expect(belongsToCapture({ id: 'c1#2' }, 'c1')).toBe(true);
    expect(belongsToCapture({ id: 'c2' }, 'c1')).toBe(false);
    // Not a prefix match on raw string: c10 is a different capture.
    expect(belongsToCapture({ id: 'c10' }, 'c1')).toBe(false);
  });

  it('12. every entry attribution produces belongs to the capture that asked', () => {
    const c = pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'one two', ts: 't' });
    const entries = attributeCapture(c, [{ speaker: CHAIR, text: 'one' }, { speaker: EMPLOYEE, text: 'two' }], { allowedSpeakers: ALLOWED });
    expect(entries.every(e => belongsToCapture(e, 'c1'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. typing is atomic', () => {
  const typed = (text = 'A line') => pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.TYPING, text, ts: 't' });

  it('13. typing may never be split, however many elements the model returns', () => {
    const entries = attributeCapture(typed(), [
      { speaker: CHAIR, text: 'A line' },
      { speaker: EMPLOYEE, text: 'something else entirely' },
      { speaker: CHAIR, text: 'and more' },
    ], { allowedSpeakers: ALLOWED });
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('A line');
  });

  it('14. an undeclared channel is treated as atomic — fail closed', () => {
    expect(isSegmentable(undefined)).toBe(false);
    expect(isSegmentable('something_new')).toBe(false);
    const entries = attributeCapture(
      { captureId: 'c1', text: 'A line', ts: 't' },
      [{ speaker: CHAIR, text: 'A line' }, { speaker: CHAIR, text: 'extra' }]);
    expect(entries).toHaveLength(1);
  });

  it('15. the End-meeting flush and system markers are atomic too', () => {
    expect(isSegmentable(CAPTURE_CHANNEL.FLUSH)).toBe(false);
    expect(isSegmentable(CAPTURE_CHANNEL.SYSTEM)).toBe(false);
  });

  it('16. the captured text is kept even when the model rewords it', () => {
    const entries = attributeCapture(typed('Sam said they were not working.'),
      [{ speaker: CHAIR, text: 'Sam stated he did not work that day.' }], { allowedSpeakers: ALLOWED });
    expect(entries[0].text).toBe('Sam said they were not working.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. speech and imports may split, but only faithfully', () => {
  const heard = (text) => pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.SPEECH_MIC, text, ts: 't' });

  it('17. microphone, screen audio and imports are segmentable', () => {
    expect(isSegmentable(CAPTURE_CHANNEL.SPEECH_MIC)).toBe(true);
    expect(isSegmentable(CAPTURE_CHANNEL.SPEECH_SCREEN)).toBe(true);
    expect(isSegmentable(CAPTURE_CHANNEL.IMPORT)).toBe(true);
  });

  it('18. a genuine two-speaker chunk IS split — the feature still works', () => {
    const entries = attributeCapture(heard('Were you at work? No I was not.'), [
      { speaker: CHAIR, text: 'Were you at work?' },
      { speaker: EMPLOYEE, text: 'No I was not.' },
    ], { allowedSpeakers: ALLOWED });
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.speaker)).toEqual([CHAIR, EMPLOYEE]);
    expect(entries.map(e => e.id)).toEqual(['c1', 'c1#1']);
  });

  it('19. a split that adds content is REFUSED and the note kept whole', () => {
    const entries = attributeCapture(heard('No I was not.'), [
      { speaker: CHAIR, text: 'Were you at work?' },   // echoed context — not ours
      { speaker: EMPLOYEE, text: 'No I was not.' },
    ], { allowedSpeakers: ALLOWED });
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('No I was not.');
  });

  it('20. a split that loses content is refused', () => {
    const entries = attributeCapture(heard('Were you at work? No I was not.'), [
      { speaker: CHAIR, text: 'Were you at work?' },
    ], { allowedSpeakers: ALLOWED });
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Were you at work? No I was not.');
  });

  it('21. partition fidelity ignores whitespace only, never wording', () => {
    expect(isFaithfulPartition('one two', [{ text: 'one' }, { text: '  two ' }])).toBe(true);
    expect(isFaithfulPartition('one two', [{ text: 'one' }, { text: 'three' }])).toBe(false);
    expect(isFaithfulPartition('one two', [{ text: 'one' }, { text: 'two' }, { text: 'two' }])).toBe(false);
    expect(isFaithfulPartition('one two', [])).toBe(false);
    expect(isFaithfulPartition('one two', [{ text: 'one two' }, { text: '' }])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. attribution never invents a person, and never claims one', () => {
  it('22. a speaker who is not in the meeting is refused, not recorded', () => {
    expect(resolveSpeaker('Someone Else', ALLOWED)).toBe(UNATTRIBUTED_SPEAKER);
    expect(resolveSpeaker(CHAIR, ALLOWED)).toBe(CHAIR);
  });

  it('23. a known speaker is stored in its canonical spelling', () => {
    expect(resolveSpeaker('uat d4.3 (TEST)', ALLOWED)).toBe(CHAIR);
  });

  it('24. when attribution fails the note is UNATTRIBUTED, not credited to the chair', () => {
    // The old fallback was `caseInfo.manager || "HR Manager"`, so an API failure
    // put the employee's answers in the chair's mouth.
    const c = pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.TYPING, text: 'A line', ts: 't' });
    expect(attributeCapture(c, null)[0].speaker).toBe(UNATTRIBUTED_SPEAKER);
    expect(attributeCapture(c, null)[0].speaker).not.toBe(CHAIR);
    expect(attributeCapture(c, [])[0].speaker).toBe(UNATTRIBUTED_SPEAKER);
  });

  it('25. a captured note is NEVER deleted by a bad reply', () => {
    const c = pendingCapture({ captureId: 'c1', channel: CAPTURE_CHANNEL.TYPING, text: 'A line', ts: 't' });
    for (const reply of [null, undefined, [], [null], 'nonsense', 42, {}, [{ }]]) {
      const entries = attributeCapture(c, reply);
      expect(entries, String(reply)).toHaveLength(1);
      expect(entries[0].text).toBe('A line');
      expect(entries[0].pending).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. reconciliation is idempotent and order-preserving', () => {
  const base = () => ([
    { id: 'a', text: 'first', pending: false },
    pendingCapture({ captureId: 'b', channel: CAPTURE_CHANNEL.TYPING, text: 'second', ts: 't' }),
    { id: 'c', text: 'third', pending: false },
  ]);
  const entriesFor = (id, texts) => texts.map((t, i) => ({ id: segmentId(id, i), captureId: id, text: t, pending: false }));

  it('26. REPLAY: applying the same attribution twice changes nothing', () => {
    const once = reconcileCapture(base(), 'b', entriesFor('b', ['second']));
    const twice = reconcileCapture(once, 'b', entriesFor('b', ['second']));
    expect(twice).toEqual(once);
    expect(twice).toHaveLength(3);
  });

  it('27. REPLAY of a split attribution is also a no-op, not a second append', () => {
    const once = reconcileCapture(base(), 'b', entriesFor('b', ['sec', 'ond']));
    expect(once).toHaveLength(4);
    const twice = reconcileCapture(once, 'b', entriesFor('b', ['sec', 'ond']));
    expect(twice).toEqual(once);
  });

  it('28. entries land WHERE THE CAPTURE WAS, not at the end', () => {
    const out = reconcileCapture(base(), 'b', entriesFor('b', ['second']));
    expect(out.map(u => u.text)).toEqual(['first', 'second', 'third']);
  });

  it('29. two overlapping captures resolving out of order keep meeting order', () => {
    // The mic flushes every ~8 words, so two attributions really are in flight
    // together. The old filter-then-append moved each to the end as it resolved.
    let s = [{ id: 'a', text: 'first', pending: false }];
    const c1 = pendingCapture({ captureId: 'b', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'second', ts: 't' });
    const c2 = pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'third', ts: 't' });
    s = [...s, c1];
    s = [...s, c2];
    s = reconcileCapture(s, 'c', entriesFor('c', ['third']));   // later one resolves FIRST
    s = reconcileCapture(s, 'b', entriesFor('b', ['second']));
    expect(s.map(u => u.text)).toEqual(['first', 'second', 'third']);
  });

  it('30. a late reply for a discarded capture does NOT resurrect the note', () => {
    const out = reconcileCapture([{ id: 'a', text: 'first' }], 'gone', entriesFor('gone', ['zombie']));
    expect(out.map(u => u.text)).toEqual(['first']);
  });

  it('31. reconciliation leaves other captures untouched', () => {
    const out = reconcileCapture(base(), 'b', entriesFor('b', ['second']));
    expect(out.filter(u => u.id === 'a')).toHaveLength(1);
    expect(out.filter(u => u.id === 'c')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. MUTATION TESTS — the protection is load-bearing', () => {
  // Each of these asserts a property that FAILS if the corresponding guard is
  // removed, so the guard cannot be deleted and leave a green suite.

  it('32. removing the atomic rule would reintroduce the blocker', () => {
    // Proven by construction: the same reply, on a segmentable channel with a
    // faithful partition, legitimately yields 2. On typing it must still yield 1.
    const reply = [{ speaker: CHAIR, text: 'one' }, { speaker: EMPLOYEE, text: 'two' }];
    const asSpeech = attributeCapture(
      pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'one two', ts: 't' }),
      reply, { allowedSpeakers: ALLOWED });
    const asTyping = attributeCapture(
      pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.TYPING, text: 'one two', ts: 't' }),
      reply, { allowedSpeakers: ALLOWED });
    expect(asSpeech).toHaveLength(2);
    expect(asTyping).toHaveLength(1);
  });

  it('33. removing the derived-id rule would break replay idempotency', () => {
    // If ids were freshly minted per element, the second reconcile would not
    // recognise the first run's entries. Assert ids are a pure function of the
    // capture: two independent attributions produce the SAME ids.
    const c = pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'one two', ts: 't' });
    const a = attributeCapture(c, [{ speaker: CHAIR, text: 'one' }, { speaker: EMPLOYEE, text: 'two' }], { allowedSpeakers: ALLOWED });
    const b = attributeCapture(c, [{ speaker: CHAIR, text: 'one' }, { speaker: EMPLOYEE, text: 'two' }], { allowedSpeakers: ALLOWED });
    expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
  });

  it('34. removing the fidelity check would let echoed context back in', () => {
    const c = pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.SPEECH_MIC, text: 'mine', ts: 't' });
    const echoed = [{ speaker: CHAIR, text: 'yours' }, { speaker: EMPLOYEE, text: 'mine' }];
    expect(isFaithfulPartition('mine', echoed)).toBe(false);
    expect(attributeCapture(c, echoed, { allowedSpeakers: ALLOWED })).toHaveLength(1);
  });

  it('35. removing the replace-by-identity rule would append on retry', () => {
    // A direct property of reconcileCapture: output length is independent of
    // how many times it is applied.
    let s = [pendingCapture({ captureId: 'c', channel: CAPTURE_CHANNEL.TYPING, text: 'x', ts: 't' })];
    const e = [{ id: 'c', captureId: 'c', text: 'x', pending: false }];
    for (let i = 0; i < 5; i++) s = reconcileCapture(s, 'c', e);
    expect(s).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. the composer, rendered: one Enter is one capture', () => {
  const noop = () => {};
  beforeEach(() => {
    window.innerWidth = 1440;
    window.matchMedia = window.matchMedia || (q => ({
      matches: false, media: q,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    }));
  });

  const props = (over = {}) => ({
    recovering: false,
    meetingType: { id: 'investigation', label: 'Investigation Meeting' },
    caseInfo: { employee: EMPLOYEE, manager: CHAIR, date: '2026-10-04', meetingId: 'm-1' },
    isListening: false, meetingStartTime: null, currentAdjournment: null,
    setAdjournments: noop, setCurrentAdjournment: noop, setTranscript: noop,
    inputText: '', aiProcessing: false, transcript: [],
    addUtterance: vi.fn(), inputRef: { current: null }, setInputText: vi.fn(),
    updateLiveContext: noop, stopSpeech: noop, startSpeech: vi.fn(),
    isScreenCapturing: false, stopScreenCapture: noop, startScreenCapture: noop,
    importFileRef: { current: null }, handleImportFile: noop,
    liveContextLoading: false, liveContext: '',
    liveChatHistory: [], liveChatProcessing: false, liveChatInput: '',
    setLiveChatInput: noop, sendLiveChat: noop,
    setScreen: noop, confirmDialog: noop, clearMeetingDraft: noop, promptDialog: noop,
    updateMeetingIntelligence: noop, meetingIntelligence: null,
    dismissedNudgeKey: null, setDismissedNudgeKey: vi.fn(),
    prepQuestions: [], onSetPrepQuestionStatus: vi.fn(),
    meetingEvidenceSuggestions: [], onAcceptMeetingEvidenceSuggestion: vi.fn(), onDismissMeetingEvidenceSuggestion: vi.fn(),
    meetingActionSuggestions: [], onAcceptMeetingActionSuggestion: vi.fn(), onDismissMeetingActionSuggestion: vi.fn(),
    dismissedFollowUpKey: null, setDismissedFollowUpKey: vi.fn(),
    attemptEndMeeting: vi.fn(),
    dismissedCoachingTipKeys: [], onDismissCoachingTip: vi.fn(),
    fmtDate: d => d,
    ...over,
  });

  // The composer is a CONTROLLED textarea, so a mocked setInputText never feeds
  // the typed text back and no newline ever arrives. This wrapper supplies the
  // real state App.jsx supplies, which is what makes these tests behavioural
  // rather than a test of the mock.
  const Live = ({ addUtterance, ...over }) => {
    const [inputText, setInputText] = useState('');
    return <RecordScreen {...props({ addUtterance, inputText, setInputText, ...over })} />;
  };

  it('36. pressing Enter on a typed line calls addUtterance exactly ONCE', async () => {
    // Item J of the forensic brief: a keyboard handler AND a submit both firing.
    // There is one path — the composer's newline detection — and this proves it.
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    const box = screen.getByLabelText('Meeting notepad');
    await userEvent.type(box, 'Asked Sam about the stock count.{Enter}');
    expect(addUtterance).toHaveBeenCalledTimes(1);
    expect(addUtterance.mock.calls[0][0]).toBe('Asked Sam about the stock count.');
  });

  it('37. a second Enter is a second, separate capture — not a re-submission', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    const box = screen.getByLabelText('Meeting notepad');
    await userEvent.type(box, 'One.{Enter}');
    await userEvent.type(box, 'Two.{Enter}');
    expect(addUtterance).toHaveBeenCalledTimes(2);
    expect(addUtterance.mock.calls.map(c => c[0])).toEqual(['One.', 'Two.']);
  });

  it('38. the composer declares no channel, so it gets the atomic default', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    await userEvent.type(screen.getByLabelText('Meeting notepad'), 'A note.{Enter}');
    expect(isSegmentable(addUtterance.mock.calls[0][1])).toBe(false);
  });

  it('39. the eight duplicated notes would have rendered — the count is not the only surface', () => {
    const dupes = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`, text: TYPED[i % 4].text, ts: OBSERVED_TS[i % 4], speaker: CHAIR, pending: false,
    }));
    render(<RecordScreen {...props({ transcript: dupes })} />);
    expect(screen.getAllByText(TYPED[0].text).length).toBeGreaterThan(1);
  });
});
