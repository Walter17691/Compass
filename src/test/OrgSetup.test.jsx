import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrgSetup from '../OrgSetup.jsx';

vi.mock('../supabase', () => ({ supabase: { from: () => ({ insert: vi.fn(), select: vi.fn() }) } }));

// Phase 6.5 hardening (Batch 13) — the your-name, organisation-name, and
// invite-code fields had visual labels with no htmlFor/id association.
// Had no test coverage at all before this.
describe('OrgSetup — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels your name and organisation name on the "create" path', async () => {
    const user = userEvent.setup();
    render(<OrgSetup user={{ id: 'u1' }} onComplete={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Create a new team/ }));
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
  });

  it('labels the invite code field on the "join" path', async () => {
    const user = userEvent.setup();
    render(<OrgSetup user={{ id: 'u1' }} onComplete={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Join an existing team/ }));
    expect(screen.getByLabelText('Invite code')).toBeInTheDocument();
  });
});
