import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { TrendsPanel } = await import('../components/TrendsPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP7, §2)
describe('TrendsPanel', () => {
  it('shows a loading state, then a significant trend', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: { Manchester: 6, Leeds: 4 } }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel/>);
    expect(screen.getByText(/Loading trends/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Compass has identified a pattern/)).toBeInTheDocument());
    expect(screen.getByText(/grievance cases increased 30%/)).toBeInTheDocument();
  });

  it('shows an empty state when no trend clears the significance threshold', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 11, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel/>);
    await waitFor(() => expect(screen.getByText('No significant trends identified in the current period.')).toBeInTheDocument());
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<TrendsPanel/>);
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
    render(<TrendsPanel/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.getByText(/Rota changes had no recorded cases/)).toBeInTheDocument();
  });
});
