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
//
// Phase 6.5 hardening (Batch 10b, task #205) — InsightsScreen's 41 flat
// props are now 7 grouped objects (isHR stays flat). This fixture is
// deliberately partial — every group defaults to {} in the component
// itself, so a test only needs to supply what it actually exercises.
const getCaseStage = () => "open";
const caseData = {
  cases: [], caseAccess: [], hrReviewRequests: [], auditLog: [], dueSoon: [], caseTasks: [],
  employeeRecords: [],
};
const reporting = {
  setReportNarrative: () => {}, reportNarrative: "",
  getCaseStage, getNextStep: () => null, fmtDate: d => d, loadJsPDF: () => {},
};
const nav = {
  setActiveCaseId: () => {}, setActiveCaseStage: () => {}, setScreen: () => {},
  setActivePerson: () => {},
};
const requiredProps = { caseData, reporting, nav };

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

  it('shows the Early Signals tab for both HR and non-HR', () => {
    render(<InsightsScreen isHR={false} {...requiredProps}/>);
    expect(screen.getByRole('button', { name: 'Early Signals' })).toBeInTheDocument();
  });

  it('switches to the Early Signals tab and renders the real EarlySignalsPanel content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    await user.click(screen.getByRole('button', { name: 'Early Signals' }));
    expect(screen.getByText(/Loading early signals/)).toBeInTheDocument();
  });

  it('shows the Organisational Events tab only for HR', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    expect(screen.getByRole('button', { name: 'Organisational Events' })).toBeInTheDocument();
  });

  it('hides the Organisational Events tab for non-HR', () => {
    render(<InsightsScreen isHR={false} {...requiredProps}/>);
    expect(screen.queryByRole('button', { name: 'Organisational Events' })).not.toBeInTheDocument();
  });

  it('switches to the Organisational Events tab and renders the real OrgEventsPanel content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps} orgIntel={{ orgEvents: [] }}/>);
    await user.click(screen.getByRole('button', { name: 'Organisational Events' }));
    expect(screen.getByText('No organisational events logged yet.')).toBeInTheDocument();
  });

  it('switches to the Risk Map tab and renders the real RiskMapPanel content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    await user.click(screen.getByRole('button', { name: 'Risk Map' }));
    expect(screen.getByText(/Loading risk map/)).toBeInTheDocument();
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17) — createCaseTask
  // is a new optional prop threaded down into TrendsPanel/
  // EarlySignalsPanel/RiskMapPanel (each covered directly in their own
  // test files); this just confirms accepting and passing it through
  // doesn't break InsightsScreen itself.
  it('accepts a createCaseTask prop without breaking the Trends & Themes tab', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps} orgIntelActions={{ createCaseTask: vi.fn() }}/>);
    await user.click(screen.getByRole('button', { name: 'Trends & Themes' }));
    expect(screen.getByText(/Loading trends/)).toBeInTheDocument();
  });

  // Organisational ER Intelligence (Phase 6, OP22, §18)
  it('switches to the Improvement Initiatives tab and renders the real panel content', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} {...requiredProps} orgIntel={{ improvementInitiatives: [] }}/>);
    await user.click(screen.getByRole('button', { name: 'Improvement Initiatives' }));
    expect(screen.getByText('No improvement initiatives yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New initiative' })).toBeInTheDocument();
  });

  // Insights Phase 2 (Overview Intelligence) — closes the audit finding
  // that this screen hardcoded isMobile={false} on its own SettingsNav
  // tab rail, so the compact <select> mode SettingsNav already supports
  // (and Settings itself already uses) never activated here even on a
  // narrow viewport. isMobile is now a real, App-level prop, same as
  // SettingsScreen already receives.
  it('defaults to the desktop sidebar nav (buttons, not a <select>) when isMobile is omitted', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    expect(screen.getByRole('button', { name: 'Trends & Themes' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Settings section' })).not.toBeInTheDocument();
  });

  it('switches to the compact <select> nav when isMobile is true, and tab switching still works', async () => {
    const user = userEvent.setup();
    render(<InsightsScreen isHR={true} isMobile={true} {...requiredProps}/>);
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trends & Themes' })).not.toBeInTheDocument();
    await user.selectOptions(select, 'Reports');
    expect(screen.getByText('HR Reports')).toBeInTheDocument();
  });
});
