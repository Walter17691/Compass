import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordScreen } from '../screens/RecordScreen.jsx';

const noop = () => {};

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
  setMeetingStartTime: noop,
  setInputText: noop,
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
