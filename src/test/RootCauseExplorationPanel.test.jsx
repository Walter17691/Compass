import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { RootCauseExplorationPanel } = await import('../components/RootCauseExplorationPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP8, §4)
describe('RootCauseExplorationPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows a loading state, then the summary and review areas', async () => {
    rpcMock.mockResolvedValue({
      data: { current_count: 19, by_location: { Manchester: 6, Birmingham: 5 }, co_occurring_themes: [{ themeId: 't2', themeName: 'Rota changes', count: 4 }] },
      error: null,
    });
    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="Management communication" onClose={()=>{}}/>);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/appears in 19 cases this period/)).toBeInTheDocument());
    expect(screen.getByText(/Manchester — 6/)).toBeInTheDocument();
    expect(screen.getByText(/Rota changes/)).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith('org_theme_root_cause', { p_org_id: 'org1', p_theme_id: 't1', p_period_days: 90 });
  });

  it('shows an empty state when there are no co-occurring themes', async () => {
    rpcMock.mockResolvedValue({ data: { current_count: 3, by_location: {}, co_occurring_themes: [] }, error: null });
    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="X" onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('No commonly co-occurring themes found for this period.')).toBeInTheDocument());
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="X" onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText("Couldn't load root-cause data right now.")).toBeInTheDocument());
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    rpcMock.mockResolvedValue({ data: { current_count: 1, by_location: {}, co_occurring_themes: [] }, error: null });
    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="X" onClose={onClose}/>);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('re-fetches when themeId changes', async () => {
    rpcMock.mockResolvedValue({ data: { current_count: 1, by_location: {}, co_occurring_themes: [] }, error: null });
    const { rerender } = render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="X" onClose={()=>{}}/>);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    rerender(<RootCauseExplorationPanel orgId="org1" themeId="t2" themeName="Y" onClose={()=>{}}/>);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenLastCalledWith('org_theme_root_cause', { p_org_id: 'org1', p_theme_id: 't2', p_period_days: 90 });
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17)
  it('shows a Create action control only when createCaseTask is passed in, scoped to the explored theme', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    rpcMock.mockResolvedValue({ data: { current_count: 3, by_location: {}, co_occurring_themes: [] }, error: null });
    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="Management communication" onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/appears in 3 cases/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();

    render(<RootCauseExplorationPanel orgId="org1" themeId="t1" themeName="Management communication" createCaseTask={createCaseTask} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create action' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Create action' }));
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Schedule manager comms review');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    expect(createCaseTask).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Schedule manager comms review', insightRef: expect.stringContaining('Management communication') }));
  });
});
