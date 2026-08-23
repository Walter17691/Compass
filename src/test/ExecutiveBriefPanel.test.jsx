import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

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

  // Phase 6.5 hardening (production regression suite, concurrency) — the
  // button's own disabled={generating} only protects against a second
  // click once React has actually re-rendered; this proves the guard
  // holds even for two click events dispatched back-to-back with no
  // await between them (a real fast double-click), not just two
  // sequential, individually-awaited clicks.
  it('a rapid double-click on Generate brief only triggers one real generation, not two', async () => {
    fromMock.mockReturnValue(selectChain({ data: [], error: null }));
    const overviewGate = deferred();
    rpcMock.mockImplementation((fn) => {
      if (fn === 'org_insights_overview') return overviewGate.promise;
      if (fn === 'org_trend_detection') return Promise.resolve({ data: { by_type_trend: [], by_theme_trend: [] }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    await waitFor(() => expect(screen.getByText('No executive brief generated yet.')).toBeInTheDocument());

    const button = screen.getByRole('button', { name: 'Generate brief' });
    // Two raw click events fired without awaiting in between — the
    // scenario a debounced/awaited userEvent.click() can't reproduce,
    // since it already yields to React between calls.
    fireEvent.click(button);
    fireEvent.click(button);

    overviewGate.resolve({ data: { total_cases: 5, open_cases: 2, opened_in_period: 1, closed_in_period: 1, cases_by_type: {}, cases_by_outcome: {}, avg_case_duration_days: null }, error: null });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    // Let any second, wrongly-fired generation's own microtasks settle too.
    await new Promise(r => setTimeout(r, 0));
    expect(rpcMock.mock.calls.filter(c => c[0] === 'org_insights_overview')).toHaveLength(1);
  });

  // Phase 6.5 hardening (production regression suite, concurrency) —
  // every self-fetching Insights panel in this phase (TrendsPanel,
  // RiskMapPanel, etc.) shares the same `let cancelled=false` /
  // `return()=>{cancelled=true}` guard around its mount-time fetch; this
  // is the one test in the suite that actually proves the pattern works,
  // rather than each panel merely following it by convention.
  it('does not update state on an unmounted component if the initial load resolves after unmount', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadGate = deferred();
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order: () => loadGate.promise }) }) });
    const { unmount } = render(<ExecutiveBriefPanel org={{ id: 'org1' }} user={{ id: 'u1' }} memberName="Jo Smith" isHR={true}/>);
    unmount();
    loadGate.resolve({ data: [{ id: 'b1', narrative: 'late', created_at: '2026-08-01T00:00:00Z', supporting_data: {} }], error: null });
    await loadGate.promise;
    await new Promise(r => setTimeout(r, 0));
    const unmountedStateWarning = consoleError.mock.calls.some(c => String(c[0]).includes("Can't perform a React state update on an unmounted component"));
    expect(unmountedStateWarning).toBe(false);
    consoleError.mockRestore();
  });
});
