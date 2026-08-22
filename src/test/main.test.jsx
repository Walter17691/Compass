import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Phase 6.5 hardening — tenant isolation (P0). Tests that main.jsx's
// Root() genuinely remounts Compass on every org switch (key={org.id}),
// rather than re-rendering the same instance with new props. Compass
// itself (App.jsx) is mocked out with a lightweight stand-in that
// mirrors the exact patterns the real bug lived in — a useState seeded
// once from a prop (org.notification_webhook_url, currentUser from
// member) and locally-accumulated UI state (a case counter) — so this
// test exercises the real mechanism, not a re-implementation of it.
// supabase/authedFetch are mocked; no real network or backend involved.

const ORG_A = { id: 'org-a', name: 'Org A', plan: 'pro', stripe_subscription_status: 'active', notification_webhook_url: 'https://hooks.slack.com/org-a', notification_webhook_type: 'slack' };
const ORG_B = { id: 'org-b', name: 'Org B', plan: 'pro', stripe_subscription_status: 'active', notification_webhook_url: 'https://hooks.slack.com/org-b', notification_webhook_type: 'slack' };
const FAKE_USER = { id: 'user-1', email: 'hr@example.com', user_metadata: { name: 'Priya Shah' } };
const MEMBERSHIPS = [
  { id: 'mem-a', org_id: 'org-a', user_id: 'user-1', role: 'hr_director', organisations: ORG_A },
  { id: 'mem-b', org_id: 'org-b', user_id: 'user-1', role: 'location_manager', organisations: ORG_B },
];

const supabaseMock = {
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: { user: FAKE_USER } } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(() => Promise.resolve()),
  },
  from: vi.fn((table) => ({
    select: () => ({
      eq: () => Promise.resolve(table === 'org_members' ? { data: MEMBERSHIPS } : { data: [] }),
    }),
  })),
};
vi.mock('../supabase.js', () => ({ supabase: supabaseMock }));
vi.mock('../lib/authedFetch.js', () => ({ authedFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ isPortalUser: false }) })) }));

// A nested child mimicking TrendsPanel.jsx/EarlySignalsPanel.jsx/
// RiskMapPanel.jsx/OrganisationalIntelligenceOverview.jsx's own
// useEffect(..., []) shape — proves the top-level remount cascades to
// descendants too, not just Compass's own state.
function FakeInsightsPanel({ orgId }) {
  const [data, setData] = useState(null);
  useEffect(() => { setData(`${orgId}-insights-data`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div data-testid="insights-data">{data}</div>;
}

let instanceCounter = 0;
vi.mock('../App.jsx', () => ({
  default: function FakeCompass({ org, member, availableOrgs, switchOrg, onSignOut }) {
    // Lazy useState initialisers only run once per mount — exactly the
    // shape App.jsx's real currentUser/orgWebhookUrl state uses. If the
    // remount ever stopped happening, these would keep the previous
    // org's values forever, which is precisely the bug being tested for.
    const [instanceId] = useState(() => `instance-${++instanceCounter}`);
    const [webhookUrl] = useState(org.notification_webhook_url || '');
    const [localCaseCount, setLocalCaseCount] = useState(0);
    const [lastSavedOrgId, setLastSavedOrgId] = useState(null);
    return (
      <div>
        <div data-testid="org-id">{org.id}</div>
        <div data-testid="member-role">{member?.role}</div>
        <div data-testid="instance-id">{instanceId}</div>
        <div data-testid="webhook-url">{webhookUrl}</div>
        <div data-testid="local-case-count">{localCaseCount}</div>
        <div data-testid="last-saved-org-id">{lastSavedOrgId ?? ''}</div>
        <FakeInsightsPanel orgId={org.id}/>
        <button onClick={()=>setLocalCaseCount(c=>c+1)}>Add local case</button>
        {/* Mirrors saveCaseToDB's org.id closure — proves a save fired
            right after switching always uses the CURRENT org, never a
            stale one, because it can only run inside the current
            (correctly org-scoped) mounted instance at all. */}
        <button onClick={()=>setLastSavedOrgId(org.id)}>Save case</button>
        {availableOrgs.map(o => <button key={o.id} onClick={()=>switchOrg(o.id)}>Switch to {o.name}</button>)}
        <button onClick={onSignOut}>Sign out</button>
      </div>
    );
  },
}));

// main.jsx's own bottom line (createRoot(document.getElementById('root'))
// .render(<StrictMode><Root/></StrictMode>)) is a real, unconditional
// side effect that fires on import regardless of which named export is
// used — a #root element must exist before that import happens, or React
// throws immediately. That bootstrap-mounted tree is never interacted
// with by this file's own tests (each uses its own explicit render(<Root/>)
// call instead), but if left attached to document.body it eventually
// resolves its own async auth/org load and renders a second, real set of
// "Switch to Org X" buttons — invisible in a quick/isolated run, but a
// genuine intermittent multiple-elements-found flake once the suite runs
// long enough for both trees to settle. Detaching #root right after
// import (React keeps rendering into the now-orphaned node harmlessly;
// document.body queries never see it again) avoids that entirely.
document.body.innerHTML = '<div id="root"></div>';
const { Root } = await import('../main.jsx');
document.body.innerHTML = '';

describe('Root — org switch tenant isolation (Phase 6.5, P0)', () => {
  beforeEach(() => { instanceCounter = 0; localStorage.clear(); vi.clearAllMocks();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { user: FAKE_USER } } });
    supabaseMock.from.mockImplementation((table) => ({ select: () => ({ eq: () => Promise.resolve(table === 'org_members' ? { data: MEMBERSHIPS } : { data: [] }) }) }));
  });

  it('never renders the previous org\'s local UI state after switching — proves a real remount, not a prop update', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));
    const instanceIdA = screen.getByTestId('instance-id').textContent;

    // Simulate real, un-persisted local UI state accumulated while working
    // in org A (the equivalent of an in-progress cases array, draft edits,
    // etc.) — this must NOT survive the switch.
    await user.click(screen.getByRole('button', { name: 'Add local case' }));
    await user.click(screen.getByRole('button', { name: 'Add local case' }));
    expect(screen.getByTestId('local-case-count')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-b'));

    expect(screen.getByTestId('instance-id')).not.toHaveTextContent(instanceIdA);
    expect(screen.getByTestId('local-case-count')).toHaveTextContent('0');
  });

  it('refetches org-scoped data in descendant panels on switch (Insights-style empty-deps effects)', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('insights-data')).toHaveTextContent('org-a-insights-data'));

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('insights-data')).toHaveTextContent('org-b-insights-data'));
  });

  it('currentUser/member identity updates to the new org\'s own membership, not a stale one', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('member-role')).toHaveTextContent('hr_director'));

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('member-role')).toHaveTextContent('location_manager'));
  });

  it('org-specific settings (e.g. Slack webhook URL) update to the new org\'s own value, never leak the previous org\'s', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('webhook-url')).toHaveTextContent('https://hooks.slack.com/org-a'));

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('webhook-url')).toHaveTextContent('https://hooks.slack.com/org-b'));
  });

  it('a save fired after switching is always scoped to the new org, never the previous one', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-b'));
    await user.click(screen.getByRole('button', { name: 'Save case' }));
    expect(screen.getByTestId('last-saved-org-id')).toHaveTextContent('org-b');
  });

  it('rapid repeated switching never leaves mixed-org state across fields', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    const switchTo = async (name) => {
      await user.click(screen.getByRole('button', { name: `Switch to ${name}` }));
      await waitFor(() => {}); // let the remount settle before asserting
    };
    await switchTo('Org B');
    await switchTo('Org A');
    await switchTo('Org B');
    await switchTo('Org A');
    await switchTo('Org B');

    // Every field must agree on the SAME org after the dust settles — a
    // torn state (one field showing org A, another still org B) is
    // exactly what an incomplete/partial reset would produce.
    await waitFor(() => {
      expect(screen.getByTestId('org-id')).toHaveTextContent('org-b');
      expect(screen.getByTestId('member-role')).toHaveTextContent('location_manager');
      expect(screen.getByTestId('webhook-url')).toHaveTextContent('https://hooks.slack.com/org-b');
      expect(screen.getByTestId('insights-data')).toHaveTextContent('org-b-insights-data');
      expect(screen.getByTestId('local-case-count')).toHaveTextContent('0');
    });
  });

  it('clears a deep-linked case/screen from the URL on switch, so the new org never opens a stale case id from the old one', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/?screen=case&case=org-a-case-uuid');
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));
    expect(window.location.search).toContain('case=org-a-case-uuid');

    await user.click(screen.getByRole('button', { name: 'Switch to Org B' }));
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-b'));

    expect(window.location.search).not.toContain('case=');
    expect(window.location.search).not.toContain('screen=');
  });
});

