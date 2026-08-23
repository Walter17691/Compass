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
//
// Phase 6.5 hardening (accessibility pass) — was a bare aria-label="Full
// name" alongside an unassociated visual <label>Type your full name to
// sign</label> — a sighted user and a screen-reader user were being told
// two different things about the same field. Now a real htmlFor/id
// association, so both read the same, more informative text.
describe('PortalSignatures — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the typed-name field once signing starts', async () => {
    const user = userEvent.setup();
    render(<PortalSignatures userId="u1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign document' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Sign document' }));
    expect(screen.getByLabelText('Type your full name to sign')).toBeInTheDocument();
  });
});
