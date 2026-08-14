import { describe, it, expect } from 'vitest';
import { requiresApproval, approvalActionLabel, approvalStatusLabel, approvalActionForOutcome, APPROVAL_ACTIONS, INVESTIGATION_REVIEW_STATUSES, investigationReviewStatusLabel } from '../lib/approvals';

describe('requiresApproval', () => {
  it('returns true for each of the spec\'s five approval-gated actions', () => {
    ['suspension', 'final_written_warning', 'dismissal', 'settlement', 'redundancy_outcome'].forEach(id => {
      expect(requiresApproval(id)).toBe(true);
    });
  });

  it('returns false for an action not on the list', () => {
    expect(requiresApproval('first_written_warning')).toBe(false);
    expect(requiresApproval('record')).toBe(false);
  });
});

describe('approvalActionLabel', () => {
  it('returns the human label for a known action', () => {
    expect(approvalActionLabel('final_written_warning')).toBe('Final written warning');
    expect(approvalActionLabel('redundancy_outcome')).toBe('Redundancy selection outcome');
  });

  it('falls back to the raw id for an unrecognised action', () => {
    expect(approvalActionLabel('made_up_action')).toBe('made_up_action');
  });
});

describe('approvalStatusLabel', () => {
  it('maps this app\'s existing hr_review_requests status vocabulary onto the spec\'s own wording', () => {
    expect(approvalStatusLabel('pending')).toBe('Awaiting approval');
    expect(approvalStatusLabel('approved')).toBe('Approved');
    expect(approvalStatusLabel('rejected')).toBe('Rejected / returned');
  });

  it('falls back to "Decision prepared" for a request with no status yet', () => {
    expect(approvalStatusLabel(undefined)).toBe('Decision prepared');
    expect(approvalStatusLabel(null)).toBe('Decision prepared');
  });
});

describe('approvalActionForOutcome', () => {
  it('maps OutcomeModal\'s dismissal outcome options onto the dismissal approval action', () => {
    expect(approvalActionForOutcome('Dismissal with notice')).toBe('dismissal');
    expect(approvalActionForOutcome('Summary dismissal (gross misconduct)')).toBe('dismissal');
  });

  it('maps the final written warning outcome onto its own approval action', () => {
    expect(approvalActionForOutcome('Final written warning')).toBe('final_written_warning');
  });

  it('returns null for outcomes that do not require approval', () => {
    expect(approvalActionForOutcome('No further action')).toBeNull();
    expect(approvalActionForOutcome('First written warning')).toBeNull();
    expect(approvalActionForOutcome('Demotion')).toBeNull();
  });
});

describe('APPROVAL_ACTIONS', () => {
  it('has exactly the spec\'s five listed actions, in order', () => {
    expect(APPROVAL_ACTIONS.map(a => a.id)).toEqual([
      'suspension', 'final_written_warning', 'dismissal', 'settlement', 'redundancy_outcome',
    ]);
  });
});

// Manager Enablement (Phase 4, MP11, §17) — the HR Review Gate's own,
// separate status vocabulary for investigation submissions.
describe('INVESTIGATION_REVIEW_STATUSES / investigationReviewStatusLabel', () => {
  it('has exactly the plan\'s six listed actions, in order', () => {
    expect(INVESTIGATION_REVIEW_STATUSES.map(s => s.id)).toEqual([
      'approved', 'returned', 'clarification_requested', 'taken_over', 'closed', 'progressed',
    ]);
  });

  it('maps each status id onto its own display label', () => {
    expect(investigationReviewStatusLabel('approved')).toBe('Approved');
    expect(investigationReviewStatusLabel('returned')).toBe('Returned for further investigation');
    expect(investigationReviewStatusLabel('clarification_requested')).toBe('Clarification requested');
    expect(investigationReviewStatusLabel('taken_over')).toBe('Taken over by HR');
    expect(investigationReviewStatusLabel('closed')).toBe('Closed');
    expect(investigationReviewStatusLabel('progressed')).toBe('Progressed to next stage');
  });

  it('falls back to "Awaiting HR review" for pending or unrecognised statuses', () => {
    expect(investigationReviewStatusLabel('pending')).toBe('Awaiting HR review');
    expect(investigationReviewStatusLabel(undefined)).toBe('Awaiting HR review');
  });
});
