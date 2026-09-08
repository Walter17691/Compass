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
    render(<OutcomeModal cases={[cs]} activeCaseId="c1" setShowOutcomeModal={noop} outcomeType="" setOutcomeType={noop} outcomeNotes="" setOutcomeNotes={noop} saveCases={noop} showToast={noop} handleLetter={noop} startOffboarding={noop} requestHrReview={noop} allegations={[]} caseSignals={[]} requestOverrideReason={noop} createCaseTask={noop} setCaseInfo={noop} setReviewOutput={noop} />);
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
    requestOverrideReason: noop, createCaseTask: noop, setCaseInfo: noop, setReviewOutput: noop,
  };

  it('closes the modal and shows a success toast only once saveCases resolves { ok: true }', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn().mockResolvedValue({ ok: true });
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

  it('keeps the modal open and shows the generic error toast, without declaring success, on a genuine persistence failure (reason: "error")', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn().mockResolvedValue({ ok: false, reason: 'error' });
    const setShowOutcomeModal = vi.fn();
    const showToast = vi.fn();
    const handleLetter = vi.fn();
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={showToast} handleLetter={handleLetter} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't record the outcome — please try again", 'error'));
    expect(setShowOutcomeModal).not.toHaveBeenCalled();
    expect(handleLetter).not.toHaveBeenCalled();
  });

  // E2E Navigation Alignment pass, outcome-recording defect (P2) —
  // reproduces the actual bug: saveCaseToDB's optimistic-concurrency
  // guard had already recovered from a stale-version conflict (its own
  // "this case was updated... we've refreshed it" info toast already
  // fired, and it already called loadCasesFromDB — both happen inside
  // saveCaseToDB itself, upstream of the mocked saveCases here) before
  // ever returning to this modal. finalizeOutcome must not compound that
  // with its own, wrongly-generic failure toast, must not treat it as a
  // reason to auto-retry, and must not create a second outcome.
  describe('distinguishes a recovered concurrency conflict from a genuine failure (outcome-recording P2 fix)', () => {
    it('does not show the generic failure toast on a conflict (reason: "conflict")', async () => {
      const user = userEvent.setup();
      const saveCases = vi.fn().mockResolvedValue({ ok: false, reason: 'conflict' });
      const showToast = vi.fn();
      render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={noop} showToast={showToast} handleLetter={noop} />);
      await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
      await waitFor(() => expect(saveCases).toHaveBeenCalledTimes(1));
      expect(showToast).not.toHaveBeenCalledWith("Couldn't record the outcome — please try again", 'error');
      // No success toast either — this genuinely didn't succeed yet.
      expect(showToast).not.toHaveBeenCalledWith('Outcome recorded');
    });

    it('does not close the modal, request HR review, or draft the outcome letter on a conflict — no duplicate outcome is created', async () => {
      const user = userEvent.setup();
      const saveCases = vi.fn().mockResolvedValue({ ok: false, reason: 'conflict' });
      const setShowOutcomeModal = vi.fn();
      const requestHrReview = vi.fn();
      const handleLetter = vi.fn();
      render(<OutcomeModal {...baseProps} outcomeType="Final written warning" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={noop} handleLetter={handleLetter} requestHrReview={requestHrReview} />);
      await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
      await waitFor(() => expect(saveCases).toHaveBeenCalledTimes(1));
      expect(setShowOutcomeModal).not.toHaveBeenCalled();
      expect(requestHrReview).not.toHaveBeenCalled();
      expect(handleLetter).not.toHaveBeenCalled();
    });

    it('does not automatically retry — saveCases is called exactly once even after a conflict resolves', async () => {
      const user = userEvent.setup();
      const saveCases = vi.fn().mockResolvedValue({ ok: false, reason: 'conflict' });
      render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={noop} showToast={noop} handleLetter={noop} />);
      await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
      await waitFor(() => expect(saveCases).toHaveBeenCalledTimes(1));
      // Give any stray microtask/retry a chance to fire, then confirm
      // the count never grows on its own.
      await new Promise(r => setTimeout(r, 50));
      expect(saveCases).toHaveBeenCalledTimes(1);
    });

    it('preserves the entered outcome/notes after a conflict, so a conscious retry against the refreshed case can subsequently succeed', async () => {
      const user = userEvent.setup();
      const saveCases = vi.fn()
        .mockResolvedValueOnce({ ok: false, reason: 'conflict' })
        .mockResolvedValueOnce({ ok: true });
      const setShowOutcomeModal = vi.fn();
      const showToast = vi.fn();
      const handleLetter = vi.fn();
      render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={setShowOutcomeModal} showToast={showToast} handleLetter={handleLetter} />);

      // First attempt: loses to a conflict — nothing declared, modal stays.
      await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
      await waitFor(() => expect(saveCases).toHaveBeenCalledTimes(1));
      expect(setShowOutcomeModal).not.toHaveBeenCalled();

      // The Issue outcome control is enabled again — the outcome/notes
      // this modal holds are exactly what a retry (against the now-
      // refreshed `cases` prop the real app would have re-rendered with)
      // resubmits, not lost or cleared by the failed first attempt.
      const retryButton = screen.getByRole('button', { name: /Issue outcome/ });
      await waitFor(() => expect(retryButton).toBeEnabled());
      await user.click(retryButton);
      await waitFor(() => expect(saveCases).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(setShowOutcomeModal).toHaveBeenCalledWith(false));
      expect(showToast).toHaveBeenCalledWith('Outcome recorded');
      expect(handleLetter).toHaveBeenCalledWith('outcome');
    });
  });

  it('disables Issue outcome and Cancel, and shows a pending label, while the save is in flight', async () => {
    const user = userEvent.setup();
    let resolveSave;
    const saveCases = vi.fn(() => new Promise(r => { resolveSave = r; }));
    render(<OutcomeModal {...baseProps} outcomeType="No further action" saveCases={saveCases} setShowOutcomeModal={noop} showToast={noop} handleLetter={noop} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    expect(screen.getByRole('button', { name: 'Recording outcome…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    resolveSave({ ok: true });
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
    resolveSave({ ok: true });
    await waitFor(() => expect(setShowOutcomeModal).toHaveBeenCalledWith(false));
  });
});

// UAT Golden Path remediation (Defect #11/#12/#13) — the actual root
// cause: this modal's "Issue outcome & generate letter" button was the
// only handleLetter call site in the app that never set caseInfo (or
// reviewOutput) from the authoritative case + its hearing meeting before
// drafting a letter, unlike CaseViewScreen.jsx's disciplinary_invite/
// outcome_letter/appeal/no-case-answer actions, which all do this
// immediately before their own handleLetter calls. With no explicit
// "Employee: X" fact, the AI fell back to inferring the recipient from
// the case's own free-text description — which named a different real
// participant (a reporting manager) — producing an apparently-valid
// letter addressed to the wrong person. These tests verify the fix:
// caseInfo/reviewOutput are now grounded from cs/its hearing meeting
// immediately before handleLetter fires.
describe('OutcomeModal — grounds caseInfo/reviewOutput before drafting the outcome letter (Defect #11/#12/#13)', () => {
  const goldenPathCase = {
    id: 'c1',
    employeeName: 'UAT - Test Employee (Golden Path)',
    manager: 'Walter Carta',
    description: "Allegation: repeated late arrival without notice. O'Brien-Test's manager (Site Lead) raised the concern.",
    meetings: [
      { id: 'm1', type: 'Investigation', date: '2026-09-07', record: 'Investigation record text.' },
      { id: 'm2', type: 'Disciplinary', date: '2026-09-08', record: 'The panel decided a first written warning, to remain on file for six months.' },
    ],
  };
  const groundingProps = {
    cases: [goldenPathCase], activeCaseId: 'c1', setOutcomeType: noop,
    outcomeNotes: 'Documented rationale for this test.', setOutcomeNotes: noop,
    startOffboarding: noop, requestHrReview: noop, allegations: [], caseSignals: [],
    requestOverrideReason: noop, createCaseTask: noop, saveCases: vi.fn().mockResolvedValue({ ok: true }),
    setShowOutcomeModal: noop, showToast: noop,
  };

  it('sets caseInfo.employee to the case\'s real employeeName, never a name pulled from the case narrative', async () => {
    const user = userEvent.setup();
    const setCaseInfo = vi.fn();
    render(<OutcomeModal {...groundingProps} outcomeType="First written warning" handleLetter={noop} setCaseInfo={setCaseInfo} setReviewOutput={noop} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(setCaseInfo).toHaveBeenCalled());
    const updater = setCaseInfo.mock.calls[0][0];
    const result = updater({});
    expect(result.employee).toBe('UAT - Test Employee (Golden Path)');
    expect(result.employee).not.toMatch(/O'Brien-Test/);
    expect(result.manager).toBe('Walter Carta');
  });

  it('sets reviewOutput to the relevant Disciplinary meeting\'s own record, grounding the AI on the real hearing decision (six months, not a guessed default)', async () => {
    const user = userEvent.setup();
    const setReviewOutput = vi.fn();
    render(<OutcomeModal {...groundingProps} outcomeType="First written warning" handleLetter={noop} setCaseInfo={noop} setReviewOutput={setReviewOutput} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(setReviewOutput).toHaveBeenCalledWith(expect.stringContaining('six months')));
  });

  it('grounds before calling handleLetter, so the AI request is never sent ungrounded', async () => {
    const user = userEvent.setup();
    const calls = [];
    const setCaseInfo = () => calls.push('setCaseInfo');
    const handleLetter = () => calls.push('handleLetter');
    render(<OutcomeModal {...groundingProps} outcomeType="First written warning" handleLetter={handleLetter} setCaseInfo={setCaseInfo} setReviewOutput={noop} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(calls).toContain('handleLetter'));
    expect(calls.indexOf('setCaseInfo')).toBeLessThan(calls.indexOf('handleLetter'));
  });

  it('picks the most recent Disciplinary/Grievance meeting when several meetings exist, not just the last meeting overall', async () => {
    const user = userEvent.setup();
    const caseWithTrailingNote = {
      ...goldenPathCase,
      meetings: [...goldenPathCase.meetings, { id: 'm3', type: 'Informal check-in', date: '2026-09-09', record: 'Unrelated later note.' }],
    };
    const setReviewOutput = vi.fn();
    render(<OutcomeModal {...groundingProps} cases={[caseWithTrailingNote]} outcomeType="First written warning" handleLetter={noop} setCaseInfo={noop} setReviewOutput={setReviewOutput} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(setReviewOutput).toHaveBeenCalledWith(expect.stringContaining('six months')));
  });

  it('falls back to the last meeting overall when no Disciplinary/Grievance meeting exists', async () => {
    const user = userEvent.setup();
    const caseNoHearing = { ...goldenPathCase, meetings: [{ id: 'm1', type: 'Informal chat', date: '2026-09-01', record: 'Only an informal chat happened.' }] };
    const setReviewOutput = vi.fn();
    render(<OutcomeModal {...groundingProps} cases={[caseNoHearing]} outcomeType="First written warning" handleLetter={noop} setCaseInfo={noop} setReviewOutput={setReviewOutput} />);
    await user.click(screen.getByRole('button', { name: /Issue outcome/ }));
    await waitFor(() => expect(setReviewOutput).toHaveBeenCalledWith('Only an informal chat happened.'));
  });
});
