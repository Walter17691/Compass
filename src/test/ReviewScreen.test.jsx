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
