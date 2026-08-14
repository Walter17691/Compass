import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
