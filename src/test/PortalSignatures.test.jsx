import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalSignatures } from '../portal/PortalSignatures.jsx';

vi.mock('../lib/authedFetch', () => ({
  authedFetch: vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ pending: [{ sign_id: 's1', meeting_type: 'Disciplinary hearing', meeting_date: '2026-08-01', document: 'Record text' }] }) })),
}));

// Phase 6.5 hardening (Batch 13) — the typed-name field relied on
// placeholder text alone, with no other accessible name. Had no test
// coverage at all before this.
describe('PortalSignatures — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the typed-name field once signing starts', async () => {
    const user = userEvent.setup();
    render(<PortalSignatures userId="u1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign document' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Sign document' }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });
});
