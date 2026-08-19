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
    render(<OrganisationalIntelligenceOverview cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    expect(screen.getByText(/Loading organisational statistics/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Open cases').parentElement).toHaveTextContent('4'));
    expect(rpcMock).toHaveBeenCalledWith('org_insights_overview', { p_period_days: expect.any(Number) });
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<OrganisationalIntelligenceOverview cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Couldn't load organisational statistics/)).toBeInTheDocument());
  });

  it('shows a data-quality caveat instead of a number when too few closed cases have a measurable duration', async () => {
    rpcMock.mockResolvedValue({ data: { ...baseOverview, closed_cases_with_duration: 1 }, error: null });
    render(<OrganisationalIntelligenceOverview cases={[]} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText(/Only 1 closed cases with measurable duration available/)).toBeInTheDocument());
  });

  it('counts overdue cases by unique case id, not by deadline item', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const dueSoon = [
      { caseId: 'c1', overdue: true }, { caseId: 'c1', overdue: true }, { caseId: 'c2', overdue: true }, { caseId: 'c3', overdue: false },
    ];
    render(<OrganisationalIntelligenceOverview cases={[]} dueSoon={dueSoon} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Overdue cases')).toBeInTheDocument());
    const tile = screen.getByText('Overdue cases').parentElement;
    expect(tile).toHaveTextContent('2');
  });

  it('counts cases returned for further investigation from hrReviewRequests', async () => {
    rpcMock.mockResolvedValue({ data: baseOverview, error: null });
    const hrReviewRequests = [
      { step: 'inv_report', status: 'returned' }, { step: 'inv_report', status: 'returned' }, { step: 'inv_report', status: 'approved' }, { step: 'outcome', status: 'returned' },
    ];
    render(<OrganisationalIntelligenceOverview cases={[]} dueSoon={[]} hrReviewRequests={hrReviewRequests} processTemplates={[]}/>);
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
    render(<OrganisationalIntelligenceOverview cases={cases} dueSoon={[]} hrReviewRequests={[]} processTemplates={[]}/>);
    await waitFor(() => expect(screen.getByText('Informal resolution')).toBeInTheDocument());
    expect(screen.getByText('1 formal')).toBeInTheDocument();
  });
});
