import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamInviteAccept from '../TeamInviteAccept.jsx';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      signUp: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'sam@acme.com' }, session: null }, error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'sam@acme.com' }, session: {} }, error: null })),
    },
  },
}));
vi.mock('../supabase', () => ({ supabase: supabaseMock }));

const authedFetchMock = vi.fn();
vi.mock('../lib/authedFetch.js', () => ({ authedFetch: (...args) => authedFetchMock(...args) }));

const INVITE = { orgName: 'Acme', invitedName: 'Sam Invitee', invitedEmail: 'sam@acme.com', inviterName: 'Pat HR', roleLabel: 'HR Manager', status: 'pending' };

function stubInvite(invite = INVITE) {
  authedFetchMock.mockImplementation((url, options) => {
    const u = String(url);
    if (u.includes('/api/team/accept-team-invite') && (!options || options.method !== 'POST')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(invite) });
    }
    if (u.includes('/api/team/accept-team-invite') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, orgId: 'org-a', orgName: invite.orgName, role: 'hr_manager' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

// NEW-11 remediation — the whole point of splitting account creation
// from invitation acceptance is that ONE explicit action (accept_team_
// invite) is the only thing that ever grants org membership; creating a
// Supabase Auth account must never do that as a side effect, so an
// invitee who signs up and then closes the tab has an account but no
// membership — "abandoned" cleanly.
describe('TeamInviteAccept — account creation never auto-accepts the invitation', () => {
  beforeEach(() => { vi.clearAllMocks(); stubInvite(); localStorage.clear(); });

  it('creating an account calls only signUp — never the accept-team-invite POST', async () => {
    const onLogin = vi.fn();
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={onLogin} onAccepted={onAccepted} onDismiss={vi.fn()} onSignOut={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));

    await waitFor(() => expect(supabaseMock.auth.signUp).toHaveBeenCalled());
    expect(onAccepted).not.toHaveBeenCalled();
    const acceptPostCalls = authedFetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(acceptPostCalls).toHaveLength(0);
  });

  it('the invited email is displayed but not an editable input anywhere on the activation form', async () => {
    render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/sam@acme\.com/)).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it('rejects a create-account submission when the two password fields do not match, without calling signUp', async () => {
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-different-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters, without calling signUp', async () => {
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
  });

  it('shows a "confirm your email" interstitial when signUp returns no session, without treating it as an error', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'sam@acme.com' }, session: null }, error: null });
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={onLogin} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    expect(await screen.findByText(/Confirm your email/i)).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  // Final pre-deployment gate — a page refresh while waiting to confirm
  // (component state alone is wiped on reload) must not silently drop the
  // person back on a bare "create account" form with no memory that they
  // already signed up and are mid-confirmation.
  it('the "confirm your email" interstitial survives a page refresh (remount) for the same invited email', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'sam@acme.com' }, session: null }, error: null });
    const user = userEvent.setup();
    const { unmount } = render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    await screen.findByText(/Confirm your email/i);

    unmount(); // simulates a full page refresh — all component state is gone
    render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText(/Confirm your email/i)).toBeInTheDocument();
  });

  // Final pre-deployment gate — section 7: an existing Compass user who
  // mistakenly stays on the default "Create account" tab must be nudged
  // to sign in, not left to create (or be silently blocked from
  // creating) a confusing duplicate identity.
  it('nudges an existing account holder to the sign-in tab instead of leaving them on a failed signup', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'User already registered' } });
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={vi.fn()} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    expect(await screen.findByText(/already have a Compass account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in & continue/i })).toBeInTheDocument();
  });

  it('proceeds straight through (no interstitial) when signUp returns an active session immediately', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'sam@acme.com' }, session: { access_token: 'x' } }, error: null });
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(<TeamInviteAccept token="tok" user={null} onLogin={onLogin} onAccepted={vi.fn()} onDismiss={vi.fn()} onSignOut={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Create account & join Compass/i })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: /Create account & join Compass/i }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ id: 'u1', email: 'sam@acme.com' }));
    expect(screen.queryByText(/Confirm your email/i)).not.toBeInTheDocument();
  });
});
