import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './invite-member.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], emailOk = true, rateLimitOk = true } = {}) {
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
    if (u.includes('api.resend.com')) {
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const body = { email: 'sam@acme.com', name: 'Sam', role: 'line_manager', orgId: 'org-1', orgName: 'Acme', inviteCode: 'abc123' };
const req = (b = body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: b });

describe('invite-member — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a real member who is not HR', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('allows an hr_manager to invite a team member', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ members: [{ role: 'hr_director' }], rateLimitOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(429);
  });
});
