import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('stripe', () => ({
  default: function Stripe() {
    return { billingPortal: { sessions: { create: () => Promise.resolve({ url: 'https://billing.stripe.com/session/abc' }) } } };
  },
}));

const { manage } = await import('./_manage.js');

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (Prompt 14, Section 7 — closes independent audit
// finding 2.4, billing half). Was select=id with no role filter at all —
// any org member, including the nominally read-only auditor role, could
// open a real Stripe Billing Portal session. Now HR-only, same bar as
// every other billing-adjacent control.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, member = null, stripeCustomerId = 'cus_123' } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(member ? [member] : []) });
    }
    if (u.includes('/rest/v1/organisations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(stripeCustomerId ? [{ stripe_customer_id: stripeCustomerId }] : []) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

function req() {
  return { method: 'GET', headers: { authorization: 'Bearer good' }, query: { orgId: 'org-1' } };
}

describe('billing/_manage — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the org', async () => {
    stubFetch({ member: null });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a non-HR member (line_manager)', async () => {
    stubFetch({ member: { role: 'line_manager' } });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects the nominally read-only auditor role', async () => {
    stubFetch({ member: { role: 'auditor' } });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('allows an hr_manager to open a billing portal session', async () => {
    stubFetch({ member: { role: 'hr_manager' } });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toContain('billing.stripe.com');
  });

  it('allows an hr_director to open a billing portal session', async () => {
    stubFetch({ member: { role: 'hr_director' } });
    const res = mockRes();
    await manage(req(), res);
    expect(res.statusCode).toBe(200);
  });
});
