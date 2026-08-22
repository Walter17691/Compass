import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortalSignup from '../PortalSignup.jsx';

vi.mock('../supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn() } } }));

// Phase 6.5 hardening (Batch 13) — the email and password fields had
// visual labels with no htmlFor/id association. Had no test coverage
// at all before this.
describe('PortalSignup — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the email and password fields', () => {
    render(<PortalSignup onLogin={() => {}} />);
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
