import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './send-for-signature.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (High, security review) — email relay security
// (Prompt 5, part 3). Auth/org-membership/rate-limit were already fixed;
// this file adds the regression coverage the review brief specifically
// asks for: unauthorised send attempts, and a forged "signing host" never
// making it into the actual outgoing email regardless of what the caller
// puts in the request body.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], emailOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, options });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('api.resend.com')) {
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const body = { employeeEmail: 'sam@acme.com', employeeName: 'Sam', managerName: 'Alex', meetingType: 'Disciplinary', signId: 'sign-123', orgId: 'org-1' };
const req = (b = body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: b });

describe('send-for-signature — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the claimed org (cross-tenant send attempt)', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('sends successfully for a real org member', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Phase 6.5 hardening (production regression suite, integrations) —
  // "failed send": Resend itself rejects the request (bad address,
  // account issue, provider outage) — this must surface as a real error
  // response, not a false { success: true }, since a signing request that
  // silently never reached the employee is worse than an obvious failure.
  it('surfaces a genuine error, not a false success, when the email provider rejects the send', async () => {
    stubFetch({ members: [{ role: 'line_manager' }], emailOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('send failed');
  });
});

describe('send-for-signature — signing host is never caller-controlled', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('ignores a forged appUrl in the request body — the outgoing email always links to the real, hardcoded app host', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, appUrl: 'https://attacker-controlled.example.com' }), res);
    expect(res.statusCode).toBe(200);

    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.html).toContain('https://compass-lemon-iota.vercel.app/sign/sign-123');
    expect(payload.html).not.toContain('attacker-controlled.example.com');
  });
});
