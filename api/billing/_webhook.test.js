import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 6.5 hardening (production regression suite, integrations) — the
// Stripe billing webhook had no test coverage at all. The prompt's named
// "duplicate webhook" scenario matters here specifically: Stripe's own
// delivery guarantee is at-least-once, so any handler that isn't
// naturally idempotent risks double-applying a side effect on a retried
// delivery. This confirms the handler's actual design — every branch
// PATCHes the SAME target values regardless of how many times the same
// event is delivered — genuinely holds, rather than assuming it from
// reading the code.
let constructEventImpl;
vi.mock('stripe', () => ({
  default: function Stripe() {
    return { webhooks: { constructEvent: (...args) => constructEventImpl(...args) } };
  },
}));

const { webhook } = await import('./_webhook.js');

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function mockReq() {
  const req = { method: 'POST', headers: { 'stripe-signature': 'sig' } };
  req.on = (event, cb) => {
    if (event === 'data') cb(Buffer.from('{}'));
    if (event === 'end') cb();
    return req;
  };
  return req;
}

function stubFetch() {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  return calls;
}

const checkoutCompletedEvent = {
  type: 'checkout.session.completed',
  data: { object: { client_reference_id: 'org-1', customer: 'cus_1', subscription: 'sub_1' } },
};

describe('billing webhook', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects a request with an invalid/forged signature', async () => {
    constructEventImpl = () => { throw new Error('signature mismatch'); };
    const res = mockRes();
    await webhook(mockReq(), res);
    expect(res.statusCode).toBe(400);
  });

  it('activates the org on checkout.session.completed', async () => {
    constructEventImpl = () => checkoutCompletedEvent;
    const calls = stubFetch();
    const res = mockRes();
    await webhook(mockReq(), res);
    expect(res.statusCode).toBe(200);
    const patch = calls.find(c => c.method === 'PATCH');
    expect(patch.url).toContain('organisations?id=eq.org-1');
    expect(patch.body).toMatchObject({ plan: 'pro', stripe_subscription_status: 'active' });
  });

  // The named "duplicate webhook" scenario — Stripe redelivers the exact
  // same event (its own retry-on-non-2xx-or-timeout behaviour, or an
  // operator manually resending from the dashboard). Processing it twice
  // must land the org in the same state as processing it once, with
  // neither call erroring.
  it('processes a duplicate delivery of the same event idempotently — same end state, no error on either delivery', async () => {
    constructEventImpl = () => checkoutCompletedEvent;
    const calls = stubFetch();
    const first = mockRes();
    await webhook(mockReq(), first);
    const second = mockRes();
    await webhook(mockReq(), second);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const patches = calls.filter(c => c.method === 'PATCH');
    expect(patches).toHaveLength(2);
    expect(patches[0].body).toEqual(patches[1].body);
  });

  it('downgrades the org to free on subscription cancellation', async () => {
    constructEventImpl = () => ({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } });
    const calls = stubFetch();
    const res = mockRes();
    await webhook(mockReq(), res);
    expect(res.statusCode).toBe(200);
    const patch = calls.find(c => c.method === 'PATCH');
    expect(patch.body).toMatchObject({ plan: 'free', stripe_subscription_status: 'canceled' });
  });

  // Documents a real, found gap rather than asserting it's correct: the
  // handler never inspects the Supabase PATCH response's own ok/status,
  // so a genuinely failed downstream update (this org's row locked, RLS
  // misconfigured, database briefly down) still returns Stripe a 200 —
  // meaning Stripe will NOT retry, and the org silently never gets
  // upgraded. Recorded here so a future fix has a test to turn green,
  // and so this doesn't quietly regress further unnoticed.
  it('[KNOWN GAP] currently returns 200 to Stripe even when the downstream Supabase update itself fails, so Stripe never retries a failed activation', async () => {
    constructEventImpl = () => checkoutCompletedEvent;
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'db unavailable' }), text: () => Promise.resolve('db unavailable') }));
    const res = mockRes();
    await webhook(mockReq(), res);
    expect(res.statusCode).toBe(200);
  });
});
