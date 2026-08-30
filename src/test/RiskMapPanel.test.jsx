import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { RiskMapPanel } = await import('../components/RiskMapPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP16, §13)
describe('RiskMapPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows a loading state, then site risk flags', async () => {
    rpcMock.mockResolvedValue({
      data: { cases_by_location: { Manchester: 15, London: 5 }, avg_duration_by_location: {}, avg_case_duration_days: 10 },
      error: null,
    });
    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]}/>);
    expect(screen.getByText(/Loading risk map/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Manchester')).toBeInTheDocument());
    expect(screen.getByText('Elevated case volume')).toBeInTheDocument();
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]}/>);
    await waitFor(() => expect(screen.getByText("Couldn't load risk map data right now.")).toBeInTheDocument());
  });

  it('shows a no-flags message for a site with nothing to flag', async () => {
    rpcMock.mockResolvedValue({
      data: { cases_by_location: { Manchester: 5, London: 5 }, avg_duration_by_location: {}, avg_case_duration_days: 10 },
      error: null,
    });
    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]}/>);
    await waitFor(() => expect(screen.getAllByText(/No risk flags detected for this site/).length).toBe(2));
  });

  it('includes the disclaimer that this is not a ranking and not based on protected characteristics', async () => {
    rpcMock.mockResolvedValue({ data: { cases_by_location: {}, avg_duration_by_location: {}, avg_case_duration_days: null }, error: null });
    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]}/>);
    await waitFor(() => expect(screen.getByText(/never a ranking and never based on protected characteristics/)).toBeInTheDocument());
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17)
  it('shows a Create action control per flag only when createCaseTask is passed in, with a site-and-flag insightRef', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    rpcMock.mockResolvedValue({
      data: { cases_by_location: { Manchester: 15, London: 5 }, avg_duration_by_location: {}, avg_case_duration_days: 10 },
      error: null,
    });
    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]}/>);
    await waitFor(() => expect(screen.getByText('Elevated case volume')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();

    render(<RiskMapPanel orgId="org1" cases={[]} employeeRecords={[]} processTemplates={[]} orgEvents={[]} createCaseTask={createCaseTask}/>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create action' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: 'Create action' })[0]);
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review Manchester rota');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    expect(createCaseTask).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Review Manchester rota', insightRef: expect.stringContaining('Manchester') }));
  });
});
