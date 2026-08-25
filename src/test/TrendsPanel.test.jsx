import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { TrendsPanel } = await import('../components/TrendsPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP7/OP8, §2/§4)
describe('TrendsPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows a loading state, then a significant trend', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: { Manchester: 6, Leeds: 4 } }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    expect(screen.getByText(/Loading trends/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Compass has identified a pattern/)).toBeInTheDocument());
    expect(screen.getByText(/grievance cases increased 30%/)).toBeInTheDocument();
  });

  it('shows an empty state when no trend clears the significance threshold', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 11, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('No significant trends identified in the current period.')).toBeInTheDocument());
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText("Couldn't load trend data right now.")).toBeInTheDocument());
  });

  it('renders both type and theme trends', async () => {
    rpcMock.mockResolvedValue({
      data: {
        by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }],
        by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 5, previousCount: 0, byLocation: {} }],
      },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.getByText(/Rota changes had no recorded cases/)).toBeInTheDocument();
  });

  it('shows an Explore button only on theme trend cards, and opens root-cause exploration', async () => {
    const user = userEvent.setup();
    rpcMock.mockImplementation((fn) => {
      if (fn === 'org_trend_detection') return Promise.resolve({
        data: {
          by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }],
          by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }],
        },
        error: null,
      });
      if (fn === 'org_theme_root_cause') return Promise.resolve({
        data: { current_count: 13, by_location: {}, co_occurring_themes: [] },
        error: null,
      });
      return Promise.resolve({ data: null, error: null });
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Explore' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Explore' }));
    await waitFor(() => expect(screen.getByText('Root-cause exploration — Rota changes')).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith('org_theme_root_cause', { p_org_id: 'org1', p_theme_id: 't1', p_period_days: 90 });
  });

  it('shows a Show evidence button on every trend card and opens InsightEvidenceModal with real metrics', async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Show evidence' }));
    expect(screen.getByText('grievance')).toBeInTheDocument();
    expect(screen.getByText('Current period count')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/^Period:/)).toBeInTheDocument();
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17)
  it('shows a Create action control only when createCaseTask is passed in, and calls it with a real insightRef', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();

    render(<TrendsPanel orgId="org1" createCaseTask={createCaseTask}/>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create action' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: 'Create action' })[0]);
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review shift patterns');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    expect(createCaseTask).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Review shift patterns', insightRef: expect.stringContaining('grievance') }));
  });
});
