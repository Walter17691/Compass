import { describe, it, expect, vi } from 'vitest';
import { requestOverride } from '../lib/humanOverride';

describe('requestOverride', () => {
  it('returns false and never calls audit when the prompt is cancelled', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue(null);
    const auditFn = vi.fn();
    const result = await requestOverride(promptDialogFn, auditFn, 'Some unresolved gap');
    expect(result).toBe(false);
    expect(auditFn).not.toHaveBeenCalled();
  });

  it('proceeds without an audit entry when the reason is left blank', async () => {
    const promptDialogFn = vi.fn().mockResolvedValue({ reason: '' });
    const auditFn = vi.fn();
    const result = await requestOverride(promptDialogFn, auditFn, 'Some unresolved gap');
    expect(result).toBe(true);
    expect(auditFn).not.toHaveBeenCalled();
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
