import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommunicationsTab } from '../components/caseTabs/CommunicationsTab.jsx';

const fmtDate = d => d;

describe('CommunicationsTab (Phase 5, IP31)', () => {
  it('shows an empty state when the case has no communications', () => {
    const cs = { id: 'c1', meetings: [], evidence: [] };
    render(<CommunicationsTab cs={cs} allegations={[]} auditLog={[]} fmtDate={fmtDate} />);
    expect(screen.getByText('No emails, letters or meeting invitations recorded on this case yet.')).toBeInTheDocument();
  });

  it('renders a meeting, an email, and a sent letter, each with its type badge', () => {
    const cs = {
      id: 'c1',
      meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes' }],
      evidence: [
        { source: 'email', name: 'note.txt', date: '2026-08-02', addedBy: 'Jo Smith' },
        { source: 'sent_letter', name: 'Sent: Outcome Letter', date: '2026-08-03', addedBy: 'Jo Smith' },
      ],
    };
    render(<CommunicationsTab cs={cs} allegations={[]} auditLog={[]} fmtDate={fmtDate} />);
    expect(screen.getByText('Communications (3)')).toBeInTheDocument();
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Letter')).toBeInTheDocument();
  });

  it('shows a signature status badge only for entries with a real signId', () => {
    const cs = {
      id: 'c1',
      meetings: [
        { id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes', signId: 'sign-1', signStatus: 'signed' },
        { id: 'm2', type: 'Return to work', date: '2026-08-02', record: 'notes' },
      ],
      evidence: [],
    };
    render(<CommunicationsTab cs={cs} allegations={[]} auditLog={[]} fmtDate={fmtDate} />);
    expect(screen.getByText('Signed')).toBeInTheDocument();
  });

  it('calls onOpenSource with the entry\'s linkTo when "Open source" is clicked', async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    const cs = { id: 'c1', meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes' }], evidence: [] };
    render(<CommunicationsTab cs={cs} allegations={[]} auditLog={[]} fmtDate={fmtDate} onOpenSource={onOpenSource} />);
    await user.click(screen.getByRole('button', { name: 'Open source' }));
    expect(onOpenSource).toHaveBeenCalledWith({ kind: 'meeting', id: 'm1' });
  });
});
