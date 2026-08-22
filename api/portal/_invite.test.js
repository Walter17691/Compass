import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invite } from './_invite.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening — portal invite role authorization (Prompt 3, part
// B). _invite.js already routes through requireOrgRole(..., isHrRole)
// (api/_auth.js), tested at the helper level in api/_auth.test.js — this
// file tests the actual endpoint end-to-end: a real, org-member-but-non-HR
// caller must be rejected, and a real HR caller must succeed.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], insertOk = true, emailOk = true, rateLimitOk = true } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('check_rate_limit')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/employee_portal_invites')) {
      return Promise.resolve({ ok: insertOk, text: () => Promise.resolve(insertOk ? '' : 'insert failed') });
    }
    if (u.includes('api.resend.com')) {
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const body = { orgId: 'org-1', orgName: 'Acme', employeeName: 'Sam Employee', email: 'sam@acme.com' };
const req = (b = body) => ({ headers: { authorization: 'Bearer good' }, method: 'POST', body: b });

describe('portal invite — role authorization', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a real org member who does not hold an HR role', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a location_manager — org membership alone is not enough', async () => {
    stubFetch({ members: [{ role: 'location_manager' }] });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a caller who is not even a member of the org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('allows an hr_manager to send a portal invite', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows an hr_director to send a portal invite', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(200);
  });

  it('400s when required fields are missing, before any auth check', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await invite(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], rateLimitOk: false });
    const res = mockRes();
    await invite(req(), res);
    expect(res.statusCode).toBe(429);
  });
});
