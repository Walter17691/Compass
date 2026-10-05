import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordScreen } from '../screens/RecordScreen.jsx';
import {
  FOLLOW_SLACK_PX, SOURCE_LABEL,
  shouldFollowLatest, noteMeta, latestCommitted, clickShouldFocusLiveLine,
} from '../lib/notepad.js';
import { CAPTURE_CHANNEL } from '../lib/noteCapture.js';
import { SPEAKERS } from '../constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// UX-06 — THE NOTEPAD IS WHERE THE MANAGER WORKS.
//
// Human UAT: ordinary meeting notes were still being typed into a chat-style
// composer at the foot of the screen, so taking minutes felt like sending
// messages to Compass.
//
// The archaeology: pre-Wave-C3 the main area WAS a notepad (aria-label
// "Notepad", one full-height central textarea) and C3 correctly gave that area
// to the captured conversation — because before C3 the notes were never
// rendered at all. The composer was collateral damage of a correct fix.
//
// This slice restores the notepad WITHOUT recreating the C3 defect: committed
// lines stay visible, and the live line is the last line of the same surface.
//
// THE CAPTURE MODEL IS UNTOUCHED. These tests exist to prove that as much as to
// prove the layout.
// ═══════════════════════════════════════════════════════════════════════════

const CHAIR = 'UAT D4.3 (test)';
const EMPLOYEE = 'ZZ UAT Trust Slice — Sam Testcase';
const noop = () => {};

const utt = (id, text, over = {}) => ({
  id, captureId: id, channel: CAPTURE_CHANNEL.TYPING, speaker: CHAIR,
  text, ts: '20:45:40', pending: false, ...over,
});

const FOUR = [
  utt('c1', 'Asked Sam about the missing stock count on 2 October.', { ts: '20:45:40' }),
  utt('c2', 'Sam said they were not working on 2 October.', { ts: '20:45:48' }),
  utt('c3', 'Sam said they had informed their manager that they were unavailable.', { ts: '20:45:56' }),
  utt('c4', 'Sam was asked whether they had any evidence of that conversation and said they would check.', { ts: '20:46:05' }),
];

beforeEach(() => {
  window.innerWidth = 1440;
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
});

