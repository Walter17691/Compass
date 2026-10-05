import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordScreen } from '../screens/RecordScreen.jsx';
import {
  supportCounts, defaultSupportCategory, elapsedSince, captureState, SUPPORT_CATEGORY,
} from '../lib/liveMeetingSupport.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C3 — the live meeting, rendered.
//
// The rail carried NINE always-visible support surfaces during an employee
// conversation. And the screen never showed the conversation: `transcript` was
// read only for its length, so a manager typed, pressed Enter, watched the text
// vanish, and saw only "3 notes captured".
//
// These render and interact. The source-text assertions below are only where
// the claim IS about source — that this screen performs no lifecycle write of
// its own — and then with comments stripped, because the screen documents what
// it deliberately does not do.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

// jsdom reports innerWidth 1024, which IS the narrow breakpoint, so the support
// rail is correctly hidden by default there. Desktop is the default context for
// these tests; the narrow case has its own test below.
beforeEach(() => {
  window.innerWidth = 1440;
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
});
const utt = (id, text, ts = '09:30:00', over = {}) => ({ id, text, ts, speaker: 'You', pending: false, ...over });

const props = (over = {}) => ({
  recovering: false,
  meetingType: { id: 'investigation', label: 'Investigation Meeting' },
  caseInfo: { employee: 'Sam Employee', date: '2026-10-02', meetingId: 'm-1' },
  isListening: false,
  meetingStartTime: null,
  currentAdjournment: null,
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

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — the conversation is visible', () => {
  it('captured notes are RENDERED, not just counted', () => {
    // The defect: transcript was read only for .length. A manager could not see
    // what Compass had recorded while it was recording.
    render(<RecordScreen {...props({ transcript: [
      utt('u1', 'You said you were not rostered that day.'),
      utt('u2', 'I was on the late shift.', '09:31:00'),
    ] })} />);
    expect(screen.getByText('You said you were not rostered that day.')).toBeInTheDocument();
    expect(screen.getByText('I was on the late shift.')).toBeInTheDocument();
  });

  it('each captured line keeps its timestamp', () => {
    render(<RecordScreen {...props({ transcript: [utt('u1', 'A line', '14:05:00')] })} />);
    expect(screen.getByText('14:05:00')).toBeInTheDocument();
  });

  it('an empty meeting says so plainly rather than looking broken', () => {
    render(<RecordScreen {...props()} />);
    // Appears as the capture status AND as the empty-state explanation.
    expect(screen.getAllByText(/Nothing captured yet/).length).toBeGreaterThan(0);
  });

  it('a pending line is shown rather than hidden until it settles', () => {
    render(<RecordScreen {...props({ transcript: [utt('u1', 'Still saving', '09:30:00', { pending: true })] })} />);
    expect(screen.getByText('Still saving')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — the header answers the five questions without being asked', () => {
  it('WHO: the employee', () => {
    render(<RecordScreen {...props()} />);
    expect(screen.getByText('Sam Employee')).toBeInTheDocument();
  });

  it('WHAT: the meeting type and date', () => {
    render(<RecordScreen {...props()} />);
    expect(screen.getByText('Investigation Meeting')).toBeInTheDocument();
    expect(screen.getByText('2026-10-02')).toBeInTheDocument();
  });

  it('IS IT CAPTURING: in words, never colour alone', () => {
    render(<RecordScreen {...props({ isListening: true })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Listening');
  });

  it('HOW LONG: elapsed time, alongside the start time', () => {
    const started = new Date(Date.now() - 42 * 60000).toISOString();
    render(<RecordScreen {...props({ meetingStartTime: started })} />);
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(screen.getByText(/4[12]m elapsed/)).toBeInTheDocument();
  });

  it('HOW DO I FINISH: End meeting is always discoverable', () => {
    render(<RecordScreen {...props({ transcript: [utt('u1', 'x')] })} />);
    expect(screen.getByRole('button', { name: /End meeting/ })).toBeEnabled();
  });

  it('End meeting flushes the composer then transitions — unchanged', async () => {
    const addUtterance = vi.fn();
    const attemptEndMeeting = vi.fn();
    const user = userEvent.setup();
    render(<RecordScreen {...props({ inputText: 'a final line', addUtterance, attemptEndMeeting })} />);
    await user.click(screen.getByRole('button', { name: /End meeting/ }));
    expect(addUtterance).toHaveBeenCalledWith('a final line');
    expect(attemptEndMeeting).toHaveBeenCalledTimes(1);
  });

  it('this screen performs no lifecycle write of its own', () => {
    const code = readFileSync('src/screens/RecordScreen.jsx', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('│')).join('\n');
    ['review_draft', 'supabase', 'setMeetingStatus'].forEach(bad => expect(code, bad).not.toContain(bad));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — ONE support surface, not nine', () => {
  const withEverything = props({
    prepQuestions: [{ id: 'q1', text: 'Where were you?', status: 'not_asked', essential: true, reasoning: 'Grounded.' }],
    meetingIntelligence: {
      possibleInconsistency: { earlier: 'A', later: 'B', suggestedQuestion: 'Which was it?' },
      suggestedFollowUp: { text: 'Who else saw that?', reasoning: 'Not covered.' },
      newIssues: ['Mentioned a grievance'],
    },
    meetingEvidenceSuggestions: [{ id: 'e1', status: 'pending', kind: 'witness', description: 'Priya on the late shift' }],
    meetingActionSuggestions: [{ id: 'a1', status: 'pending', description: 'Obtain the rota' }],
    liveContext: 'Discussing the rota.',
  });

  it('exactly one support region exists', () => {
    render(<RecordScreen {...withEverything} />);
    expect(screen.getAllByRole('complementary', { name: 'Compass support' })).toHaveLength(1);
  });

  it('only ONE category is shown at a time', () => {
    render(<RecordScreen {...withEverything} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('the nine old surfaces cannot all render simultaneously', () => {
    render(<RecordScreen {...withEverything} />);
    // Questions leads when prepared questions exist; guidance content is NOT
    // also on screen at the same time.
    expect(screen.getByText('Where were you?')).toBeInTheDocument();
    expect(screen.queryByText(/Priya on the late shift/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Obtain the rota/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Discussing the rota/)).not.toBeInTheDocument();
  });

  it('what is waiting is announced as a count, not pushed on screen', () => {
    render(<RecordScreen {...withEverything} />);
    expect(screen.getByRole('tab', { name: /Guidance \(\d+\)/ })).toBeInTheDocument();
  });

  it('switching category changes what is rendered', async () => {
    const user = userEvent.setup();
    render(<RecordScreen {...withEverything} />);
    await user.click(screen.getByRole('tab', { name: /Guidance/ }));
    expect(screen.getByText(/Priya on the late shift/)).toBeInTheDocument();
    expect(screen.queryByText('Where were you?')).not.toBeInTheDocument();
  });

  it('the rail can be hidden entirely, and brought back', async () => {
    const user = userEvent.setup();
    render(<RecordScreen {...withEverything} />);
    await user.click(screen.getByRole('button', { name: 'Hide Compass support' }));
    expect(screen.queryByRole('complementary', { name: 'Compass support' })).not.toBeInTheDocument();
    // The conversation is still there — hiding support never hides the meeting.
    expect(screen.getByLabelText('Meeting notepad')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Compass support' }));
    expect(screen.getByRole('complementary', { name: 'Compass support' })).toBeInTheDocument();
  });

  it('no score, percentage, progress bar or quality rating anywhere', () => {
    const { container } = render(<RecordScreen {...withEverything} />);
    expect(container.textContent).not.toMatch(/%|readiness|score|complete[d]? \d|progress/i);
    expect(container.querySelector('progress')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — suggestions stay advisory, and Compass acts on nothing', () => {
  const guidance = over => props({
    meetingIntelligence: {
      possibleInconsistency: { earlier: 'A', later: 'B', suggestedQuestion: 'Which was it?' },
      suggestedFollowUp: { text: 'Who else saw that?' },
    },
    meetingEvidenceSuggestions: [{ id: 'e1', status: 'pending', kind: 'witness', description: 'Priya' }],
    meetingActionSuggestions: [{ id: 'a1', status: 'pending', description: 'Obtain the rota' }],
    ...over,
  });

  it('a suggested question is INSERTED for the manager, never auto-asked', async () => {
    const setInputText = vi.fn();
    const user = userEvent.setup();
    render(<RecordScreen {...guidance({ setInputText })} />);
    await user.click(screen.getByRole('tab', { name: /Guidance/ }));
    await user.click(screen.getAllByRole('button', { name: 'Insert question' })[0]);
    expect(setInputText).toHaveBeenCalled();
  });

  it('accepting a witness suggestion is an explicit human act on the existing handler', async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<RecordScreen {...guidance({ onAcceptMeetingEvidenceSuggestion: onAccept })} />);
    await user.click(screen.getByRole('tab', { name: /Guidance/ }));
    expect(onAccept).not.toHaveBeenCalled();            // nothing created on render
    await user.click(screen.getByRole('button', { name: 'Add to case' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('nothing is created merely by the meeting running', () => {
    const onAcceptE = vi.fn(), onAcceptA = vi.fn();
    render(<RecordScreen {...guidance({ onAcceptMeetingEvidenceSuggestion: onAcceptE, onAcceptMeetingActionSuggestion: onAcceptA })} />);
    expect(onAcceptE).not.toHaveBeenCalled();
    expect(onAcceptA).not.toHaveBeenCalled();
  });

  it('new issues are noted, and say that nothing has been created from them', async () => {
    const user = userEvent.setup();
    render(<RecordScreen {...props({ meetingIntelligence: { newIssues: ['Mentioned a grievance'] } })} />);
    await user.click(screen.getByRole('tab', { name: /Guidance/ }));
    expect(screen.getByText('Mentioned a grievance')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been created from these/)).toBeInTheDocument();
  });

  it('questions are explicitly optional', async () => {
    const user = userEvent.setup();
    render(<RecordScreen {...props({ prepQuestions: [{ id: 'q1', text: 'Q', status: 'not_asked' }] })} />);
    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    expect(screen.getByText(/none of these is required/i)).toBeInTheDocument();
  });

  it('a question keeps its accessible status control naming the question', () => {
    render(<RecordScreen {...props({ prepQuestions: [{ id: 'q1', text: 'Where were you?', status: 'not_asked' }] })} />);
    expect(screen.getByLabelText('Status for: Where were you?')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — the support model, as logic', () => {
  it('counts what is waiting, and context is never "waiting"', () => {
    const c = supportCounts({
      prepQuestions: [{ status: 'not_asked' }, { status: 'asked' }, {}],
      coachingTips: [{}], showNudge: true,
      evidenceSuggestions: [{ status: 'pending' }, { status: 'accepted' }],
      meetingIntelligence: { newIssues: ['a', 'b'] },
    });
    expect(c.questions).toBe(2);
    expect(c.guidance).toBe(5);
    expect(c.context).toBe(0);
  });

  it('leads with what the manager prepared, not with the most content', () => {
    expect(defaultSupportCategory({ questions: 2, guidance: 9 })).toBe(SUPPORT_CATEGORY.QUESTIONS);
    expect(defaultSupportCategory({ questions: 0, guidance: 3 })).toBe(SUPPORT_CATEGORY.GUIDANCE);
    expect(defaultSupportCategory({})).toBe(SUPPORT_CATEGORY.CONTEXT);
  });

  it('elapsed time is a duration, never a countdown or a target', () => {
    const now = new Date('2026-10-02T11:35:00');
    expect(elapsedSince('2026-10-02T10:53:00', now)).toBe('42m');
    expect(elapsedSince('2026-10-02T09:30:00', now)).toBe('2h 5m');
    expect(elapsedSince(null, now)).toBeNull();
    expect(elapsedSince('not-a-date', now)).toBeNull();
  });

  it('capture state says what is true, with a reason', () => {
    expect(captureState({ isListening: true }).label).toBe('Listening');
    expect(captureState({ transcriptLength: 3 }).label).toBe('3 notes captured');
    expect(captureState({ hasDraftText: true }).label).toBe('Not captured yet');
    expect(captureState({}).label).toBe('Nothing captured yet');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C3 — narrow viewport, accessibility, palette', () => {
  const setWidth = w => {
    window.innerWidth = w;
    if (!window.matchMedia) window.matchMedia = q => ({ matches: w <= 1024, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  };

  it('narrow does not squeeze a rail beside the conversation', async () => {
    setWidth(820);
    render(<RecordScreen {...props({ prepQuestions: [{ id: 'q1', text: 'Q', status: 'not_asked' }] })} />);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    const aside = screen.queryByRole('complementary', { name: 'Compass support' });
    if (aside) {
      // If shown at all when narrow, it is a sheet across the bottom — never a
      // fixed-width column stealing horizontal space from the transcript.
      expect(aside.style.width).not.toBe('320px');
      expect(aside.style.maxHeight).toBeTruthy();
    }
    expect(screen.getByLabelText('Meeting notepad')).toBeInTheDocument();
    setWidth(1440);
  });

  it('the meeting controls carry accessible labels and pressed state', () => {
    render(<RecordScreen {...props({ isListening: true })} />);
    const mic = screen.getByRole('button', { name: /microphone/i });
    expect(mic).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Import transcript/ })).toBeInTheDocument();
  });

  it('capture state is announced to assistive technology', () => {
    render(<RecordScreen {...props({ transcript: [utt('u1', 'x')] })} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('support categories report selection to assistive technology', () => {
    render(<RecordScreen {...props()} />);
    screen.getAllByRole('tab').forEach(t => expect(t).toHaveAttribute('aria-selected'));
  });

  it('no warm legacy palette anywhere, by computed style', () => {
    const WARM = ['rgb(253, 250, 245)', 'rgb(232, 224, 208)', 'rgb(237, 229, 216)', 'rgb(245, 241, 234)'];
    const { container } = render(<RecordScreen {...props({
      transcript: [utt('u1', 'x')],
      prepQuestions: [{ id: 'q1', text: 'Q', status: 'not_asked' }],
    })} />);
    const hits = [];
    container.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      ['backgroundColor', 'borderTopColor', 'borderLeftColor', 'borderBottomColor'].forEach(p => {
        if (WARM.includes(s[p])) hits.push(`${el.tagName}.${p}`);
      });
    });
    expect(hits).toEqual([]);
  });

  it('Archivo only — no legacy font families', () => {
    expect(readFileSync('src/screens/RecordScreen.jsx', 'utf8')).not.toMatch(/DM Sans|DM Serif|Georgia/);
  });

  it('the recovery state still protects a cold load', () => {
    render(<RecordScreen {...props({ recovering: true })} />);
    expect(screen.getByText(/Restoring your meeting/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been lost/)).toBeInTheDocument();
  });
});
