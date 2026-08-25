import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
    await waitFor(() => expect(screen.getByText('Overdue cases')).toBeInTheDocument());
    const tile = screen.getByText('Overdue cases').parentElement;
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
    await waitFor(() => expect(screen.getByText('Informal resolution')).toBeInTheDocument());
    expect(screen.getByText('1 formal')).toBeInTheDocument();
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
});
