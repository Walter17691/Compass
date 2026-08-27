import { describe, it, expect, vi } from 'vitest';
import { requestOverride, requestPolicyDeviation, requestManualSignatureConfirmation } from '../lib/humanOverride';

describe('requestOverride', () => {
  it('returns false and never calls audit when the prompt is cancelled', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    const result = await requestOverride(promptDialogFn, auditFn, 'Some unresolved gap');
    expect(result).toBe(false);
    expect(auditFn).not.toHaveBeenCalled();
  });

  // Phase 6.5 hardening (closes independent audit finding 5.6) — was
  // "proceeds without an audit entry when the reason is left blank",
  // asserting the exact bug: the fastest, most common path through the
  // dialog (confirm with no reason typed) left no trace at all that an
  // override happened, indistinguishable from the gate never firing.
  it('proceeds and still records an audit entry when the reason is left blank', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ reason: '' });
    const auditFn = vi.fn();
    const result = await requestOverride(promptDialogFn, auditFn, 'Some unresolved gap');
    expect(result).toBe(true);
    expect(auditFn).toHaveBeenCalledWith(
      'Proceeded despite unresolved warning',
      'Some unresolved gap — no reason given',
      null
    );
  });

  it('proceeds and records the reason when one is given', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ reason: '  Employee requested to proceed today  ' });
    const auditFn = vi.fn();
    const result = await requestOverride(promptDialogFn, auditFn, 'Allegation not discussed', { caseId: 'case-1' });
    expect(result).toBe(true);
    expect(auditFn).toHaveBeenCalledWith(
      'Proceeded despite unresolved warning',
      'Allegation not discussed — Employee requested to proceed today',
      'case-1'
    );
  });

  it('supports a custom action label for the audit entry', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ reason: 'Deadline was extended verbally' });
    const auditFn = vi.fn();
    await requestOverride(promptDialogFn, auditFn, '5 working days notice', { caseId: 'case-2', actionLabel: 'Departed from policy' });
    expect(auditFn).toHaveBeenCalledWith('Departed from policy', '5 working days notice — Deadline was extended verbally', 'case-2');
  });

  it('passes the label and an optional-reason field through to the prompt dialog', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    await requestOverride(promptDialogFn, auditFn, 'Essential question not yet asked');
    expect(promptDialogFn).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Essential question not yet asked'),
      fields: [expect.objectContaining({ key: 'reason' })],
    }));
    // Never a required field — leaving it blank must still be a valid submission.
    expect(promptDialogFn.mock.calls[0][0].fields[0].required).toBeFalsy();
  });
});

describe('requestPolicyDeviation', () => {
  const clause = { policyName: 'Disciplinary Policy', clauseHeading: 'Notice of hearing', clauseText: "Employees should normally receive at least 48 hours' notice." };

  it('returns false and never calls audit when the prompt is cancelled', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    const result = await requestPolicyDeviation(promptDialogFn, auditFn, clause);
    expect(result).toBe(false);
    expect(auditFn).not.toHaveBeenCalled();
  });

  it('records a stable, templated audit entry under a fixed action label', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ actual: "Hearing held with 24 hours' notice", reason: 'Employee asked to bring it forward' });
    const auditFn = vi.fn();
    const result = await requestPolicyDeviation(promptDialogFn, auditFn, { ...clause, caseId: 'case-1' });
    expect(result).toBe(true);
    expect(auditFn).toHaveBeenCalledWith(
      'Policy deviation recorded',
      `Policy expectation: "Employees should normally receive at least 48 hours' notice." — Actual: Hearing held with 24 hours' notice — Reason: Employee asked to bring it forward`,
      'case-1'
    );
  });

  it('omits the reason clause from the detail when no reason is given', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ actual: "Hearing held with 24 hours' notice", reason: '' });
    const auditFn = vi.fn();
    await requestPolicyDeviation(promptDialogFn, auditFn, clause);
    expect(auditFn).toHaveBeenCalledWith(
      'Policy deviation recorded',
      `Policy expectation: "Employees should normally receive at least 48 hours' notice." — Actual: Hearing held with 24 hours' notice`,
      null
    );
  });

  it('marks the "actual" field required — there is a real departure to describe', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    await requestPolicyDeviation(promptDialogFn, auditFn, clause);
    const actualField = promptDialogFn.mock.calls[0][0].fields.find(f => f.key === 'actual');
    expect(actualField.required).toBe(true);
  });

  it('includes the policy name and clause heading in the prompt message', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    await requestPolicyDeviation(promptDialogFn, auditFn, clause);
    expect(promptDialogFn.mock.calls[0][0].message).toContain('Disciplinary Policy');
    expect(promptDialogFn.mock.calls[0][0].message).toContain('Notice of hearing');
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H9, HIGH) — "Mark
// signed" used to set signStatus:"signed" from one unconfirmed click,
// with no attestation of how a genuine signature was actually obtained.
describe('requestManualSignatureConfirmation', () => {
  it('returns false and never calls audit when the prompt is cancelled', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    const result = await requestManualSignatureConfirmation(promptDialogFn, auditFn, { itemLabel: 'Investigation record — 12 Mar 2026' });
    expect(result).toBe(false);
    expect(auditFn).not.toHaveBeenCalled();
  });

  it('records a stable, templated audit entry with the given detail', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ detail: 'Signed paper copy handed to HR on 12 March 2026' });
    const auditFn = vi.fn();
    const result = await requestManualSignatureConfirmation(promptDialogFn, auditFn, { itemLabel: 'Investigation record — 12 Mar 2026', caseId: 'case-1' });
    expect(result).toBe(true);
    expect(auditFn).toHaveBeenCalledWith(
      'Marked signed outside Compass',
      'Investigation record — 12 Mar 2026 — Signed paper copy handed to HR on 12 March 2026',
      'case-1'
    );
  });

  it('marks the "detail" field required — an unexplained signature assertion is exactly the gap being closed', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    await requestManualSignatureConfirmation(promptDialogFn, auditFn, { itemLabel: 'Witness statement — statement.pdf' });
    const detailField = promptDialogFn.mock.calls[0][0].fields.find(f => f.key === 'detail');
    expect(detailField.required).toBe(true);
  });

  it('includes the item being marked signed in the prompt message', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    await requestManualSignatureConfirmation(promptDialogFn, auditFn, { itemLabel: 'Witness statement — statement.pdf' });
    expect(promptDialogFn.mock.calls[0][0].message).toContain('Witness statement — statement.pdf');
  });
});