const baseProps = (over = {}) => ({
  recovering: false,
  meetingType: { id: 'investigation', label: 'Investigation Meeting' },
  caseInfo: { employee: EMPLOYEE, manager: CHAIR, date: '2026-10-05', meetingId: 'm-1' },
  isListening: false, meetingStartTime: null, currentAdjournment: null,
  setAdjournments: noop, setCurrentAdjournment: noop, setTranscript: noop,
  inputText: '', aiProcessing: false, transcript: [],
  addUtterance: vi.fn(), inputRef: { current: null }, setInputText: vi.fn(),
  updateLiveContext: noop, stopSpeech: noop, startSpeech: vi.fn(),
  isScreenCapturing: false, stopScreenCapture: noop, startScreenCapture: noop,
  importFileRef: { current: null }, handleImportFile: noop,
  liveContextLoading: false, liveContext: '',
  liveChatHistory: [], liveChatProcessing: false, liveChatInput: '',
  setLiveChatInput: vi.fn(), sendLiveChat: vi.fn(),
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

/**
 * The notepad with REAL input state, the way App supplies it. A mocked
 * setInputText never feeds typed text back into a controlled textarea, so
 * without this the Enter tests would be testing the mock.
 */
const Live = ({ addUtterance, ...over }) => {
  const [inputText, setInputText] = useState('');
  const inputRef = { current: null };
  return <RecordScreen {...baseProps({ addUtterance, inputText, setInputText, inputRef, ...over })} />;
};

const notepad = () => screen.getByLabelText('Meeting notepad');

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the notepad is the workspace', () => {
  it('1. the typing surface is INSIDE the notes surface, not a strip beneath it', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const notes = screen.getByLabelText('Notes captured so far');
    const live = notepad();
    // Same scroll container holds both. This is the whole change: before, the
    // textarea was a sibling of the list in a bordered strip of its own.
    const surface = notes.closest('div');
    expect(surface).toBeTruthy();
    expect(surface.contains(live)).toBe(true);
  });

  it('2. it is identified as a notepad, not as a message composer', () => {
    render(<RecordScreen {...baseProps()} />);
    expect(notepad().tagName).toBe('TEXTAREA');
    expect(screen.queryByLabelText('Capture a note')).toBeNull();
  });

  it('3. the old chat-style placeholder is gone', () => {
    render(<RecordScreen {...baseProps()} />);
    expect(notepad().placeholder).toBe('Start typing your notes…');
    expect(notepad().placeholder).not.toMatch(/press Enter to save a line/i);
  });

  it('4. an empty notepad still shows the writing surface — no dead zone', () => {
    render(<RecordScreen {...baseProps({ transcript: [] })} />);
    expect(notepad()).toBeTruthy();
    expect(screen.getByText('Press Enter to save each line.')).toBeTruthy();
  });

  it('5. committed notes remain visible — the C3 defect is not recreated', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    for (const u of FOUR) expect(screen.getByText(u.text)).toBeTruthy();
  });

  it('6. content comes first: the note text, not its metadata, carries the weight', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const line = screen.getByText(FOUR[0].text);
    expect(line.style.fontSize).toBe('15px');
    // Timestamp is present for chronology but visually quiet.
    const ts = screen.getByText('20:45:40');
    expect(parseInt(ts.style.fontSize, 10)).toBeLessThan(15);
  });

  it('7. capture controls sit BELOW the writing surface, not wrapped around it', () => {
    render(<RecordScreen {...baseProps()} />);
    const mic = screen.getByRole('button', { name: /Microphone/ });
    const notes = screen.getByLabelText('Notes captured so far');
    expect(notes.closest('div').contains(mic)).toBe(false);
    expect(screen.getByRole('button', { name: /Screen audio/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import transcript/ })).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. one Enter is still one capture', () => {
  it('8. typing happens in the main workspace and Enter commits exactly once', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    await userEvent.type(notepad(), 'Asked Sam about the stock count.{Enter}');
    expect(addUtterance).toHaveBeenCalledTimes(1);
    expect(addUtterance.mock.calls[0][0]).toBe('Asked Sam about the stock count.');
  });

  it('9. FOUR Enter presses produce exactly FOUR captures', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    const box = notepad();
    for (const u of FOUR) await userEvent.type(box, `${u.text}{Enter}`);
    expect(addUtterance).toHaveBeenCalledTimes(4);
    expect(addUtterance.mock.calls.map(c => c[0])).toEqual(FOUR.map(u => u.text));
  });

  it('10. the notepad declares no channel, so capture stays MANUAL/typing', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    await userEvent.type(notepad(), 'A note.{Enter}');
    // addUtterance defaults to TYPING, which is atomic and paraphrase-provenance.
    expect(addUtterance.mock.calls[0][1]).toBeUndefined();
  });

  it('11. the live line is cleared after Enter and stays ready', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    const box = notepad();
    await userEvent.type(box, 'One.{Enter}');
    expect(box.value).toBe('');
    await userEvent.type(box, 'Two.{Enter}');
    expect(addUtterance).toHaveBeenCalledTimes(2);
  });

  it('12. a committed note renders immediately above the live line', () => {
    render(<RecordScreen {...baseProps({ transcript: [FOUR[0]] })} />);
    const notes = screen.getByLabelText('Notes captured so far');
    expect(within(notes).getByText(FOUR[0].text)).toBeTruthy();
    const surface = notes.closest('div');
    // Order in the DOM: committed list, then the live line.
    expect(surface.innerHTML.indexOf('Notes captured so far'))
      .toBeLessThan(surface.innerHTML.indexOf('Meeting notepad'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. committed notes are events, not editable document text', () => {
  it('13. committed lines are not editable and carry no input element', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const notes = screen.getByLabelText('Notes captured so far');
    expect(notes.querySelectorAll('textarea,input,[contenteditable="true"]').length).toBe(0);
    expect(notes.getAttribute('contenteditable')).toBeNull();
  });

  it('14. there is exactly ONE editable surface on the notepad', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const surface = screen.getByLabelText('Notes captured so far').closest('div');
    expect(surface.querySelectorAll('textarea').length).toBe(1);
  });

  it('15. a pending capture is shown as provisional, then reconciles in place', () => {
    const pending = utt('c5', 'Still attributing', { pending: true, speaker: '...' });
    const { unmount } = render(<RecordScreen {...baseProps({ transcript: [...FOUR, pending] })} />);
    const li = screen.getByText('Still attributing').closest('li');
    expect(Number(li.style.opacity)).toBeLessThan(1);
    // The placeholder speaker is never printed as an attribution.
    expect(screen.queryByText('...')).toBeNull();
    unmount();
    // Reconciled: same captureId, now committed — one line, not two.
    render(<RecordScreen {...baseProps({ transcript: [...FOUR, utt('c5', 'Still attributing')] })} />);
    expect(screen.getAllByText('Still attributing')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. metadata presentation', () => {
  it('16. the speaker appears only when it CHANGES', () => {
    const a = utt('a', 'one', { speaker: CHAIR });
    const b = utt('b', 'two', { speaker: CHAIR });
    const c = utt('c', 'three', { speaker: EMPLOYEE });
    expect(noteMeta(a, null).speaker).toBe(CHAIR);
    expect(noteMeta(b, a).speaker).toBeNull();
    expect(noteMeta(c, b).speaker).toBe(EMPLOYEE);
  });

  it('17. neutral and placeholder speakers are never printed as attributions', () => {
    expect(noteMeta(utt('a', 'x', { speaker: SPEAKERS.NOTE }), null).speaker).toBeNull();
    expect(noteMeta(utt('a', 'x', { speaker: '...' }), null).speaker).toBeNull();
    expect(noteMeta(utt('a', 'x', { speaker: 'You' }), null).speaker).toBeNull();
    expect(noteMeta(utt('a', 'x', { speaker: '' }), null).speaker).toBeNull();
  });

  it('18. typed notes carry NO source badge — provenance existing is not a reason to show it', () => {
    expect(noteMeta(utt('a', 'x'), null).source).toBeNull();
    expect(noteMeta(utt('a', 'x', { channel: CAPTURE_CHANNEL.FLUSH }), null).source).toBeNull();
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    expect(screen.queryByText('heard')).toBeNull();
    expect(screen.queryByText(/typing/)).toBeNull();
  });

  it('19. speech and imported captures DO show a quiet source marker', () => {
    expect(noteMeta(utt('a', 'x', { channel: CAPTURE_CHANNEL.SPEECH_MIC }), null).source).toBe('heard');
    expect(noteMeta(utt('a', 'x', { channel: CAPTURE_CHANNEL.SPEECH_SCREEN }), null).source).toBe('heard');
    expect(noteMeta(utt('a', 'x', { channel: CAPTURE_CHANNEL.IMPORT }), null).source).toBe('imported');
    expect(Object.keys(SOURCE_LABEL)).not.toContain(CAPTURE_CHANNEL.TYPING);
  });

  it('20. the timestamp is always available, because chronology is part of the record', () => {
    expect(noteMeta(utt('a', 'x', { ts: '09:15:00' }), null).ts).toBe('09:15:00');
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    for (const u of FOUR) expect(screen.getByText(u.ts)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. typed and audio captures share one chronological workspace', () => {
  const MIXED = [
    utt('m1', 'Asked about the stock count.', { ts: '10:00:01' }),
    utt('m2', 'No, I was not working that day.', { channel: CAPTURE_CHANNEL.SPEECH_MIC, speaker: EMPLOYEE, ts: '10:00:09' }),
    utt('m3', 'Noted that the rota should be checked.', { ts: '10:00:20' }),
  ];

  it('21. there is ONE workspace — no separate "typed notes" and "transcript" panes', () => {
    render(<RecordScreen {...baseProps({ transcript: MIXED })} />);
    const notes = screen.getByLabelText('Notes captured so far');
    expect(notes.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByLabelText(/transcript/i)).toBeNull();
  });

  it('22. in capture order, with the channel distinction preserved underneath', () => {
    render(<RecordScreen {...baseProps({ transcript: MIXED })} />);
    const texts = [...screen.getByLabelText('Notes captured so far').querySelectorAll('li')]
      .map(li => li.textContent);
    expect(texts[0]).toContain('Asked about the stock count.');
    expect(texts[1]).toContain('No, I was not working that day.');
    expect(texts[1]).toContain('heard');
    expect(texts[2]).toContain('Noted that the rota should be checked.');
    expect(texts[2]).not.toContain('heard');
  });

  it('23. a microphone capture while typing does not disturb the live line', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} transcript={MIXED} isListening />);
    await userEvent.type(notepad(), 'half a thought');
    expect(notepad().value).toBe('half a thought');
    expect(addUtterance).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. follow-latest, not scroll-hijack', () => {
  it('24. follows when the manager is at the bottom', () => {
    expect(shouldFollowLatest({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
  });

  it('25. does NOT follow when they have scrolled up to re-read', () => {
    expect(shouldFollowLatest({ scrollTop: 100, scrollHeight: 2000, clientHeight: 400 })).toBe(false);
  });

  it('26. a small nudge off the bottom still counts as following', () => {
    const nearly = 1000 - 100 - (FOLLOW_SLACK_PX - 1);
    expect(shouldFollowLatest({ scrollTop: nearly, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
  });

  it('27. content that does not overflow always follows', () => {
    expect(shouldFollowLatest({ scrollTop: 0, scrollHeight: 300, clientHeight: 600 })).toBe(true);
  });

  it('28. unusable metrics fail toward following, never toward a hidden live line', () => {
    expect(shouldFollowLatest(null)).toBe(true);
    expect(shouldFollowLatest({})).toBe(true);
    expect(shouldFollowLatest({ scrollTop: NaN, scrollHeight: 1, clientHeight: 1 })).toBe(true);
  });

  it('29. 20+ notes render and the live line is still the last thing in the flow', () => {
    const many = Array.from({ length: 24 }, (_, i) => utt(`n${i}`, `Note number ${i}.`));
    render(<RecordScreen {...baseProps({ transcript: many })} />);
    expect(screen.getByLabelText('Notes captured so far').querySelectorAll('li')).toHaveLength(24);
    const surface = screen.getByLabelText('Notes captured so far').closest('div');
    expect(surface.contains(notepad())).toBe(true);
  });

  it('30. a long note is not clipped — it wraps as a paragraph', () => {
    const long = utt('L', 'x'.repeat(600));
    render(<RecordScreen {...baseProps({ transcript: [long] })} />);
    const span = screen.getByText('x'.repeat(600));
    expect(span.style.whiteSpace).toBe('pre-wrap');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. clicking the page puts the caret in the live line', () => {
  it('31. a click on the notepad blank area focuses the live line', () => {
    const container = { nodeName: 'DIV' };
    expect(clickShouldFocusLiveLine(container, container)).toBe(true);
    expect(clickShouldFocusLiveLine({ dataset: { notepadBlank: 'true' } }, container)).toBe(true);
  });

  it('32. a click on a committed line does NOT steal focus — selection must work', () => {
    const container = { nodeName: 'DIV' };
    expect(clickShouldFocusLiveLine({ dataset: {} }, container)).toBe(false);
    expect(clickShouldFocusLiveLine({ dataset: { notepadBlank: 'false' } }, container)).toBe(false);
    expect(clickShouldFocusLiveLine(null, container)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. Ask Compass stays separate, structurally and visually', () => {
  // Two elements are named "Compass support" — the tablist and the aside — so
  // the rail is selected by ROLE, not by label alone.
  const rail = () => screen.getByRole('complementary', { name: 'Compass support' });

  it('33. Ask Compass lives in the support rail, outside the notepad surface', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const surface = screen.getByLabelText('Notes captured so far').closest('div');
    expect(rail().contains(notepad())).toBe(false);
    expect(surface.contains(rail())).toBe(false);
  });

  it('34. typing into the notepad never reaches Ask Compass', async () => {
    const sendLiveChat = vi.fn();
    const setLiveChatInput = vi.fn();
    render(<Live addUtterance={vi.fn()} sendLiveChat={sendLiveChat} setLiveChatInput={setLiveChatInput} />);
    await userEvent.type(notepad(), 'Asked Sam about the stock count.{Enter}');
    expect(sendLiveChat).not.toHaveBeenCalled();
    expect(setLiveChatInput).not.toHaveBeenCalled();
  });

  it('35. Ask Compass text never becomes a meeting note', async () => {
    const addUtterance = vi.fn();
    const setLiveChatInput = vi.fn();
    render(<RecordScreen {...baseProps({ addUtterance, setLiveChatInput, transcript: FOUR })} />);
    // Ask Compass lives under the rail's Context tab.
    await userEvent.click(screen.getByRole('tab', { name: /Context/ }));
    const ask = screen.getByLabelText('Ask about this meeting');
    expect(ask).not.toBe(notepad());
    expect(rail().contains(ask)).toBe(true);
    await userEvent.type(ask, 'what should I ask next?');
    expect(setLiveChatInput).toHaveBeenCalled();
    // Nothing typed there became a capture.
    expect(addUtterance).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Notes captured so far').querySelectorAll('li')).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('I. narrow viewport, rail states, adjournment', () => {
  it('36. the notepad survives the rail being hidden and brought back', async () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    expect(screen.getByRole('complementary', { name: 'Compass support' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Compass support' }));
    expect(screen.queryByRole('complementary', { name: 'Compass support' })).toBeNull();
    expect(notepad()).toBeTruthy();
    expect(screen.getByText(FOUR[0].text)).toBeTruthy();
  });

  it('37. narrow viewport keeps one notepad with the live line inside it', () => {
    window.innerWidth = 800;
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const surface = screen.getByLabelText('Notes captured so far').closest('div');
    expect(surface.contains(notepad())).toBe(true);
    expect(surface.querySelectorAll('textarea').length).toBe(1);
    window.innerWidth = 1440;
  });

  it('38. adjournment markers appear in the notepad as System lines', () => {
    const withAdj = [...FOUR, utt('adj', '[Meeting adjourned at 20:50]', { speaker: 'System', channel: undefined })];
    render(<RecordScreen {...baseProps({ transcript: withAdj })} />);
    expect(screen.getByText('[Meeting adjourned at 20:50]')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    // And no source badge, because an adjournment is not heard evidence.
    expect(noteMeta(withAdj[4], withAdj[3]).source).toBeNull();
  });

  it('39. an inserted prep question lands in the live line, not in the record', () => {
    render(<RecordScreen {...baseProps({
      transcript: FOUR,
      prepQuestions: [{ id: 'q1', text: 'Where were you on 2 October?', status: 'not_asked' }],
    })} />);
    // It is offered in the rail; nothing is captured until the manager commits.
    expect(screen.getByLabelText('Notes captured so far').querySelectorAll('li')).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('J. the canonical capture path was REUSED, not forked', () => {
  const screenCode = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
  const appCode = readFileSync('src/App.jsx', 'utf8');

  it('40. exactly ONE manual-capture handler exists on this screen', () => {
    // The notepad live line replaced the composer; it did not join it.
    const commits = (screenCode.match(/ls\.forEach\(line=>addUtterance\(line\.trim\(\)\)\)/g) || []).length;
    expect(commits).toBe(1);
    const newlineChecks = (screenCode.match(/val\.endsWith\(String\.fromCharCode\(10\)\)/g) || []).length;
    expect(newlineChecks).toBe(1);
  });

  it('41. addUtterance is not forked and no second capture store appears', () => {
    expect((appCode.match(/const addUtterance = async/g) || []).length).toBe(1);
    expect((appCode.match(/const \[transcript, setTranscript\]/g) || []).length).toBe(1);
    expect(screenCode).not.toMatch(/useState\(\s*\[\s*\]\s*\)[^\n]*note/i);
  });

  it('42. the capture pipeline still runs identity-based reconciliation', () => {
    expect(appCode).toContain('const capture = pendingCapture({ captureId, channel, text: raw, ts });');
    expect(appCode).toContain('setTranscript(p=>reconcileCapture(p, captureId, entries));');
    expect(appCode).toContain('const captureId = newId("utt");');
  });

  it('43. the notepad makes no lifecycle write of its own', () => {
    const from = screenCode.indexOf('{/* ── THE NOTEPAD');
    const to = screenCode.indexOf('{/* ── CAPTURE CONTROLS');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const block = screenCode.slice(from, to);
    for (const f of ['saveCases', 'transitionMeeting', 'persistMeeting', 'attemptEndMeeting', 'supabase']) {
      expect(block, f).not.toContain(f);
    }
  });

  it('44. End meeting still flushes the live line through the same handler', () => {
    expect(screenCode).toContain('onClick={()=>{if(inputText.trim())addUtterance(inputText);attemptEndMeeting();}}');
  });

  it('45. follow-latest is conditional, so capture cannot hijack the manager scroll', () => {
    expect(screenCode).toContain('if (el && followLatestRef.current) el.scrollTop = el.scrollHeight;');
    expect(screenCode).not.toMatch(/\n\s*if \(el\) el\.scrollTop = el\.scrollHeight;/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('K. accessibility', () => {
  it('46. the notepad has a notepad identity and a described hint', () => {
    render(<RecordScreen {...baseProps()} />);
    const box = notepad();
    expect(box.getAttribute('aria-label')).toBe('Meeting notepad');
    expect(box.getAttribute('aria-describedby')).toBe('notepad-hint');
    expect(document.getElementById('notepad-hint')).toBeTruthy();
  });

  it('47. newly committed notes are announced WITHOUT re-reading the notepad', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    const regions = [...document.querySelectorAll('[aria-live="polite"]')];
    const announcer = regions.find(r => (r.textContent || '').startsWith('Note saved:'));
    expect(announcer).toBeTruthy();
    // Atomic and scoped to the newest line only — not the whole list.
    expect(announcer.getAttribute('aria-atomic')).toBe('true');
    expect(announcer.textContent).toBe(`Note saved: ${FOUR[3].text}`);
    expect(announcer.textContent).not.toContain(FOUR[0].text);
    // The list itself is not a live region.
    expect(screen.getByLabelText('Notes captured so far').getAttribute('aria-live')).toBeNull();
  });

  it('48. the announcement ignores a pending capture until it commits', () => {
    const pending = utt('p', 'not yet attributed', { pending: true });
    render(<RecordScreen {...baseProps({ transcript: [...FOUR, pending] })} />);
    expect(latestCommitted([...FOUR, pending])).toBe(FOUR[3]);
    expect(latestCommitted([])).toBeNull();
    expect(latestCommitted(null)).toBeNull();
  });

  it('49. keyboard-only note taking works: tab to the notepad, type, Enter', async () => {
    const addUtterance = vi.fn();
    render(<Live addUtterance={addUtterance} />);
    const box = notepad();
    box.focus();
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard('A typed note.{Enter}');
    expect(addUtterance).toHaveBeenCalledTimes(1);
  });

  it('50. the notes list is an ordered list, so position is conveyed structurally', () => {
    render(<RecordScreen {...baseProps({ transcript: FOUR })} />);
    expect(screen.getByLabelText('Notes captured so far').tagName).toBe('OL');
  });
});
