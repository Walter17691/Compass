import { describe, it, expect } from 'vitest';
import { isLetterApproved, createLetterApproval } from '../lib/letterApproval.js';

describe('isLetterApproved', () => {
  it('is false with no approval on record', () => {
    expect(isLetterApproved('Dear Jane...', null)).toBe(false);
  });

  it('is true when the approval snapshot matches the current letter text exactly', () => {
    const approval = createLetterApproval('Dear Jane...', { by: 'Sam HR' });
    expect(isLetterApproved('Dear Jane...', approval)).toBe(true);
  });

  it('is false once the letter is edited after approval — the approval does not carry over', () => {
    const approval = createLetterApproval('Dear Jane...', { by: 'Sam HR' });
    expect(isLetterApproved('Dear Jane, actually...', approval)).toBe(false);
  });

  it('is false once the letter is regenerated to different content after approval', () => {
    const approval = createLetterApproval('Draft A', { by: 'Sam HR' });
    expect(isLetterApproved('Draft B', approval)).toBe(false);
  });

  it('is false for empty letter text even with a stale approval record', () => {
    const approval = createLetterApproval('', { by: 'Sam HR' });
    expect(isLetterApproved('', approval)).toBe(false);
  });
});

describe('createLetterApproval', () => {
  it('records who approved, what type of letter, and a timestamp', () => {
    const approval = createLetterApproval('Dear Jane...', { by: 'Sam HR', type: 'outcome' });
    expect(approval.snapshot).toBe('Dear Jane...');
    expect(approval.by).toBe('Sam HR');
    expect(approval.type).toBe('outcome');
    expect(approval.at).toBeTruthy();
  });

  it('defaults the approver name when none is given', () => {
    const approval = createLetterApproval('Dear Jane...', {});
    expect(approval.by).toBe('HR Manager');
  });
});
