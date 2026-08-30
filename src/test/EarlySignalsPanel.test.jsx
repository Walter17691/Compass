import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { EarlySignalsPanel } = await import('../components/EarlySignalsPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP9, §12)
describe('EarlySignalsPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('requests the 6-week window, not the 90-day one', async () => {
    rpcMock.mockResolvedValue({ data: { by_type_trend: [], by_theme_trend: [] }, error: null });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('org_trend_detection', { p_org_id: 'org1', p_period_days: 42 }));
  });

  it('shows a loading state, then a significant emerging theme', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'shift changes', currentCount: 5, previousCount: 1, byLocation: { Manchester: 2, London: 2, Leeds: 1 } }] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    expect(screen.getByText(/Loading early signals/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Emerging theme')).toBeInTheDocument());
    expect(screen.getByText(/5 cases across 3 locations/)).toBeInTheDocument();
    expect(screen.getByText(/Suggested review:/)).toBeInTheDocument();
  });

  it('ignores case-type trends entirely, even significant ones', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Not enough case volume yet/)).toBeInTheDocument());
    expect(screen.queryByText(/grievance/)).not.toBeInTheDocument();
  });

  // Design System Convergence pass, Phase 5 — genuinely NO SIGNAL
  // DETECTED (enough case volume to check, nothing significant found),
  // distinct from the NO DATA case below (currentCount under the
  // sample floor). Wording must read as a real, positive finding, not a
  // data gap.
  it('shows a distinct "no signal" message (not "not enough data") when volume is sufficient but flat', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'shift changes', currentCount: 5, previousCount: 5, byLocation: {} }] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/theme volume looks stable/)).toBeInTheDocument());
    expect(screen.queryByText(/Not enough case volume/)).not.toBeInTheDocument();
  });

  it('shows an empty state when no theme clears the significance threshold', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'X', currentCount: 2, previousCount: 1, byLocation: {} }] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    // Design System Convergence pass, Phase 5 — currentCount (2) is below
    // MIN_SAMPLE_SIZE (3), so this is genuinely the NO DATA case, not NO
    // SIGNAL DETECTED — a more accurate message than the old generic one.
    await waitFor(() => expect(screen.getByText(/Not enough case volume yet/)).toBeInTheDocument());
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText("Couldn't load early signal data right now.")).toBeInTheDocument());
  });

  it('opens InsightEvidenceModal with real counts when Show evidence is clicked', async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'shift changes', currentCount: 5, previousCount: 1, byLocation: {} }] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('Emerging theme')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Show evidence' }));
    expect(screen.getByText('shift changes')).toBeInTheDocument();
    expect(screen.getByText('Current 6-week count')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17)
  it('shows a Create action control only when createCaseTask is passed in', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'shift changes', currentCount: 5, previousCount: 1, byLocation: {} }] },
      error: null,
    });
    render(<EarlySignalsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('Emerging theme')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();

    render(<EarlySignalsPanel orgId="org1" createCaseTask={vi.fn()}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create action' })).toBeInTheDocument());
  });
});
