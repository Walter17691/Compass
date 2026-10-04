import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeModal } from '../screens/OutcomeModal.jsx';
import { PromptModal } from '../components/PromptModal.jsx';
import { requestOverride } from '../lib/humanOverride.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3c — the override reason must survive, and must be required.
//
// Production UAT, case 25d61d15…: the user typed
//   "UAT test case. Proceeding with the recorded outcome despite the
//    identified quality checks to verify the decision workflow."
// and the persisted audit event said "— no reason given". A database-wide
// search found no copy of the text. Compass was not merely omitting
// information; it was affirmatively recording something that did not happen.
//
// WHY A UNIT TEST COULD NEVER HAVE CAUGHT IT. lib/humanOverride.js was already
// correct and already tested on both branches, and PromptModal was already a
// controlled input honouring `required`. The defect lived in the SEAM: how
// OutcomeModal hands over to the prompt. So this file drives the real chain —
// real OutcomeModal, real DecisionQualityCheckModal, real PromptModal, real
// requestOverride — through a harness wired the way App.jsx wires it.
// ─────────────────────────────────────────────────────────────────────────

const CASE = { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', meetings: [], evidence: [] };

// One substantiated allegation with no reasoning, no linked evidence and no
// policy signal: exactly the UAT shape, which yields several gaps.
const ALLEGATIONS = [{
  id: 'a1', caseId: 'c1', title: 'Unauthorised absence', status: 'substantiated',
  decisionReasoning: '', employeeResponse: 'Explained the absence.',
}];

// The App.jsx wiring, reproduced: promptDialog resolves a promise that the
// rendered PromptModal settles, and requestOverrideReason is the real helper
// bound to that dialog and to audit.
function Harness({ audit, recordCaseDecision, onPromptFields }) {
  const [promptState, setPromptState] = useState(null);
  const promptDialog = (opts) => new Promise(resolve => {
    onPromptFields?.(opts);
    setPromptState({ ...opts, resolve });
  });
  const requestOverrideReason = (label, opts) => requestOverride(promptDialog, audit, label, opts);
  return (
    <>
      <OutcomeModal
        cases={[CASE]} activeCaseId="c1" setShowOutcomeModal={() => {}}
        outcomeType="First written warning" setOutcomeType={() => {}}
        outcomeNotes="The allegation was substantiated." setOutcomeNotes={() => {}}
        recordCaseDecision={recordCaseDecision} showToast={() => {}}
        allegations={ALLEGATIONS} caseSignals={[]}
        requestOverrideReason={requestOverrideReason} createCaseTask={() => {}}
      />
      {promptState && (
        <PromptModal
          title={promptState.title} message={promptState.message} fields={promptState.fields}
          confirmLabel={promptState.confirmLabel} cancelLabel={promptState.cancelLabel}
          onConfirm={(values) => { promptState.resolve(values); setPromptState(null); }}
          onCancel={() => { promptState.resolve(null); setPromptState(null); }}
        />
      )}
    </>
  );
}

// The OutcomeModal re-renders behind the prompt once the interstitial closes, so
// both dialogs are in the DOM and both have a Cancel. Scope to the prompt.
const promptDialog = () => screen.getAllByRole('dialog')
  .find(d => d.getAttribute('aria-labelledby') === 'prompt-modal-title');

const REASON = 'UAT test case. Proceeding with the recorded outcome despite the identified quality checks to verify the decision workflow.';

async function openReasonPrompt(user) {
  // Warning duration is the modal's OWN state, not a prop, and issueOutcome
  // returns early without a valid one — so it has to be typed like a user does.
  await user.type(screen.getByLabelText('Warning duration'), '6');
  await user.click(screen.getByRole('button', { name: 'Record outcome' }));
  // the decision-quality interstitial
  await screen.findByRole('button', { name: 'Proceed anyway' });
}

describe('D4.3c — the entered override reason reaches the audit', () => {
  it('reproduces the production chain and persists the EXACT reason', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    const recordCaseDecision = vi.fn().mockResolvedValue({ result: 'ok', data: {} });
    render(<Harness audit={audit} recordCaseDecision={recordCaseDecision} />);

    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));

    // the reason prompt, from the real PromptModal
    const field = await screen.findByLabelText(/Reason/);
    await user.type(field, REASON);
    await user.click(screen.getByRole('button', { name: 'Proceed' }));

    await waitFor(() => expect(audit).toHaveBeenCalled());
    const [action, detail] = audit.mock.calls[0];
    expect(action).toBe('Issued outcome despite quality check gaps');
    // THE DEFECT: this used to end with "— no reason given".
    expect(detail).toContain(REASON);
    expect(detail).not.toContain('no reason given');
  });

  it('issues the outcome only after the override has been handled', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    const recordCaseDecision = vi.fn().mockResolvedValue({ result: 'ok', data: {} });
    render(<Harness audit={audit} recordCaseDecision={recordCaseDecision} />);

    await openReasonPrompt(user);
    expect(recordCaseDecision).not.toHaveBeenCalled();   // not before the override
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    expect(recordCaseDecision).not.toHaveBeenCalled();   // not while the prompt is open

    await user.type(await screen.findByLabelText(/Reason/), 'A real reason.');
    await user.click(screen.getByRole('button', { name: 'Proceed' }));
    await waitFor(() => expect(recordCaseDecision).toHaveBeenCalledTimes(1));
    // and the audit came first
    expect(audit).toHaveBeenCalled();
  });

  it('cancelling records no override and issues no outcome', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    const recordCaseDecision = vi.fn().mockResolvedValue({ result: 'ok', data: {} });
    render(<Harness audit={audit} recordCaseDecision={recordCaseDecision} />);

    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    await screen.findByLabelText(/Reason/);
    await user.click(within(promptDialog()).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument());
    expect(audit).not.toHaveBeenCalled();
    expect(recordCaseDecision).not.toHaveBeenCalled();
  });
});

