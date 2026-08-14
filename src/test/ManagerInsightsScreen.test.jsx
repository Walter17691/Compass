import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManagerInsightsScreen } from '../screens/ManagerInsightsScreen.jsx';

// Manager Enablement (Phase 4, MP20, §24) — HR-only, so reachable by the
// real E2E login (same discipline note as HrDelegatedWorkScreen.test.jsx):
// real rendering tests here alongside a full E2E flow, not in place of it.
const cases = [{ id: 'c1', employeeName: 'Sam Employee' }];
const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator', grantedAt: '2026-08-01T00:00:00Z' }];
const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-11T00:00:00Z' }];

describe('ManagerInsightsScreen', () => {
  it('shows an empty state when nothing has been delegated', () => {
    render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} />);
    expect(screen.getByText(/No investigations have been delegated yet/)).toBeInTheDocument();
  });

  it('shows the average completion time once at least one investigation has been submitted', () => {
    render(<ManagerInsightsScreen cases={cases} caseAccess={caseAccess} hrReviewRequests={hrReviewRequests} auditLog={[]} dueSoon={[]} />);
    expect(screen.getByText('10 days')).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 completed investigation/)).toBeInTheDocument();
  });

  it('shows "Not enough data" when a case is delegated but never submitted', () => {
    render(<ManagerInsightsScreen cases={cases} caseAccess={caseAccess} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} />);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });

  it('counts investigations returned for rework', () => {
    const returned = [{ id: 'r1', case_id: 'c1', step: 'inv_report', status: 'returned' }];
    render(<ManagerInsightsScreen cases={cases} caseAccess={caseAccess} hrReviewRequests={returned} auditLog={[]} dueSoon={[]} />);
    const tile = screen.getByText('Investigations returned for rework').closest('div');
    expect(tile.parentElement).toHaveTextContent('1');
  });

  it('counts overdue manager actions from dueSoon, scoped to delegated cases', () => {
    const dueSoon = [{ caseId: 'c1', overdue: true }];
    render(<ManagerInsightsScreen cases={cases} caseAccess={caseAccess} hrReviewRequests={[]} auditLog={[]} dueSoon={dueSoon} />);
    const tile = screen.getByText('Overdue manager actions').closest('div');
    expect(tile.parentElement).toHaveTextContent('1');
  });

  it('counts meeting quality gaps and process deviations from the audit log', () => {
    const auditLog = [
      { action: 'Ended meeting despite quality check gaps' },
      { action: 'Policy deviation recorded' },
      { action: 'Policy deviation recorded' },
    ];
    render(<ManagerInsightsScreen cases={cases} caseAccess={caseAccess} hrReviewRequests={[]} auditLog={auditLog} dueSoon={[]} />);
    expect(screen.getByText('Meeting quality gaps').closest('div').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Process deviations').closest('div').parentElement).toHaveTextContent('2');
  });

  // Manager Enablement (Phase 4, MP21, §25) — "Manager Capability Insight".
  describe('Manager Capability Insight', () => {
    const caseTasks = [{ id: 't1', caseId: 'c1', source: 'hr_guidance', name: 'Guidance from HR: Check the CCTV angle again.', createdAt: '2026-08-01T00:00:00Z' }];

    it('shows an empty state and a disabled button when there is no intervention history at all', () => {
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={[]} managerCapabilityInsights={[]} onGenerateManagerInsight={()=>{}} />);
      expect(screen.getByText(/Not enough recorded intervention history yet/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate insight' })).toBeDisabled();
    });

    it('enables the button once there is at least one recorded signal', () => {
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={caseTasks} managerCapabilityInsights={[]} onGenerateManagerInsight={()=>{}} />);
      expect(screen.getByRole('button', { name: 'Generate insight' })).not.toBeDisabled();
      expect(screen.getByText(/No insight generated yet/)).toBeInTheDocument();
    });

    it('clicking "Generate insight" calls onGenerateManagerInsight', async () => {
      const user = userEvent.setup();
      const onGenerateManagerInsight = vi.fn();
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={caseTasks} managerCapabilityInsights={[]} onGenerateManagerInsight={onGenerateManagerInsight} />);
      await user.click(screen.getByRole('button', { name: 'Generate insight' }));
      expect(onGenerateManagerInsight).toHaveBeenCalledTimes(1);
    });

    it('shows "Generating…" and disables the button while a generation is in flight', () => {
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={caseTasks} managerCapabilityInsights={[]} generatingManagerInsight onGenerateManagerInsight={()=>{}} />);
      expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    });

    it('renders a generated insight — categories and the suggested response', () => {
      const insights = [{
        id: 'i1', created_at: '2026-08-14T10:00:00Z', sample_size: 5,
        categories: [{ label: 'Insufficient follow-up questioning', description: 'Several notes ask investigators to go back and probe further.', frequency: 'Seen in 3 of 5 notes' }],
        suggested_response: 'Consider a short refresher on probing-question technique.',
      }];
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={caseTasks} managerCapabilityInsights={insights} onGenerateManagerInsight={()=>{}} />);
      expect(screen.getByText('Insufficient follow-up questioning')).toBeInTheDocument();
      expect(screen.getByText('Several notes ask investigators to go back and probe further.')).toBeInTheDocument();
      expect(screen.getByText('Seen in 3 of 5 notes')).toBeInTheDocument();
      expect(screen.getByText(/Consider a short refresher on probing-question technique/)).toBeInTheDocument();
      expect(screen.getByText(/based on 5 recorded interventions/)).toBeInTheDocument();
    });

    it('does not render the generate button when no handler is given', () => {
      render(<ManagerInsightsScreen cases={[]} caseAccess={[]} hrReviewRequests={[]} auditLog={[]} dueSoon={[]} caseTasks={caseTasks} managerCapabilityInsights={[]} />);
      expect(screen.queryByRole('button', { name: /Generate insight/ })).not.toBeInTheDocument();
    });
  });
});
