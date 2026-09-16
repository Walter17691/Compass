import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErReportScreen } from '../screens/ErReportScreen.jsx';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

// KpiCard renders {label, value, sub} as three sibling <div>s inside one
// <button>/<div> wrapper — the label text's own parent IS that wrapper, so
// its second child is the value. This doesn't depend on KpiCard's styling,
// just its documented {label, value, sub} shape.
const kpiWrapper = (label) => screen.getByText(label).parentElement;
const kpiValueText = (label) => kpiWrapper(label).children[1].textContent;

// Phase 6.5 hardening (closes Prompt 16 audit finding H2, HIGH) — the
// "Repeat cases" panel names individual employees by their own repeat-case
// history and links straight into their PersonView dossier, unlike every
// other panel on this screen (aggregate, non-identifying counts). Reports
// itself stays reachable by every role (InsightsScreen.jsx's own tab list
// only isHR-gates Manager Insights/Org Events/Risk Map/Improvement
// Initiatives), so this one panel needs its own internal gate.
const noop = () => {};
const baseProps = {
  cases: [
    { id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Grievance', dateReceived: '2026-01-01' },
    { id: 'c2', employeeName: 'Ada Lovelace', caseType: 'Misconduct', dateReceived: '2026-02-01' },
  ],
  getCaseStage: () => 'open',
  employeeRecords: [],
  setReportNarrative: noop,
  reportNarrative: '',
  setActiveCaseId: noop,
  setActiveCaseStage: noop,
  setScreen: noop,
  setActivePerson: noop,
  getNextStep: () => null,
  fmtDate: d => d,
  loadJsPDF: vi.fn(),
  caseThemes: [],
  organisationThemes: [],
};

// Insights Visual Upgrade, Phase 1 — dashboard fixture exercising the new
// CURRENT STATE vs PERIOD split (§10/§14 of the approved spec):
//   - c1: open, created 45 days ago — within the default 90d period, but
//     NOT within a 30d period. Drives the "New cases" period metric.
//   - c2: closed, created 200 days ago (outside every period), updated 5
//     days ago — the closed-in-period approximation (updatedAt) picks it
//     up regardless of the 90d/30d switch.
//   - c3, c4: open, created 200 days ago — old enough to fall in the
//     "90+ days" ageing bucket, and give the "open" stage 3 members (the
//     computeBreakdown sample floor is 3, so stage/type bars need >=3 to
//     actually render rather than being suppressed).
// Open cases (current-state) is always c1+c3+c4 = 3, regardless of the
// date range — that invariance is exactly what these tests check for.
const dashboardCases = [
  { id: 'c1', employeeName: 'Alice Adams', caseType: 'Grievance', dateReceived: daysAgo(45), createdAt: daysAgo(45) },
  { id: 'c2', employeeName: 'Bob Brown', caseType: 'Misconduct', dateReceived: daysAgo(200), createdAt: daysAgo(200), updatedAt: daysAgo(5) },
  { id: 'c3', employeeName: 'Carol Clark', caseType: 'Grievance', dateReceived: daysAgo(200), createdAt: daysAgo(200) },
  { id: 'c4', employeeName: 'Dave Davis', caseType: 'Grievance', dateReceived: daysAgo(200), createdAt: daysAgo(200) },
];
const stageById = { c1: 'open', c2: 'closed', c3: 'open', c4: 'open' };
const dashboardProps = {
  cases: dashboardCases,
  getCaseStage: (cs) => stageById[cs.id],
  employeeRecords: [
    { name: 'Alice Adams', location: 'London' },
    { name: 'Bob Brown', location: 'Manchester' },
    { name: 'Carol Clark', location: 'London' },
    { name: 'Dave Davis', location: 'Manchester' },
  ],
  dueSoon: [{ overdue: true, caseId: 'c3' }],
  setReportNarrative: noop,
  reportNarrative: '',
  setActiveCaseId: noop,
  setActiveCaseStage: noop,
  setScreen: noop,
  setActivePerson: noop,
  getNextStep: () => null,
  fmtDate: d => d,
  loadJsPDF: vi.fn(),
  caseThemes: [],
  organisationThemes: [],
  isHR: true,
};

describe('ErReportScreen — Insights Visual Upgrade Phase 1 dashboard', () => {
  it('computes Open cases and Overdue actions as current-state, unaffected by the (default 90-day) period', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(kpiValueText('Open cases')).toBe('3');
    expect(kpiValueText('Overdue actions')).toBe('1');
    expect(kpiWrapper('Open cases').textContent).toContain('Right now');
    expect(kpiWrapper('Overdue actions').textContent).toContain('Right now');
  });

  it('computes New cases and Closed cases as period metrics, scoped to the selected date range', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    // Default range is "Last 90 days" — c1 (created 45d ago) is in range.
    expect(kpiValueText('New cases')).toBe('1');
    expect(kpiValueText('Closed cases')).toBe('1');
    expect(kpiWrapper('New cases').textContent).toContain('Last 90d');
  });

  it('shows "Not enough closed cases" for Case duration when the closed sample is below the reliability floor', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(kpiWrapper('Case duration').textContent).toMatch(/Not enough closed cases/);
  });

  it('re-scopes New cases (but not Open cases or the "open" stage bar) when the date range narrows to 30 days', async () => {
    const user = userEvent.setup();
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(kpiValueText('New cases')).toBe('1');
    expect(screen.getByTitle('open: 3')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Date range'), '30d');

    // c1 was created 45 days ago — no longer "new" within a 30-day window.
    expect(kpiValueText('New cases')).toBe('0');
    // Current-state metrics must not move just because the period did.
    expect(kpiValueText('Open cases')).toBe('3');
    expect(screen.getByTitle('open: 3')).toBeInTheDocument();
  });

  it('filters by location, updating current-state Open cases immediately (no date dimension involved)', async () => {
    const user = userEvent.setup();
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(kpiValueText('Open cases')).toBe('3');

    await user.selectOptions(screen.getByLabelText('Location'), 'London');

    // Only Alice (c1) and Carol (c3) are in London; both open.
    expect(kpiValueText('Open cases')).toBe('2');
  });

  it('renders the case-ageing breakdown as current-state (open cases only), bucketed by days since creation', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    // c1 is 45 days old -> "31–60 days"; c3 and c4 are 200 days old -> "90+ days".
    expect(screen.getByTitle('31–60 days: 1')).toBeInTheDocument();
    expect(screen.getByTitle('90+ days: 2')).toBeInTheDocument();
  });

  it('labels current-state vs period sections explicitly, per the approved spec', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(screen.getByText('Trend — period')).toBeInTheDocument();
    expect(screen.getByText('Pipeline — current')).toBeInTheDocument();
    expect(screen.getByText('Operational health — current, open cases only')).toBeInTheDocument();
    expect(screen.getByText('Breakdown — period')).toBeInTheDocument();
  });

  it('clicking the Open cases KPI drills into Cases via onViewCases with the exact current open caseIds', async () => {
    const user = userEvent.setup();
    const onViewCases = vi.fn();
    render(<ErReportScreen {...dashboardProps} onViewCases={onViewCases} />);
    await user.click(kpiWrapper('Open cases'));
    expect(onViewCases).toHaveBeenCalledWith({ caseIds: ['c1', 'c3', 'c4'] });
  });

  it('clicking a populated ageing bucket drills into Cases with exactly that bucket\'s caseIds', async () => {
    const user = userEvent.setup();
    const onViewCases = vi.fn();
    render(<ErReportScreen {...dashboardProps} onViewCases={onViewCases} />);
    await user.click(screen.getByTitle('90+ days: 2'));
    expect(onViewCases).toHaveBeenCalledWith({ caseIds: ['c3', 'c4'] });
  });

  it('does not drill down when Case duration has no reliable value (button not rendered as clickable)', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    // KpiCard only renders a <button> when onClick is defined; with no
    // reliable duration, ErReportScreen passes onClick=undefined.
    expect(kpiWrapper('Case duration').tagName).toBe('DIV');
  });
});

