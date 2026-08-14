import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskHrPanel } from '../components/AskHrPanel.jsx';

// Manager Enablement (Phase 4, MP12, §13) — the receiving side of
// "Escalate to HR". Generic filter (excludes approval-gated outcome
// actions and inv_report investigation submissions, which have their
// own dedicated panels) rather than hardcoding "escalation" specifically
// — this is what makes ReviewScreen's own pre-existing step:"record"
// requests visible for the first time too, as a side effect of building
// this generically instead of narrowly.
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const noop = () => {};

describe('AskHrPanel', () => {
  it('renders nothing when there are no generic review requests on this case', () => {
    const { container } = render(<AskHrPanel cs={cs} hrReviewRequests={[]} respondToReview={noop} isHR={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('ignores an approval-gated outcome request and an inv_report submission — only generic steps show here', () => {
    const hrReviewRequests = [
      { id: 'r1', case_id: 'c1', step: 'dismissal', status: 'pending' },
      { id: 'r2', case_id: 'c1', step: 'inv_report', status: 'pending' },
    ];
    const { container } = render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={noop} isHR={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a pending escalation with its auto-attached context and a resolve action for HR', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'escalation', status: 'pending', requested_by_name: 'Alex Manager', record_snapshot: 'Case: Sam Employee\nStage: Investigation', requested_at: '2026-08-14T10:00:00Z' }];
    render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={noop} isHR={true} />);
    expect(screen.getByText('Alex Manager asked for help')).toBeInTheDocument();
    expect(screen.getByText('Awaiting HR response')).toBeInTheDocument();
    expect(screen.getByText(/Stage: Investigation/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeInTheDocument();
  });

  it('also shows a pre-existing step:"record" request, which previously had no visible surface at all', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'record', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={noop} isHR={true} />);
    expect(screen.getByText('HR review requested')).toBeInTheDocument();
  });

  it('does not show the resolve action to a non-HR viewer', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'escalation', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={noop} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument();
  });

  it('clicking "Mark resolved" calls respondToReview with the request id and a resolved status', async () => {
    const user = userEvent.setup();
    const respondToReview = vi.fn();
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'escalation', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={respondToReview} isHR={true} />);
    await user.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(respondToReview).toHaveBeenCalledWith('r1', 'resolved');
  });

  it('shows a resolved request without an action, and names the reviewer', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'escalation', status: 'resolved', reviewed_by_name: 'Jamie HR', requested_at: '2026-08-14T10:00:00Z' }];
    render(<AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={noop} isHR={true} />);
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('By Jamie HR')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument();
  });
});
