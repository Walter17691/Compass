import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordScreen } from '../screens/RecordScreen.jsx';

const noop = () => {};

// Same ISO-or-UK normalisation as App.jsx's own fmtDate (not imported —
// it's a local, unexported helper there), so tests exercise the real
// bug (a raw "YYYY-MM-DD" caseInfo.date rendering unformatted) rather
// than a fmtDate that just echoes its input back.
const fmtDate = d => {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }
  return d;
};

const baseProps = {
  meetingType: { label: 'Investigation meeting' },
  caseInfo: { employee: 'Sam Employee', date: '2026-08-27' },
  isListening: false,
  meetingStartTime: null,
  currentAdjournment: null,
  setAdjournments: noop,
  setCurrentAdjournment: noop,
  setTranscript: noop,
  inputText: '',
  aiProcessing: false,
  transcript: [],
  addUtterance: noop,
  inputRef: { current: null },
  setInputText: noop,
  fmtDate,
  updateLiveContext: noop,
  stopSpeech: noop,
  startSpeech: noop,
  isScreenCapturing: false,
  stopScreenCapture: noop,
  startScreenCapture: noop,
  importFileRef: { current: null },
  handleImportFile: noop,
  liveContextLoading: false,
  liveContext: null,
  liveChatHistory: [],
  liveChatProcessing: false,
  liveChatInput: '',
  setLiveChatInput: noop,
  sendLiveChat: noop,
  setScreen: noop,
  confirmDialog: vi.fn().mockResolvedValue(true),
  clearMeetingDraft: noop,
  promptDialog: vi.fn().mockResolvedValue(null),
  updateMeetingIntelligence: noop,
  meetingIntelligence: null,
  dismissedNudgeKey: null,
  setDismissedNudgeKey: noop,
  onSetPrepQuestionStatus: noop,
  onAcceptMeetingEvidenceSuggestion: noop,
  onDismissMeetingEvidenceSuggestion: noop,
  onAcceptMeetingActionSuggestion: noop,
  onDismissMeetingActionSuggestion: noop,
  dismissedFollowUpKey: null,
  setDismissedFollowUpKey: noop,
  attemptEndMeeting: noop,
  showQualityCheck: false,
  proceedPastQualityCheck: noop,
  createQualityCheckFollowUp: noop,
  onReturnToMeeting: noop,
  onDismissCoachingTip: noop,
};

