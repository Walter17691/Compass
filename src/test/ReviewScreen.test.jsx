import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the "Ask Compass or edit" field and
// the in-place meeting-record editing textarea had no accessible name
// at all. Had no test coverage at all before this.
const noop = () => {};

const baseProps = {
  caseInfo: { employee: 'Sam Employee', manager: '', date: '', context: '' },
  meetingType: null,
  isHR: true,
  cases: [],
  requestHrReview: noop,
  reviewOutput: 'Meeting record text.',
  reviewOutputOriginal: 'Meeting record text.',
  meetingSummary: '',
  confirmDialog: noop,
  setShowShareModal: noop,
  saveMeetingToCase: noop,
  setScreen: noop,
  showToast: noop,
  askCompassInput: '',
  setAskCompassInput: noop,
  askCompassHistory: [],
  setAskCompassHistory: noop,
  askCompass: noop,
  setAskCompassProcessing: noop,
  askCompassProcessing: false,
  editProcessing: false,
  editRecord: noop,
  editingRecord: false,
  setEditingRecord: noop,
  aiProcessing: false,
  aiError: '',
  setReviewOutput: noop,
  setShowSignModal: noop,
  riskScore: null,
  reviewGenerationFailed: false,
  onRetryGeneration: noop,
};

describe('ReviewScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the Ask Compass / edit input', () => {
    render(<ReviewScreen {...baseProps} />);
    expect(screen.getByLabelText('Ask Compass or edit the record')).toBeInTheDocument();
  });

  it('labels the meeting record textarea while editing', () => {
    render(<ReviewScreen {...baseProps} editingRecord={true} />);
    expect(screen.getByLabelText('Meeting record')).toBeInTheDocument();
  });
});

// Human UAT remediation, Batch 2, Part 3 (HIGH PRIORITY) — the equivalent
// Ask Compass response panel on this screen already used the correct
// plain-string MDRenderer pattern (RecordScreen's duplicate, buggy
// implementation was fixed to match it), so it was never the crash
// source. It's now wrapped in the same AskCompassErrorBoundary as
// defense-in-depth, verified here.
describe('ReviewScreen — Ask Compass response cannot crash the record review (Batch 2, Part 3)', () => {
  it('renders a normal assistant answer as text', () => {
    render(<ReviewScreen {...baseProps} askCompassHistory={[
      { role: 'user', content: 'Was anything missed?' },
      { role: 'assistant', content: 'The record covers the key points raised.' },
    ]} />);
    expect(screen.getByText('The record covers the key points raised.')).toBeInTheDocument();
  });

  it('does not crash the record review when a reply is malformed (not a string)', () => {
    render(<ReviewScreen {...baseProps} askCompassHistory={[
      { role: 'assistant', content: ['not', 'a', 'string'] },
    ]} />);
    expect(screen.getByText(/Compass couldn't display that response, but your meeting notes are safe/)).toBeInTheDocument();
    // The meeting record itself must remain visible and unaffected.
    expect(screen.getByText('Meeting record text.')).toBeInTheDocument();
  });
});

// Release 1.0 UAT remediation (Defect #5, P0 data-integrity risk) — a
// failed AI generation (e.g. a revoked ANTHROPIC_API_KEY, Anthropic
// 401/429/5xx) previously left reviewOutput populated with content the
// user could save believing it was a real meeting record, via "Save to
// case"/"Save and go to case →" buttons that had no gating at all.
describe('ReviewScreen — meeting-record generation failure safety boundary (Defect #5)', () => {
  it('disables both Save actions when there is no generated content', () => {
    render(<ReviewScreen {...baseProps} reviewOutput="" reviewOutputOriginal="" />);
    expect(screen.getByText('Save to case')).toBeDisabled();
    expect(screen.getByText('Save and go to case →')).toBeDisabled();
  });

  it('enables both Save actions once real content exists', () => {
    render(<ReviewScreen {...baseProps} reviewOutput="A real meeting record." />);
    expect(screen.getByText('Save to case')).not.toBeDisabled();
    expect(screen.getByText('Save and go to case →')).not.toBeDisabled();
  });

  it('shows an explicit failure banner distinct from ordinary inline errors, never the raw provider error as content', () => {
    render(<ReviewScreen {...baseProps} reviewOutput="" reviewOutputOriginal="" reviewGenerationFailed={true}
      aiError='API 502: {"ok":false,"error":{"code":"AI_UNAVAILABLE","message":"Compass AI is temporarily unavailable. Please try again shortly."}}' />);
    expect(screen.getByText('Compass AI could not generate the meeting record')).toBeInTheDocument();
    expect(screen.getByText(/Your meeting notes have been kept/)).toBeInTheDocument();
    // The raw error string must never appear anywhere on the page as if
    // it were record content — the plain aiError line is suppressed
    // whenever the dedicated failure banner is showing.
    expect(screen.queryByText(/AI_UNAVAILABLE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"ok":false/)).not.toBeInTheDocument();
    // Save actions must be unavailable while in this failure state.
    expect(screen.getByText('Save to case')).toBeDisabled();
    expect(screen.getByText('Save and go to case →')).toBeDisabled();
  });

  it('does not show the failure banner when generation has not failed', () => {
    render(<ReviewScreen {...baseProps} reviewGenerationFailed={false} />);
    expect(screen.queryByText('Compass AI could not generate the meeting record')).not.toBeInTheDocument();
  });

  it('Retry calls onRetryGeneration', async () => {
    const onRetryGeneration = vi.fn();
    render(<ReviewScreen {...baseProps} reviewOutput="" reviewOutputOriginal="" reviewGenerationFailed={true} onRetryGeneration={onRetryGeneration} />);
    await userEvent.click(screen.getByText('Retry'));
    expect(onRetryGeneration).toHaveBeenCalledTimes(1);
  });

  it('"Write manually" switches to an editable, empty record — a user is never stuck after a failure', async () => {
    const setEditingRecord = vi.fn();
    render(<ReviewScreen {...baseProps} reviewOutput="" reviewOutputOriginal="" reviewGenerationFailed={true} setEditingRecord={setEditingRecord} />);
    await userEvent.click(screen.getByText('Write manually'));
    expect(setEditingRecord).toHaveBeenCalledWith(true);
  });

  it('the record textarea is editable even with no prior AI content once editingRecord is true (manual authoring after a failure)', () => {
    render(<ReviewScreen {...baseProps} reviewOutput="" reviewOutputOriginal="" editingRecord={true} />);
    expect(screen.getByLabelText('Meeting record')).toBeInTheDocument();
  });

  it('saving becomes available again once the user manually writes a record after a failure', () => {
    // Simulates the state after "Write manually" + typing: reviewOutput
    // is now non-empty from the user's own input, reviewGenerationFailed
    // is irrelevant to the gate (only reviewOutput content matters).
    render(<ReviewScreen {...baseProps} reviewOutput="Manually written record." reviewGenerationFailed={true} editingRecord={true} />);
    expect(screen.getByText('Save to case')).not.toBeDisabled();
  });
});
