import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HrReviewGatePanel } from '../components/HrReviewGatePanel.jsx';

// Manager Enablement (Phase 4, MP11, §17) — HR Review Gate. Real
// rendering/interaction (same tool as every other panel/modal test in
// this suite) — this is reachable by the real HR E2E login too, but
// getting there needs a full investigation-submission flow (a real AI
// call) first, so the panel's own action-set/history logic is proven
// directly here instead.
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const noop = () => {};

describe('HrReviewGatePanel', () => {
  it('renders nothing when there is no investigation submission on this case', () => {
    const { container } = render(<HrReviewGatePanel cs={cs} hrReviewRequests={[]} resolveInvestigationReview={noop} isHR={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('ignores review requests for a different step (e.g. an outcome approval), only showing inv_report ones', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'dismissal', status: 'pending' }];
    const { container } = render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a pending submission with all six review actions for HR', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'pending', requested_by_name: 'Alex Manager', requested_at: '2026-08-14T10:00:00Z' }];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={true} />);
    expect(screen.getByText('Submitted by Alex Manager')).toBeInTheDocument();
    expect(screen.getByText('Awaiting HR review')).toBeInTheDocument();
    ['Approve', 'Return for further investigation', 'Request clarification', 'Take over case', 'Close', 'Progress to next stage'].forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('does not show review actions to a non-HR viewer', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('clicking an action calls resolveInvestigationReview with the request, case and action ids, plus any comment', async () => {
    const user = userEvent.setup();
    const resolveInvestigationReview = vi.fn();
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={resolveInvestigationReview} isHR={true} />);

    await user.type(screen.getByPlaceholderText('Comments (optional)'), 'Needs more on the CCTV angle');
    await user.click(screen.getByRole('button', { name: 'Return for further investigation' }));

    expect(resolveInvestigationReview).toHaveBeenCalledWith('r1', 'c1', 'returned', 'Needs more on the CCTV angle');
  });

  it('shows resolved requests without review actions, and shows the reviewer and their comment', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'returned', reviewed_by_name: 'Jamie HR', comments: 'Please interview the second witness', requested_at: '2026-08-14T10:00:00Z' }];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={true} />);
    expect(screen.getByText('Returned for further investigation')).toBeInTheDocument();
    expect(screen.getByText('By Jamie HR: Please interview the second witness')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('lists multiple submissions newest first, e.g. after a return and resubmission', () => {
    const hrReviewRequests = [
      { id: 'r1', case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-10T10:00:00Z' },
      { id: 'r2', case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-14T10:00:00Z' },
    ];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={true} />);
    const statuses = screen.getAllByText(/Awaiting HR review|Returned for further investigation/);
    expect(statuses[0]).toHaveTextContent('Awaiting HR review');
    expect(statuses[1]).toHaveTextContent('Returned for further investigation');
  });

  // Phase 6.5 hardening (Batch 13) — the review comments field relied on
  // placeholder text alone, with no other accessible name.
  it('labels the review comments field for a pending request', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-14T10:00:00Z' }];
    render(<HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={noop} isHR={true} />);
    expect(screen.getByLabelText('Review comments')).toBeInTheDocument();
  });
});
