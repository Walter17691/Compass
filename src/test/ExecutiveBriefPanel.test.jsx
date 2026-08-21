import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args), from: (...args) => fromMock(...args) } }));
vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const { ExecutiveBriefPanel } = await import('../components/ExecutiveBriefPanel.jsx');
const { authedFetch } = await import('../lib/authedFetch');

function selectChain(result) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => Promise.resolve(result),
  };
  return chain;
}

// Organisational ER Intelligence (Phase 6, OP18, §15)
describe('ExecutiveBriefPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); fromMock.mockReset(); authedFetch.mockReset(); });

  it('loads and shows an existing history of briefs', async () => {
    fromMock.mockReturnValue(selectChain({ data: [{ id: 'b1', narrative: 'Existing brief text', created_at: '2026-08-01T00:00:00Z', generated_by_name: 'Jo Smith', supporting_data: { totalCases: 10, openCases: 3, openedInPeriod: 1, closedInPeriod: 1 } }], error: null }));
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('Existing brief text')).toBeInTheDocument());
    expect(screen.getByText(/Supporting data/)).toBeInTheDocument();
  });

  it('shows an empty state with no briefs generated yet', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No executive brief generated yet.')).toBeInTheDocument());
  });

  it('hides the Generate brief button for non-HR', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={false}/>);
    await waitFor(() => expect(screen.getByText('No executive brief generated yet.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Generate brief' })).not.toBeInTheDocument();
  });

  it('generates a brief end-to-end: fetches RPCs, calls the AI, and persists the result', async () => {
    const user = userEvent.setup();
    let insertedRow = null;
    fromMock.mockImplementation((table) => {
      if (table === 'er_executive_briefs') {
        return {
          select: () => selectChain({ data: [], error: null }),
          insert: (row) => { insertedRow = row; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'b2', ...row, created_at: '2026-08-20T00:00:00Z' }, error: null }) }) }; },
        };
      }
      return selectChain({ data: [], error: null });
    });
    rpcMock.mockImplementation((fn) => {
      if (fn === 'org_insights_overview') return Promise.resolve({ data: { total_cases: 5, open_cases: 2, opened_in_period: 1, closed_in_period: 1, cases_by_type: {}, cases_by_outcome: {}, avg_case_duration_days: null }, error: null });
      if (fn === 'org_trend_detection') return Promise.resolve({ data: { by_type_trend: [], by_theme_trend: [] }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    authedFetch.mockResolvedValue({ json: () => Promise.resolve({ content: [{ type: 'text', text: 'Generated narrative text.' }] }) });

    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No executive brief generated yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Generate brief' }));
    await waitFor(() => expect(screen.getByText('Generated narrative text.')).toBeInTheDocument());
    expect(insertedRow.narrative).toBe('Generated narrative text.');
    expect(insertedRow.org_id).toBe('org1');
  });

  // Phase 6.5 hardening (Batch 8) — a failed load used to silently leave
  // briefs at [], indistinguishable from "genuinely no briefs yet."
  it('shows a load-error message instead of the misleading empty state when the initial load fails', async () => {
    fromMock.mockReturnValue(selectChain({ data: null, error: new Error('network error') }));
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText("Couldn't load the executive brief history right now.")).toBeInTheDocument());
    expect(screen.queryByText('No executive brief generated yet.')).not.toBeInTheDocument();
  });

  it('shows an error message when generation fails', async () => {
    const user = userEvent.setup();
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No executive brief generated yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Generate brief' }));
    await waitFor(() => expect(screen.getByText(/Couldn't generate the brief/)).toBeInTheDocument());
  });
});
