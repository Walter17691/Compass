import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('stripe', () => ({
  default: function Stripe() {
    return { checkout: { sessions: { create: () => Promise.resolve({ url: 'https://checkout.stripe.com/session/abc' }) } } };
  },
}));

const { checkout } = await import('./_checkout.js');

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (Prompt 14, Section 7 — sibling of finding 2.4) —
// checkout starts a real, financially-binding Stripe subscription; was
// membership-only with no role check, same gap as _manage.js. Safe to
// restrict to HR-only: an unsubscribed org can only ever have its
// creator as a member (main.jsx renders SubscribeGate instead of the
// whole app, including invites, whenever unsubscribed), and the creator
// is always assigned hr_director at org setup (OrgSetup.jsx) — so no
// legitimate non-HR caller can ever reach this endpoint.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, member = null } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(member ? [member] : []) });
    }
    if (u.includes('/rest/v1/locations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

function req() {
  return { method: 'GET', headers: { authorization: 'Bearer good' }, query: { orgId: 'org-1' } };
}

describe('billing/_checkout — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await checkout(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the org', async () => {
    stubFetch({ member: null });
    const res = mockRes();
    await checkout(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a non-HR member', async () => {
    stubFetch({ member: { role: 'line_manager' } });
    const res = mockRes();
    await checkout(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('allows an hr_director (the org creator role) to start checkout', async () => {
    stubFetch({ member: { role: 'hr_director' } });
    const res = mockRes();
    await checkout(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toContain('checkout.stripe.com');
  });
});
