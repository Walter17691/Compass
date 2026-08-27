import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reassignNotify } from './_reassign-notify.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ callerMember = { name: 'HR Person' }, recipientMember = { name: 'New Owner' }, rateLimitOk = true, email = 'newowner@acme.com' } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
    if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    if (u.includes('/rest/v1/org_members') && u.includes('user_id=eq.user-1')) return Promise.resolve({ ok: true, json: () => Promise.resolve(callerMember ? [callerMember] : []) });
    if (u.includes('/rest/v1/org_members')) return Promise.resolve({ ok: true, json: () => Promise.resolve(recipientMember ? [recipientMember] : []) });
    if (u.includes('/auth/v1/admin/users/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ email }) });
    if (u.includes('api.resend.com')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = () => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { orgId: 'org-1', orgName: 'Acme', newOwnerId: 'owner-2', newOwnerName: 'New Owner', employeeName: 'Sam Employee', caseType: 'Grievance' } });

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.12, MEDIUM) — had no
// rate limit at all, unlike every other authenticated email-sending endpoint.
describe('reassign-notify — rate limiting (Prompt 11 audit, 2.12)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ rateLimitOk: false });
    const res = mockRes();
    await reassignNotify(req(), res);
    expect(res.statusCode).toBe(429);
  });

  it('still succeeds within the rate limit', async () => {
    stubFetch({ rateLimitOk: true });
    const res = mockRes();
    await reassignNotify(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