// Phase 6.5 hardening (High, security review) — shared-device sign-out.
// Previously signOut() only cleared Supabase's own session; every
// org-scoped localStorage cache (cases, wellbeing notes, employee
// records, meeting drafts, ...) was left behind for whoever used the
// browser next. clearAllOrgScopedData() (src/lib/storage.js) is now
// called as part of sign-out itself.
describe('Root — shared-device sign-out clears cached ER data (Phase 6.5, High)', () => {
  beforeEach(() => { instanceCounter = 0; localStorage.clear(); vi.clearAllMocks();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { user: FAKE_USER } } });
    supabaseMock.from.mockImplementation((table) => ({ select: () => ({ eq: () => Promise.resolve(table === 'org_members' ? { data: MEMBERSHIPS } : { data: [] }) }) }));
  });

  it('wipes every cached sensitive key for the active org when signing out', async () => {
    const user = userEvent.setup();
    localStorage.setItem('org-a:compass_wellbeing', JSON.stringify([{ employeeName: 'Sam', content: 'confidential health note' }]));
    localStorage.setItem('org-a:compass_employees', JSON.stringify([{ name: 'Sam' }]));
    localStorage.setItem('org-a:compass_cases', JSON.stringify([{ id: 'case-a' }]));

    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(localStorage.getItem('org-a:compass_wellbeing')).toBeNull();
    expect(localStorage.getItem('org-a:compass_employees')).toBeNull();
    expect(localStorage.getItem('org-a:compass_cases')).toBeNull();
  });

  it('actually calls supabase.auth.signOut, not just a local state reset', async () => {
    const user = userEvent.setup();
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
  });

  it('returns to the login screen after signing out, not a stale authenticated view', async () => {
    const user = userEvent.setup();
    supabaseMock.auth.getSession.mockResolvedValueOnce({ data: { session: { user: FAKE_USER } } })
      .mockResolvedValue({ data: { session: null } });
    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument());
  });

  it('clears cached data for every org this browser has used, not just the currently active one', async () => {
    const user = userEvent.setup();
    localStorage.setItem('org-a:compass_cases', JSON.stringify([{ id: 'case-a' }]));
    localStorage.setItem('org-b:compass_wellbeing', JSON.stringify([{ employeeName: 'Other org employee' }]));

    render(<Root/>);
    await waitFor(() => expect(screen.getByTestId('org-id')).toHaveTextContent('org-a'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(localStorage.getItem('org-a:compass_cases')).toBeNull();
    expect(localStorage.getItem('org-b:compass_wellbeing')).toBeNull();
  });
});
