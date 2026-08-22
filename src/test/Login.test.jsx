import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Login from '../Login.jsx';

vi.mock('../supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() } } }));

// Phase 6.5 hardening (Batch 13) — the name/company/email/password
// fields all had a visual label with no htmlFor/id association. Had no
// test coverage at all before this.
describe('Login — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the email and password fields on the default login form', () => {
    render(<Login onLogin={() => {}} />);
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('labels the name and company fields on the signup form', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Login onLogin={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Create one' }));
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toBeInTheDocument();
  });
});
