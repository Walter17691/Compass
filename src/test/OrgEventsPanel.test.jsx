import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { OrgEventsPanel } = await import('../components/OrgEventsPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP15, §11)
describe('OrgEventsPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows an empty state with no events logged', () => {
    render(<OrgEventsPanel orgEvents={[]} isHR={true} onAddEvent={()=>{}}/>);
    expect(screen.getByText('No organisational events logged yet.')).toBeInTheDocument();
  });

  it('lists events sorted by date, most recent first', () => {
    const orgEvents = [
      { id: 'e1', eventDate: '2026-01-01', eventType: 'restructure', description: 'Old event', affectedLocations: [] },
      { id: 'e2', eventDate: '2026-06-01', eventType: 'new_rota_system', description: 'New rota rolled out', affectedLocations: ['Manchester'] },
    ];
    render(<OrgEventsPanel orgEvents={orgEvents} isHR={true} onAddEvent={()=>{}}/>);
    const descriptions = screen.getAllByText(/Old event|New rota rolled out/).map(el => el.textContent);
    expect(descriptions[0]).toBe('New rota rolled out');
    expect(screen.getByText(/Manchester/)).toBeInTheDocument();
  });

  it('hides the logging form and Explore buttons for a non-HR user', () => {
    const orgEvents = [{ id: 'e1', eventDate: '2026-06-01', eventType: 'restructure', description: 'X', affectedLocations: [] }];
    render(<OrgEventsPanel orgEvents={orgEvents} isHR={false} onAddEvent={()=>{}}/>);
    expect(screen.queryByText('Log an event')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explore correlation' })).not.toBeInTheDocument();
  });

  it('calls onAddEvent with the entered fields and clears the form', async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(<OrgEventsPanel orgEvents={[]} isHR={true} onAddEvent={onAddEvent}/>);
    await user.type(screen.getByPlaceholderText('Description'), 'New rota system launched');
    await user.type(screen.getByPlaceholderText('Affected locations (comma-separated, optional)'), 'Manchester, Leeds');
    await user.type(screen.getByLabelText('Event date'), '2026-06-15');
    await user.click(screen.getByRole('button', { name: 'Log event' }));
    expect(onAddEvent).toHaveBeenCalledWith({
      eventDate: '2026-06-15', eventType: 'restructure', description: 'New rota system launched', affectedLocations: ['Manchester', 'Leeds'],
    });
    expect(screen.getByPlaceholderText('Description')).toHaveValue('');
  });

  // Phase 6.5 hardening (Batch 9) — the date/type fields had no label or
  // placeholder at all (previously only reachable via a raw
  // document.querySelector in this very test file); description/
  // affected-locations relied on placeholder text alone, not a reliable
  // accessible name for assistive tech.
  it('labels every "Log an event" field with a real accessible name', () => {
    render(<OrgEventsPanel orgEvents={[]} isHR={true} onAddEvent={vi.fn()}/>);
    expect(screen.getByLabelText('Event date')).toBeInTheDocument();
    expect(screen.getByLabelText('Event type')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Affected locations (comma-separated, optional)')).toBeInTheDocument();
  });

  it('disables Log event until date and description are filled', () => {
    render(<OrgEventsPanel orgEvents={[]} isHR={true} onAddEvent={()=>{}}/>);
    expect(screen.getByRole('button', { name: 'Log event' })).toBeDisabled();
  });

  it('shows correlation data when Explore correlation is clicked', async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({ data: { before_count: 5, after_count: 10 }, error: null });
    const orgEvents = [{ id: 'e1', eventDate: '2026-06-01', eventType: 'restructure', description: 'X', affectedLocations: [] }];
    render(<OrgEventsPanel orgEvents={orgEvents} isHR={true} onAddEvent={()=>{}}/>);
    await user.click(screen.getByRole('button', { name: 'Explore correlation' }));
    await waitFor(() => expect(screen.getByText(/increased 100%/)).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith('org_event_correlation', { p_event_id: 'e1', p_window_days: 42 });
  });
});
