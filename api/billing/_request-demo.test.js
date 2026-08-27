import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestDemo } from './_request-demo.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// requestDemo reads the raw body itself (bodyParser disabled group-wide for
// the Stripe webhook's signature verification) rather than trusting req.body.
function mockReq(bodyObj) {
  const bytes = Buffer.from(JSON.stringify(bodyObj));
  return {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
    on(event, cb) {
      if (event === 'data') cb(bytes);
      if (event === 'end') cb();
      return this;
    },
  };
}

function stubFetch({ member = { name: 'HR Person' }, rateLimitOk = true } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1', email: 'hr@acme.com' }) });
    if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    if (u.includes('/rest/v1/org_members')) return Promise.resolve({ ok: true, json: () => Promise.resolve(member ? [member] : []) });
    if (u.includes('/rest/v1/organisations')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ name: 'Acme' }]) });
    if (u.includes('/rest/v1/locations')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (u.includes('api.resend.com')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.12, MEDIUM) — had no
// rate limit at all, unlike every other authenticated email-sending endpoint.
describe('billing request-demo — rate limiting (Prompt 11 audit, 2.12)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ rateLimitOk: false });
    const res = mockRes();
    await requestDemo(mockReq({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(429);
  });

  it('still succeeds within the rate limit', async () => {
    stubFetch({ rateLimitOk: true });
    const res = mockRes();
    await requestDemo(mockReq({ orgId: 'org-1', phone: '01234', preferredTime: 'Morning' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
