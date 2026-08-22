import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WellbeingScreen } from '../screens/WellbeingScreen.jsx';

// Phase 6.5 hardening (Batch 13) — every field on the "Add wellbeing
// note" form had a visual label with no htmlFor/id association,
// including the two DateInput-backed date fields. Had no test coverage
// at all before this.
const noop = () => {};
const wellbeingForm = { employeeName: '', type: 'chat', date: '', manager: '', content: '', supportOffered: '', followUpDate: '' };

const baseProps = {
  wellbeingNotes: [],
  activeWellbeing: null,
  wellbeingView: 'new',
  setActiveWellbeing: noop,
  setWellbeingView: noop,
  toggleFollowUpDone: noop,
  wellbeingForm,
  setWellbeingForm: noop,
  addWellbeingNote: noop,
};

describe('WellbeingScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels every field on the add-note form', () => {
    render(<WellbeingScreen {...baseProps} />);
    expect(screen.getByLabelText(/Employee name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Note type')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('HR manager')).toBeInTheDocument();
    expect(screen.getByLabelText(/Conversation notes/)).toBeInTheDocument();
    expect(screen.getByLabelText('Support offered')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date')).toBeInTheDocument();
  });
});
