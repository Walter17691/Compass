import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyDocument } from './_notify-document.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ members = [{ role: 'line_manager' }], rateLimitOk = true, account = null, email = 'sam@acme.com' } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
    if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    if (u.includes('/rest/v1/org_members')) return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    if (u.includes('/rest/v1/employee_portal_accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(account ? [account] : []) });
    if (u.includes('/auth/v1/admin/users/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ email }) });
    if (u.includes('api.resend.com')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = () => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { orgId: 'org-1', orgName: 'Acme', employeeName: 'Sam Employee', documentType: 'Meeting record' } });

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.12, MEDIUM) — had no
// rate limit at all, unlike every other authenticated email-sending endpoint.
describe('portal notify-document — rate limiting (Prompt 11 audit, 2.12)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ rateLimitOk: false });
    const res = mockRes();
    await notifyDocument(req(), res);
    expect(res.statusCode).toBe(429);
  });

  it('still succeeds (as a no-op) within the rate limit when the employee has no portal account', async () => {
    stubFetch({ rateLimitOk: true, account: null });
    const res = mockRes();
    await notifyDocument(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.notified).toBe(false);
  });
});
