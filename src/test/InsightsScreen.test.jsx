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
  // Insights Visual Upgrade, Phase 1 — Reports is now first/default,
  // replacing Organisational Intelligence (previously default, now
  // second). See the Insights Product & UX Review's primary finding.
  it('defaults to the Reports tab', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    expect(screen.getByText('Understand case activity, outcomes and emerging trends.')).toBeInTheDocument();
  });

  it('renders Reports as the first tab button, before every other section', () => {
    render(<InsightsScreen isHR={true} {...requiredProps}/>);
    const buttons = screen.getAllByRole('button').filter(b =>
      ['Reports', 'Organisational Intelligence', 'Trends & Themes', 'Early Signals', 'Manager Insights', 'Organisational Events', 'Risk Map', 'Improvement Initiatives'].includes(b.textContent)
    );
    expect(buttons[0]).toHaveTextContent('Reports');
  });

  it('lists Reports as the first option in the mobile section selector', () => {
    render(<InsightsScreen isHR={true} isMobile={true} {...requiredProps}/>);
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select.querySelectorAll('option')[0]).toHaveTextContent('Reports');
  });

  it('still defaults to Reports for a non-HR user (Reports has never been HR-gated)', () => {
    render(<InsightsScreen isHR={false} {...requiredProps}/>);
    expect(screen.getByText('Understand case activity, outcomes and emerging trends.')).toBeInTheDocument();
  });

  // Existing deep links must keep working after the reorder — a caller
  // targeting any section by id (e.g. from an "Emerging patterns"
  // drill-down elsewhere in the app) should land on that exact section,
  // never silently fall back to the new default.
  it.each(['overview', 'trends', 'early-signals', 'manager', 'org-events', 'risk-map', 'improvement-initiatives'])(
    'still honours an existing deep link to "%s" after the Reports reorder',
    (sectionId) => {
      render(<InsightsScreen isHR={true} {...requiredProps} deepLink={{ initialSection: sectionId }}/>);
      expect(screen.queryByText('Understand case activity, outcomes and emerging trends.')).not.toBeInTheDocument();
    }
  );

  it('a deep link to "reports" still opens Reports explicitly', () => {
    render(<InsightsScreen isHR={true} {...requiredProps} deepLink={{ initialSection: 'reports' }}/>);
    expect(screen.getByText('Understand case activity, outcomes and emerging trends.')).toBeInTheDocument();
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
    expect(screen.getByText('Understand case activity, outcomes and emerging trends.')).toBeInTheDocument();
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
    expect(screen.getByText('Understand case activity, outcomes and emerging trends.')).toBeInTheDocument();
  });
});
