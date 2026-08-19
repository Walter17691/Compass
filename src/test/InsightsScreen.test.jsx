import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The default "Organisational Intelligence" tab (OP3) fetches via
// supabase.rpc — mocked here the same way
// OrganisationalIntelligenceOverview.test.jsx mocks it, so this file
// stays focused on tab navigation/gating, not the dashboard's own data.
vi.mock('../supabase', () => ({ supabase: { rpc: () => new Promise(() => {}) } }));
const { InsightsScreen } = await import('../screens/InsightsScreen.jsx');

// Organisational ER Intelligence (Phase 6, OP1) — the new Insights home.
// getCaseStage/getNextStep/fmtDate are the same minimal stand-ins
// ErReportScreen's/ManagerInsightsScreen's own tests already use.
const getCaseStage = () => "open";
const requiredProps = {
  cases: [], caseAccess: [], hrReviewRequests: [], auditLog: [], dueSoon: [], caseTasks: [],
  employeeRecords: [], setReportNarrative: () => {}, reportNarrative: "",
  setActiveCaseId: () => {}, setActiveCaseStage: () => {}, setScreen: () => {},
  setActivePerson: () => {}, getCaseStage, getNextStep: () => null, fmtDate: d => d,
  loadJsPDF: () => {},
};

describe('InsightsScreen', () => {
  it('defaults to the Organisational Intelligence tab', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    expect(screen.getByText(/Loading organisational statistics/)).toBeInTheDocument();
  });

  it('shows Manager Insights, Risk Map, and Improvement Initiatives tabs only for HR', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    expect(screen.getByRole('button', { name: 'Manager Insights' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Risk Map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Improvement Initiatives' })).toBeInTheDocument();
  });

  it('hides Manager Insights, Risk Map, and Improvement Initiatives tabs for non-HR, but keeps Reports', () => {
    render(<InsightsScreen isHR={false} {...requiredProps}/>);
    expect(screen.queryByRole('button', { name: 'Manager Insights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Risk Map' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Improvement Initiatives' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
  });

  it('switches to the Manager Insights tab and renders the real ManagerInsightsScreen content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    await user.click(screen.getByRole('button', { name: 'Manager Insights' }));
    expect(screen.getByText(/No investigations have been delegated yet/)).toBeInTheDocument();
  });

  it('switches to the Reports tab and renders the real ErReportScreen content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    await user.click(screen.getByRole('button', { name: 'Reports' }));
    expect(screen.getByText('HR Reports')).toBeInTheDocument();
  });
});
