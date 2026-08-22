import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args), from: (...args) => fromMock(...args) } }));
vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const { PeriodicReviewPanel } = await import('../components/PeriodicReviewPanel.jsx');
const { authedFetch } = await import('../lib/authedFetch');

function selectChain(result) {
  const chain = { select: () => chain, eq: () => chain, not: () => chain, order: () => Promise.resolve(result) };
  return chain;
}

// Organisational ER Intelligence (Phase 6, OP19, §16)
describe('PeriodicReviewPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); fromMock.mockReset(); authedFetch.mockReset(); });

  it('offers weekly, monthly, and quarterly period options', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No periodic review generated yet.')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Weekly ER Review' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Monthly People Risk Review' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Quarterly ER Review' })).toBeInTheDocument();
  });

  it('hides period selector and generate button for non-HR', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={false}/>);
    await waitFor(() => expect(screen.getByText('No periodic review generated yet.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Generate review' })).not.toBeInTheDocument();
  });

  it('shows existing review history with its period label', async () => {
    fromMock.mockReturnValue(selectChain({ data: [{ id: 'r1', period_type: 'weekly', narrative: 'Weekly narrative text', created_at: '2026-08-01T00:00:00Z', generated_by_name: 'Jo Smith' }], error: null }));
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('Weekly narrative text')).toBeInTheDocument());
    expect(screen.getByText(/Weekly ER Review · generated/)).toBeInTheDocument();
  });

  it('generates a weekly review using a 7-day window and tags it with period_type', async () => {
    const user = userEvent.setup();
    let insertedRow = null;
    let overviewCallDays = null;
    let trendCallDays = null;
    fromMock.mockImplementation((table) => {
      if (table === 'er_executive_briefs') {
        return {
          select: () => selectChain({ data: [], error: null }),
          insert: (row) => { insertedRow = row; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'r2', ...row, created_at: '2026-08-20T00:00:00Z' }, error: null }) }) }; },
        };
      }
      return selectChain({ data: [], error: null });
    });
    rpcMock.mockImplementation((fn, args) => {
      if (fn === 'org_insights_overview') { overviewCallDays = args.p_period_days; return Promise.resolve({ data: { total_cases: 5, open_cases: 2, opened_in_period: 1, closed_in_period: 1, cases_by_type: {}, cases_by_outcome: {}, avg_case_duration_days: null }, error: null }); }
      if (fn === 'org_trend_detection') { trendCallDays = args.p_period_days; return Promise.resolve({ data: { by_type_trend: [], by_theme_trend: [] }, error: null }); }
      if (fn === 'org_case_stats') return Promise.resolve({ data: { high_priority_active: 3 }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    authedFetch.mockResolvedValue({ json: () => Promise.resolve({ content: [{ type: 'text', text: 'Weekly review narrative.' }] }) });

    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No periodic review generated yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Generate review' }));
    await waitFor(() => expect(screen.getByText('Weekly review narrative.')).toBeInTheDocument());
    expect(insertedRow.period_type).toBe('weekly');
    expect(overviewCallDays).toBe(7);
    expect(trendCallDays).toBe(7);
  });

  it('shows an error message when generation fails', async () => {
    const user = userEvent.setup();
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No periodic review generated yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Generate review' }));
    await waitFor(() => expect(screen.getByText(/Couldn't generate the review/)).toBeInTheDocument());
  });

  // Phase 6.5 hardening (Batch 8) — a failed load used to silently leave
  // reviews at [], indistinguishable from "genuinely no reviews yet."
  it('shows a load-error message instead of the misleading empty state when the initial load fails', async () => {
    fromMock.mockReturnValue(selectChain({ data: null, error: new Error('network error') }));
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText("Couldn't load the periodic review history right now.")).toBeInTheDocument());
    expect(screen.queryByText('No periodic review generated yet.')).not.toBeInTheDocument();
  });

  // Phase 6.5 hardening (Batch 13) — the review-period select had no
  // accessible name at all.
  it('labels the review-period select', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    render(<PeriodicReviewPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No periodic review generated yet.')).toBeInTheDocument());
    expect(screen.getByLabelText('Review period')).toBeInTheDocument();
  });
});