describe('D4.3c — the reason is REQUIRED for a decision-quality override', () => {
  it('declares the field required, and not as optional', async () => {
    const user = userEvent.setup();
    const seen = [];
    render(<Harness audit={() => {}} recordCaseDecision={vi.fn()} onPromptFields={o => seen.push(o)} />);
    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    await screen.findByLabelText(/Reason/);
    const field = seen[0].fields.find(f => f.key === 'reason');
    expect(field.required).toBe(true);
    expect(field.label).not.toMatch(/optional/i);
  });

  it('cannot confirm with an empty reason', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    render(<Harness audit={audit} recordCaseDecision={vi.fn()} />);
    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    await screen.findByLabelText(/Reason/);
    expect(screen.getByRole('button', { name: 'Proceed' })).toBeDisabled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('cannot confirm with a whitespace-only reason', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    render(<Harness audit={audit} recordCaseDecision={vi.fn()} />);
    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    await user.type(await screen.findByLabelText(/Reason/), '    ');
    expect(screen.getByRole('button', { name: 'Proceed' })).toBeDisabled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('enables confirmation once a real reason is typed, and trims it', async () => {
    const user = userEvent.setup();
    const audit = vi.fn();
    render(<Harness audit={audit} recordCaseDecision={vi.fn().mockResolvedValue({ result: 'ok', data: {} })} />);
    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    await user.type(await screen.findByLabelText(/Reason/), '   Spaces around it.   ');
    const proceed = screen.getByRole('button', { name: 'Proceed' });
    expect(proceed).toBeEnabled();
    await user.click(proceed);
    await waitFor(() => expect(audit).toHaveBeenCalled());
    const detail = audit.mock.calls[0][1];
    expect(detail).toContain('Spaces around it.');
    expect(detail).not.toMatch(/—\s{2,}Spaces/);     // leading whitespace trimmed
    expect(detail).not.toMatch(/it\.\s+$/);          // trailing whitespace trimmed
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WHY THE PRODUCTION ROW SAID "no reason given" — the honest answer.
//
// The chain above is proven correct, so no code path discards a typed reason.
// These probe the realistic sequences that could leave the field EMPTY at the
// moment Proceed is clicked, which is what the audit row actually recorded.
// ─────────────────────────────────────────────────────────────────────────
describe('D4.3c — sequences that could leave the reason empty', () => {
  it('a second "Proceed anyway" click opens a second prompt and orphans the first', async () => {
    // Characterises the behaviour rather than asserting it is correct: two
    // clicks create two pending promises against one PromptModal. Documented so
    // the retest knows to click once.
    const user = userEvent.setup();
    const audit = vi.fn();
    const opened = [];
    render(<Harness audit={audit} recordCaseDecision={vi.fn().mockResolvedValue({ result: 'ok', data: {} })}
                    onPromptFields={o => opened.push(o)} />);
    await openReasonPrompt(user);
    const proceedAnyway = screen.getByRole('button', { name: 'Proceed anyway' });
    await user.click(proceedAnyway);
    await screen.findByLabelText(/Reason/);
    expect(opened.length).toBe(1);
    // the interstitial is gone after the first click, so a second is impossible
    expect(screen.queryByRole('button', { name: 'Proceed anyway' })).not.toBeInTheDocument();
  });

  it('typing then letting the parent re-render does NOT lose the text', async () => {
    // PromptModal holds its own state and is not re-keyed, so a parent re-render
    // cannot reset it. Rules out "the modal remounted" as the explanation.
    const user = userEvent.setup();
    const audit = vi.fn();
    render(<Harness audit={audit} recordCaseDecision={vi.fn().mockResolvedValue({ result: 'ok', data: {} })} />);
    await openReasonPrompt(user);
    await user.click(screen.getByRole('button', { name: 'Proceed anyway' }));
    const field = await screen.findByLabelText(/Reason/);
    await user.type(field, 'Half a reason');
    // force a parent re-render by touching an unrelated control behind the modal
    await user.keyboard('{Tab}');
    expect(field).toHaveValue('Half a reason');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D4.3c — SEMANTIC DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════
import { computeDecisionQualityGaps } from '../lib/decisionQuality.js';

const THIN_CASE = { id: 'c1', caseType: 'misconduct', evidence: [], meetings: [] };
const THIN_ALLEGATION = {
  id: 'a1', caseId: 'c1', title: 'Unauthorised absence', status: 'substantiated',
  decisionReasoning: '', employeeResponse: 'Explained the absence.',
};
// The real production signal shape, including the stable rule id.
const REASONING_GUARDRAIL = {
  id: 'sig_1', caseId: 'c1', type: 'process_risk', status: 'open',
  ruleId: 'decision_reasoning_missing',
  title: 'A finding was recorded with little or no reasoning',
};
const reasoningLines = gaps => gaps.filter(g => /reasoning/i.test(g));

describe('D4.3c — the same risk is not overridden twice', () => {
  it('the UAT scenario yields ONE reasoning warning, not two', () => {
    const gaps = computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [REASONING_GUARDRAIL]);
    expect(reasoningLines(gaps)).toHaveLength(1);
    expect(gaps).toContain('Finding recorded with little or no reasoning: "Unauthorised absence"');
    expect(gaps.some(g => g.startsWith('Unresolved procedural guardrail: "A finding was recorded'))).toBe(false);
  });

  it('does not mutate, resolve or hide the underlying guardrail record', () => {
    const signal = { ...REASONING_GUARDRAIL };
    const before = JSON.stringify(signal);
    computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [signal]);
    expect(JSON.stringify(signal)).toBe(before);
    expect(signal.status).toBe('open');          // never auto-resolved
  });

  it('independent warnings all survive', () => {
    const gaps = computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [REASONING_GUARDRAIL]);
    expect(gaps).toContain('No evidence linked to a decided allegation: "Unauthorised absence"');
    expect(gaps).toContain("No company policy has been identified as relevant to this case's decision.");
  });

  it('a DIFFERENT procedural guardrail is never suppressed', () => {
    const other = { id: 'sig_2', caseId: 'c1', type: 'process_risk', status: 'open',
                    ruleId: 'chair_independence',
                    title: 'Same person chaired the investigation and the disciplinary hearing' };
    const gaps = computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [REASONING_GUARDRAIL, other]);
    expect(reasoningLines(gaps)).toHaveLength(1);
    expect(gaps).toContain(`Unresolved procedural guardrail: "${other.title}"`);
  });

  it('dedupe is by IDENTITY, not wording — similar text with a different rule still shows', () => {
    // The anti-fuzzy guarantee. This title is deliberately near-identical to the
    // suppressed one; only the rule id differs, so it must survive.
    const lookalike = { id: 'sig_3', caseId: 'c1', type: 'process_risk', status: 'open',
                        ruleId: 'reasoning_ignores_employee_response',
                        title: 'A finding was recorded with reasoning that does not address the response' };
    const gaps = computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [REASONING_GUARDRAIL, lookalike]);
    expect(gaps).toContain(`Unresolved procedural guardrail: "${lookalike.title}"`);
  });

  it('a guardrail with NO rule id is never suppressed', () => {
    const unidentified = { id: 'sig_4', caseId: 'c1', type: 'process_risk', status: 'open',
                           ruleId: null, title: 'A finding was recorded with little or no reasoning' };
    const gaps = computeDecisionQualityGaps(THIN_CASE, [THIN_ALLEGATION], [unidentified]);
    expect(gaps).toContain(`Unresolved procedural guardrail: "${unidentified.title}"`);
  });

  it('detection is NOT weakened — the guardrail shows when the direct check did not fire', () => {
    // Adequate reasoning, so the direct check is silent. The guardrail (whatever
    // produced it) must still be surfaced rather than swallowed.
    const adequate = { ...THIN_ALLEGATION, decisionReasoning: 'A sufficiently long and considered explanation of the evidence.' };
    const gaps = computeDecisionQualityGaps(THIN_CASE, [adequate], [REASONING_GUARDRAIL]);
    expect(gaps).toContain(`Unresolved procedural guardrail: "${REASONING_GUARDRAIL.title}"`);
    expect(gaps.some(g => g.startsWith('Finding recorded with little or no reasoning'))).toBe(false);
  });

  it('the interstitial itself renders one reasoning warning for the UAT shape', async () => {
    const user = userEvent.setup();
    render(<Harness audit={vi.fn()} recordCaseDecision={vi.fn()} />);
    await openReasonPrompt(user);
    const dialog = screen.getByRole('dialog');
    const reasoningItems = within(dialog).queryAllByText(/little or no reasoning/i);
    expect(reasoningItems).toHaveLength(1);
  });
});

describe('D4.3c — other override flows are untouched', () => {
  it('an override without requireReason still offers an OPTIONAL reason and allows blank', async () => {
    // GuardrailsPanel and the investigation-submission check are unchanged.
    const seen = [];
    const auditFn = vi.fn();
    const promptDialogFn = async (opts) => { seen.push(opts); return { reason: '' }; };
    const ok = await requestOverride(promptDialogFn, auditFn, 'Some unresolved gap');
    expect(ok).toBe(true);
    const field = seen[0].fields.find(f => f.key === 'reason');
    expect(field.required).toBe(false);
    expect(field.label).toMatch(/optional/i);
    expect(auditFn).toHaveBeenCalledWith('Proceeded despite unresolved warning',
      'Some unresolved gap — no reason given', null);
  });

  it('a required override refuses to record anything if the reason is somehow blank', async () => {
    // Unreachable through the UI (Confirm is disabled), but it must fail closed
    // rather than write "no reason given" for a flow that requires one.
    const auditFn = vi.fn();
    const ok = await requestOverride(async () => ({ reason: '   ' }), auditFn, 'Gap', { requireReason: true });
    expect(ok).toBe(false);
    expect(auditFn).not.toHaveBeenCalled();
  });
});
