import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) — used to
// call saveCases fire-and-forget, then immediately close the modal and
// declare "Outcome recorded" before the write had actually been
// confirmed. The single highest-stakes write in the app: cs.outcome
// starts the real ACAS appeal-window clock, so success now only reports
// once saveCases' own returned Promise<boolean> has resolved true.
describe('OutcomeModal — does not report success until the save is confirmed (Prompt 16 audit, H4)', () => {
  // outcomeNotes must be non-empty — computeDecisionQualityGaps flags a
  // recorded outcome with no documented rationale as its own gap, which
  // would route issueOutcome through the DecisionQualityCheckModal
  // instead of straight to finalizeOutcome, the flow these tests target.
  const baseProps = {
    cases: [cs], activeCaseId: 'c1', setOutcomeType: noop, outcomeNotes: 'Documented rationale for this test.', setOutcomeNotes: noop,
    handleLetter: noop, startOffboarding: noop, requestHrReview: noop, allegations: [], caseSignals: [],
    requestOverrideReason: noop, createCaseTask: noop,
  };

  it('closes the modal and shows a success toast only once saveCases resolves true', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn().mockResolvedValue(true);
    const setShowOutcomeModal = vi.fn();
    const showToast = vi.fn();
    const handleLetter = vi.fn();
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={showToast} handleLetter={handleLetter} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    expect(saveCases).toHaveBeenCalledWith(expect.any(Array), 'c1');
    await waitFor(() => expect(setShowOutcomeModal).toHaveBeenCalledWith(false));
    expect(showToast).toHaveBeenCalledWith('Outcome recorded');
    expect(handleLetter).toHaveBeenCalledWith('outcome');
  });

  it('keeps the modal open and shows an error toast, without declaring success, when saveCases resolves false', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn().mockResolvedValue(false);
    const setShowOutcomeModal = vi.fn();
    const showToast = vi.fn();
    const handleLetter = vi.fn();
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={showToast} handleLetter={handleLetter} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't record the outcome — please try again", 'error'));
    expect(setShowOutcomeModal).not.toHaveBeenCalled();
    expect(handleLetter).not.toHaveBeenCalled();
  });

  it('disables Issue outcome and Cancel, and shows a pending label, while the save is in flight', async () => {
    const user = userEvent.setup();
    let resolveSave;
    const saveCases = vi.fn(() => new Promise(r => { resolveSave = r; }));
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={noop} showToast={noop} handleLetter={noop} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    expect(screen.getByRole('button', { name: 'Recording outcome…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    resolveSave(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recording outcome…' })).not.toBeInTheDocument());
  });

  it('does not close the modal on Escape while the save is in flight', async () => {
    const user = userEvent.setup();
    let resolveSave;
    const saveCases = vi.fn(() => new Promise(r => { resolveSave = r; }));
    const setShowOutcomeModal = vi.fn();
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={noop} handleLetter={noop} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await user.keyboard('{Escape}');
    expect(setShowOutcomeModal).not.toHaveBeenCalled();
    resolveSave(true);
    await waitFor(() => expect(setShowOutcomeModal).toHaveBeenCalledWith(false));
  });
});