// Insights Visual Upgrade, Phase 1 — Final Polish, Change 2. 25 open
// cases (> useLoadMore's page size of 20) so "Load more" has something
// real to page through once Active Cases is expanded.
const manyCases = Array.from({ length: 25 }, (_, i) => ({
  id: `m${i}`, employeeName: `Case Employee ${i}`, caseType: 'Grievance', dateReceived: daysAgo(i), createdAt: daysAgo(i),
}));
const manyCasesProps = { ...dashboardProps, cases: manyCases, getCaseStage: () => 'open', dueSoon: [] };

describe('ErReportScreen — Final Polish (KPI grid + Active Cases collapse)', () => {
  it('still renders exactly the 5 KPI cards, inside the responsive grid container', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    ['Open cases', 'New cases', 'Closed cases', 'Case duration', 'Overdue actions'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // The grid's column-count breakpoints live in a scoped <style> block
    // keyed off this class (inline `style` would always beat a media
    // query, so the responsive rule has to hang off a className instead).
    expect(kpiWrapper('Open cases').parentElement).toHaveClass('reports-kpi-grid');
  });

  it('collapses Active Cases by default, showing the count without the table', () => {
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);
    expect(screen.getByText('Active cases')).toBeInTheDocument();
    expect(screen.getByText('3 open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View active cases' })).toBeInTheDocument();
    expect(screen.queryByText('Employee')).not.toBeInTheDocument();
    expect(screen.queryByText('Job title')).not.toBeInTheDocument();
  });

  it('expands Active Cases to reveal the existing table, then collapses again', async () => {
    const user = userEvent.setup();
    render(<ErReportScreen {...dashboardProps} onViewCases={noop} />);

    await user.click(screen.getByRole('button', { name: 'View active cases' }));
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
    const hideBtn = screen.getByRole('button', { name: 'Hide' });
    expect(hideBtn).toHaveAttribute('aria-expanded', 'true');

    await user.click(hideBtn);
    expect(screen.queryByText('Employee')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View active cases' })).toBeInTheDocument();
  });

  it('preserves Load more pagination behaviour once Active Cases is expanded', async () => {
    const user = userEvent.setup();
    render(<ErReportScreen {...manyCasesProps} onViewCases={noop} />);

    await user.click(screen.getByRole('button', { name: 'View active cases' }));
    expect(screen.getByText('Load more (20 of 25)')).toBeInTheDocument();
    expect(screen.queryByText('Case Employee 24')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(screen.getByText('Case Employee 24')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('keeps Load more progress when Active Cases is hidden and re-expanded', async () => {
    const user = userEvent.setup();
    render(<ErReportScreen {...manyCasesProps} onViewCases={noop} />);

    await user.click(screen.getByRole('button', { name: 'View active cases' }));
    await user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(screen.getByText('Case Employee 24')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Case Employee 24')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View active cases' }));
    // useLoadMore's own state lives in ErReportScreen, outside the
    // collapsible branch — hiding the table must never reset it.
    expect(screen.getByText('Case Employee 24')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });
});

describe('ErReportScreen — Repeat cases panel gating (Prompt 16 audit, H2)', () => {
  it('shows the Repeat cases panel, naming the repeat employee, for HR', () => {
    render(<ErReportScreen {...baseProps} isHR={true} />);
    expect(screen.getByText('Repeat cases')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('hides the Repeat cases panel entirely for non-HR', () => {
    render(<ErReportScreen {...baseProps} isHR={false} />);
    expect(screen.queryByText('Repeat cases')).not.toBeInTheDocument();
    expect(screen.queryByText('2 cases')).not.toBeInTheDocument();
  });
});
