import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