// Phase 6.5 hardening (closes Prompt 11 audit finding 6.2, MEDIUM) — a
// <label> wrapping a display:none file input triggers it for a mouse
// click, but is never itself part of the keyboard tab order, and neither
// is a display:none input — a keyboard-only user had no way to reach
// "Import transcript" at all.
describe('RecordScreen — Import transcript is keyboard-reachable (Prompt 11 audit, 6.2)', () => {
  it('renders "Import transcript" as a real, focusable button', () => {
    render(<RecordScreen {...baseProps} />);
    const btn = screen.getByRole('button', { name: 'Import transcript' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('clicking the button triggers the hidden file input, not a label-click workaround', async () => {
    const user = userEvent.setup();
    const importFileRef = { current: null };
    const { container } = render(<RecordScreen {...baseProps} importFileRef={importFileRef} />);
    const fileInput = container.querySelector('input[type="file"]');
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

    await user.click(screen.getByRole('button', { name: 'Import transcript' }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('is reachable and activatable via the keyboard alone (Tab + Enter)', async () => {
    const user = userEvent.setup();
    const importFileRef = { current: null };
    const { container } = render(<RecordScreen {...baseProps} importFileRef={importFileRef} />);
    const fileInput = container.querySelector('input[type="file"]');
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

    const btn = screen.getByRole('button', { name: 'Import transcript' });
    btn.focus();
    expect(btn).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

// Human UAT remediation, Batch 2, Part 4 — the header showed a raw ISO
// caseInfo.date ("2026-08-27") unformatted, and a live meeting's start
// time (once set) was a bare HH:MM with no date at all.
describe('RecordScreen — meeting date/time is shown in UK format (Batch 2, Part 4)', () => {
  it('formats a raw ISO caseInfo.date via the fmtDate prop rather than showing it verbatim', () => {
    render(<RecordScreen {...baseProps} caseInfo={{ employee: 'Sam Employee', date: '2026-08-27' }} />);
    expect(screen.getByText('27/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-27')).not.toBeInTheDocument();
  });

  it('falls back to the raw value when no fmtDate prop is given, rather than crashing', () => {
    const propsWithoutFmtDate = { ...baseProps };
    delete propsWithoutFmtDate.fmtDate;
    render(<RecordScreen {...propsWithoutFmtDate} caseInfo={{ employee: 'Sam Employee', date: '2026-08-27' }} />);
    expect(screen.getByText('2026-08-27')).toBeInTheDocument();
  });

  it('shows a set meeting start time as a UK date + time, not a bare HH:MM', () => {
    render(<RecordScreen {...baseProps} meetingStartTime="2026-08-31T14:32:00.000Z" />);
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(screen.getByText(/31\/08\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^14:32$/)).not.toBeInTheDocument();
  });

  it('shows nothing for meeting start time until one is actually set', () => {
    render(<RecordScreen {...baseProps} meetingStartTime={null} />);
    expect(screen.queryByText(/Started/)).not.toBeInTheDocument();
  });
});

// Human UAT remediation, Batch 2, Part 3 (HIGH PRIORITY) — asking Compass
// a question during a live meeting crashed the whole app: the old code
// pre-rendered assistant replies into an array of JSX elements and fed
// that array into MDRenderer's `text` prop, which unconditionally calls
// `text.replace(...)`. The fix reuses the same plain-string pattern
// ReviewScreen already used correctly, and adds a boundary scoped to just
// this response list so any future rendering problem in AI-generated
// content can't take down the meeting notes the user is mid-way through
// capturing (see AskCompassErrorBoundary.jsx for the full rationale).
describe('RecordScreen — Ask Compass cannot crash the meeting workspace (Batch 2, Part 3)', () => {
  it('renders a normal assistant answer as text', () => {
    render(<RecordScreen {...baseProps} liveChatHistory={[
      { role: 'user', content: 'What should I ask the employee?' },
      { role: 'assistant', content: 'Ask them to describe events in their own words.' },
    ]} />);
    expect(screen.getByText('Ask them to describe events in their own words.')).toBeInTheDocument();
  });

  it('shows "Thinking..." while a live question is processing', () => {
    render(<RecordScreen {...baseProps} liveChatProcessing={true} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('does not crash the meeting workspace when a reply is malformed (not a string)', () => {
    // Reproduces the exact shape that used to reach MDRenderer before the
    // fix — a non-string `content` — to prove the local error boundary
    // now catches it instead of the render throwing.
    render(<RecordScreen {...baseProps} liveChatHistory={[
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: ['not', 'a', 'string'] },
    ]} />);
    expect(screen.getByText(/Compass couldn't display that response, but your meeting notes are safe/)).toBeInTheDocument();
    // The meeting notes textarea must remain intact and usable — this is
    // the whole point of scoping the boundary to just the response panel.
    expect(screen.getByPlaceholderText(/Type or speak your meeting notes here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /End meeting/ })).toBeInTheDocument();
  });

  it('recovers automatically once a new, valid question/answer arrives', () => {
    const { rerender } = render(<RecordScreen {...baseProps} liveChatHistory={[
      { role: 'assistant', content: ['broken'] },
    ]} />);
    expect(screen.getByText(/couldn't display that response/)).toBeInTheDocument();

    rerender(<RecordScreen {...baseProps} liveChatHistory={[
      { role: 'assistant', content: 'A normal reply.' },
    ]} />);
    expect(screen.getByText('A normal reply.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't display that response/)).not.toBeInTheDocument();
  });
});
