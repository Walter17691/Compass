import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { OrganisationalIntelligenceOverview } = await import('../components/OrganisationalIntelligenceOverview.jsx');

const baseOverview = {
  period_days: 19, total_cases: 10, open_cases: 4, opened_in_period: 2, closed_in_period: 1,
  cases_by_type: { misconduct: 6, grievance: 4 },
  cases_by_stage: {}, cases_by_outcome: { 'No further action': 3 },
  cases_by_manager: { 'Jo Smith': 5, 'Not specified': 5 },
  cases_by_location: { 'Not specified': 10 },
  cases_by_department: { 'Not specified': 10 },
  avg_case_duration_days: 12.5, closed_cases_with_duration: 4,
};

// Organisational ER Intelligence (Phase 6, OP3, §1) — supabase.rpc is
// mocked rather than hit for real (unlike the E2E spec, which proves the
// real RPC end-to-end against the live Supabase project); this proves
// the component's own rendering/loading/caveat logic.
describe('OrganisationalIntelligenceOverview', () => {
  it('shows a loading state, then the fetched stats', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    expect(screen.getByText(/Loading organisational statistics/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Open cases').parentElement).toHaveTextContent('4'));
    expect(rpcMock).toHaveBeenCalledWith('org_insights_overview', { p_org_id: 'org1', p_period_days: expect.any(Number) });
  });

  // Phase 6.5, Batch 5 — a per-manager case-count bar chart is exactly
  // the "score or rank an individual manager" pattern this phase's own
  // cross-cutting constraint prohibits (managerInsights.js and
  // riskMap.js are both deliberately built to avoid it too). The RPC
  // still returns cases_by_manager (baseOverview above includes it,
  // matching the real shape); this proves the component never renders
  // it, even though the data is present.
  // Phase 7.5B (P0 polish, item 5) — this placeholder was stale, not
  // genuinely unfinished: AppealIntelligencePanel (rendered further down
  // this same screen) already computes and shows a real Appeal rate
  // StatBox. Confirms the "Coming... later in this phase" text is gone
  // and doesn't silently reappear.
  it('does not show the stale "Coming with Appeal Intelligence" placeholder', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Open cases').parentElement).toHaveTextContent('4'));
    expect(screen.queryByText(/Coming with Appeal Intelligence/)).not.toBeInTheDocument();
  });

  it('never renders a per-manager breakdown, even though the RPC returns cases_by_manager', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Open cases').parentElement).toHaveTextContent('4'));
    expect(screen.queryByText('Cases by manager')).not.toBeInTheDocument();
    expect(screen.queryByText('Jo Smith')).not.toBeInTheDocument();
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Couldn't load organisational statistics/)).toBeInTheDocument());
  });

  it('shows a data-quality caveat instead of a number when too few closed cases have a measurable duration', async () => {
    rpcMock.mockResolvedValue({ data: { ...baseOverview, closed_cases_with_duration: 1 }, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Only 1 closed cases with measurable duration available/)).toBeInTheDocument());
  });

  it('counts overdue cases by unique case id, not by deadline item', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const dueSoon = [
      { caseId: 'c1', overdue: true }, { caseId: 'c1', overdue: true }, { caseId: 'c2', overdue: true }, { caseId: 'c3', overdue: false },
    ];
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Overdue/)).toBeInTheDocument());
    const tile = screen.getByText(/Overdue/).parentElement;
    expect(tile).toHaveTextContent('2');
  });

  it('counts cases returned for further investigation from hrReviewRequests', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const hrReviewRequests = [
      { step: 'inv_report', status: 'returned' }, { step: 'inv_report', status: 'returned' }, { step: 'inv_report', status: 'approved' }, { step: 'outcome', status: 'returned' },
    ];
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={hrReviewRequests} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Returned for further investigation')).toBeInTheDocument());
    const tile = screen.getByText('Returned for further investigation').parentElement;
    expect(tile).toHaveTextContent('2');
  });

  it('shows the informal/formal resolution split from real case meetings', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const cases = [
      { meetings: [{ type: 'Informal / 1-1' }] },
      { meetings: [{ type: 'Investigation' }] },
    ];
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Informal \/ formal/)).toBeInTheDocument());
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  // Phase 6.5, Batch 5 — "Repeat case themes" now renders HR-curated
  // case_themes tags (themeFrequency), not raw extracted case text.
  // Phase 6.5 hardening (product-principles review) — themeFrequency's
  // own default floor was raised from 2 to 3 to match the MIN_SAMPLE_SIZE
  // used consistently elsewhere in this phase.
  it('shows recurring themes tagged across 3+ cases, by name', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }, { caseId: 'c3', themeId: 't1' }];
    const organisationThemes = [{ id: 't1', name: 'Rota changes', active: true }];
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]} caseThemes={caseThemes} organisationThemes={organisationThemes}/>);
    await waitFor(() => expect(screen.getByText('Rota changes · 3 cases')).toBeInTheDocument());
  });

  it('shows the empty state when no theme has been tagged on 3+ cases', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]} caseThemes={[]} organisationThemes={[]}/>);
    await waitFor(() => expect(screen.getByText('No recurring themes tagged across 3+ cases yet.')).toBeInTheDocument());
  });

  // Phase 6.5 hardening (Batch 9) — "Cases by site" and "Cases by
  // department" used to render a completely blank panel when there was
  // no data at all, unlike their siblings ("Cases by type"/"Outcome
  // types"), which already had a "No data yet." message.
  it('shows "No data yet." for Cases by site and Cases by department when there is no data at all', async () => {
    const emptyOverview = { ...baseOverview, cases_by_location: {}, cases_by_department: {} };
    rpcMock.mockResolvedValue({ data: emptyOverview, error: null });
    render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Cases by site').closest('div')).toBeInTheDocument());
    const siteCard = screen.getByText('Cases by site').parentElement;
    const deptCard = screen.getByText('Cases by department').parentElement;
    expect(siteCard).toHaveTextContent('No data yet.');
    expect(deptCard).toHaveTextContent('No data yet.');
  });

  // Phase 6.5 hardening (closes Prompt 16 audit finding H18, HIGH) — a bar
  // reading "Dismissal: 1" or "Manchester: 1" is a direct re-identification
  // risk at a small site or for a rare outcome. Individual bars below the
  // sample floor must be held back, not shown at their raw small count.
  describe('sample floor on the breakdown bars (Prompt 16 audit, H18)', () => {
    const smallSampleOverview = {
      ...baseOverview,
      cases_by_type: { misconduct: 6, grievance: 1 },
      cases_by_outcome: { 'No further action': 3, Dismissal: 1 },
      cases_by_location: { 'Not specified': 10, Manchester: 2 },
      cases_by_department: { Finance: 10, Legal: 2 },
    };

    it('shows a bar with 3+ cases (misconduct) but holds back one under the floor (grievance)', async () => {
      rpcMock.mockResolvedValue({ data: smallSampleOverview, error: null });
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText('Cases by type')).toBeInTheDocument());
      const typeCard = screen.getByText('Cases by type').parentElement;
      expect(within(typeCard).getByText('misconduct')).toBeInTheDocument();
      expect(within(typeCard).queryByText('grievance')).not.toBeInTheDocument();
      expect(typeCard).toHaveTextContent('1 category with under 3 cases not shown');
    });

    it('holds back a rare outcome (Dismissal, count 1) while showing one with enough sample', async () => {
      rpcMock.mockResolvedValue({ data: smallSampleOverview, error: null });
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText('Outcome types')).toBeInTheDocument());
      const outcomeCard = screen.getByText('Outcome types').parentElement;
      expect(within(outcomeCard).getByText('No further action')).toBeInTheDocument();
      expect(within(outcomeCard).queryByText('Dismissal')).not.toBeInTheDocument();
    });

    it('holds back a small site (Manchester, count 2) and a small department (Legal, count 2)', async () => {
      rpcMock.mockResolvedValue({ data: smallSampleOverview, error: null });
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText('Cases by site')).toBeInTheDocument());
      const siteCard = screen.getByText('Cases by site').parentElement;
      const deptCard = screen.getByText('Cases by department').parentElement;
      expect(within(siteCard).queryByText('Manchester')).not.toBeInTheDocument();
      expect(within(deptCard).queryByText('Legal')).not.toBeInTheDocument();
    });
  });

  // Phase 6.5 hardening (Batch 12) — daysSinceMonthStart (the RPC's own
  // p_period_days) used to be a raw Math.ceil((now-startOfMonth)/
  // 86400000), which overcounts by a day across the UK autumn clock
  // change (25-hour local day). 30 Oct 2026 is 29 real calendar days
  // into the month, crossing the 25 Oct transition — the old code would
  // have sent 30.
  it('computes p_period_days as the correct calendar-day count across a DST transition, not off by one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
    try {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('org_insights_overview', { p_org_id: 'org1', p_period_days: 29 }));
    } finally {
      vi.useRealTimers();
    }
  });

  // Insights Phase 2 (Overview Intelligence) — the Needs Attention /
  // Cases Requiring Attention sections and their drill-down into the
  // existing Cases screen. daysAgoIso builds a real relative timestamp
  // off the current clock (no fake timers needed — these tests only
  // depend on "more than 30 days ago", which any sufficiently old offset
  // satisfies regardless of when the suite runs).
  const daysAgoIso = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  describe('Needs attention / Cases requiring attention (Insights Phase 2)', () => {
    it('shows "No cases currently require attention." when no signal fires', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [{ id: 'c1', employeeName: 'A', caseType: 'misconduct', createdAt: daysAgoIso(2) }];
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText('No cases currently require attention.')).toBeInTheDocument());
      expect(screen.queryByText('Cases requiring attention')).not.toBeInTheDocument();
    });

    it('shows an overdue Needs Attention signal and drills down into exactly those case ids', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [
        { id: 'c1', employeeName: 'A', caseType: 'misconduct', createdAt: daysAgoIso(2) },
        { id: 'c2', employeeName: 'B', caseType: 'grievance', createdAt: daysAgoIso(3) },
      ];
      const dueSoon = [{ caseId: 'c1', overdue: true, daysOverdue: 5 }];
      const onViewCases = vi.fn();
      const user = userEvent.setup();
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]} onViewCases={onViewCases}/>);
      await waitFor(() => expect(screen.getByText(/case has an overdue action/)).toBeInTheDocument());
      await user.click(screen.getAllByRole('button', { name: 'View cases →' })[0]);
      expect(onViewCases).toHaveBeenCalledWith({ caseIds: ['c1'] });
    });

    it('shows an ageing Needs Attention signal for open cases older than 30 days, excluding closed ones', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [
        { id: 'old', employeeName: 'A', caseType: 'misconduct', createdAt: daysAgoIso(45) },
        { id: 'closed-old', employeeName: 'B', caseType: 'misconduct', stage: 'closed', createdAt: daysAgoIso(900) },
      ];
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText(/open case is more than 30 days old/)).toBeInTheDocument());
    });

    it('shows a concentration signal only once one case type reaches 50% of the open caseload', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [
        { id: '1', employeeName: 'A', caseType: 'misconduct', createdAt: daysAgoIso(1) },
        { id: '2', employeeName: 'B', caseType: 'misconduct', createdAt: daysAgoIso(1) },
        { id: '3', employeeName: 'C', caseType: 'misconduct', createdAt: daysAgoIso(1) },
        { id: '4', employeeName: 'D', caseType: 'grievance', createdAt: daysAgoIso(1) },
        { id: '5', employeeName: 'E', caseType: 'grievance', createdAt: daysAgoIso(1) },
      ];
      const onViewCases = vi.fn();
      const user = userEvent.setup();
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]} onViewCases={onViewCases}/>);
      await waitFor(() => expect(screen.getByText(/misconduct accounts for 60% of the current open caseload/)).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'View cases →' }));
      expect(onViewCases).toHaveBeenCalledWith({ type: 'misconduct' });
    });

    it('does not render a "View cases" button when onViewCases is not supplied', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [{ id: 'c1', employeeName: 'A', caseType: 'misconduct', createdAt: daysAgoIso(1) }];
      const dueSoon = [{ caseId: 'c1', overdue: true, daysOverdue: 5 }];
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText(/case has an overdue action/)).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();
    });

    it('lists cases requiring attention and opens the clicked case via onOpenCase', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [{ id: 'c1', employeeName: 'Jamie Smith', caseType: 'misconduct', createdAt: daysAgoIso(2) }];
      const dueSoon = [{ caseId: 'c1', overdue: true, daysOverdue: 5 }];
      const onOpenCase = vi.fn();
      const user = userEvent.setup();
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]} onOpenCase={onOpenCase}/>);
      await waitFor(() => expect(screen.getByText('Cases requiring attention')).toBeInTheDocument());
      await user.click(screen.getByText('Jamie Smith'));
      expect(onOpenCase).toHaveBeenCalledWith('c1', expect.any(String));
    });

    it('excludes closed cases from Cases requiring attention even when overdue', async () => {
      rpcMock.mockResolvedValue({ data: baseOverview, error: null });
      const cases = [{ id: 'c1', employeeName: 'Closed Employee', caseType: 'misconduct', stage: 'closed', createdAt: daysAgoIso(900) }];
      const dueSoon = [{ caseId: 'c1', overdue: true, daysOverdue: 500 }];
      render(<OrganisationalIntelligenceOverview orgId="org1" cases={cases} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]}/>);
      await waitFor(() => expect(screen.getByText('No cases currently require attention.')).toBeInTheDocument());
      expect(screen.queryByText('Closed Employee')).not.toBeInTheDocument();
    });
  });
});
