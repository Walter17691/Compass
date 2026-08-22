import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutcomeModal } from '../screens/OutcomeModal.jsx';

// Phase 6.5 hardening (Batch 13) — the outcome decision select and the
// notes textarea had visual labels with no htmlFor/id association. Had
// no test coverage at all before this.
const noop = () => {};
const cs = { id: 'c1', employeeName: 'Sam Employee' };

describe('OutcomeModal — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the outcome decision select and the notes field', () => {
    render(<OutcomeModal cases={[cs]} activeCaseId="c1" setShowOutcomeModal={noop} outcomeType="" setOutcomeType={noop} outcomeNotes="" setOutcomeNotes={noop} saveCases={noop} showToast={noop} handleLetter={noop} startOffboarding={noop} requestHrReview={noop} allegations={[]} caseSignals={[]} requestOverrideReason={noop} createCaseTask={noop} />);
    expect(screen.getByLabelText('Outcome decision')).toBeInTheDocument();
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument();
  });
});
