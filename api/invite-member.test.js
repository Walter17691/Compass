import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './invite-member.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], emailOk = true, rateLimitOk = true, organisations = [{ name: 'Acme (real)', invite_code: 'real-code' }] } = {}) {
  const emailCalls = [];
  global.fetch = vi.fn((url, options) => {
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
    if (u.includes('/rest/v1/organisations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(organisations) });
    }
    if (u.includes('api.resend.com')) {
      emailCalls.push(JSON.parse(options.body));
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return emailCalls;
}

// orgName/inviteCode here are the ATTACKER-CONTROLLED values a direct API
// call could set — a real caller's request body has no reason to include
// them any more (the server now looks up the real org row instead), but
// the tests below prove they're ignored even if a caller still sends them.
const body = { email: 'sam@acme.com', name: 'Sam', role: 'line_manager', orgId: 'org-1', orgName: 'Fake Org Inc', inviteCode: 'attacker-supplied-code' };
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

// Phase 6.5 hardening (closes Prompt 16 audit finding H19, HIGH) —
// orgName/inviteCode used to be trusted straight from the request body,
// with no check that they actually belonged to orgId. A caller who's a
// genuine HR manager/director of SOME org (satisfying every check above)
// could still set an arbitrary orgName/inviteCode and use Compass's own
// verified sending domain to deliver fully attacker-controlled content.
describe('invite-member — orgName/inviteCode are looked up server-side, not trusted from the client (Prompt 16 audit, H19)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('uses the real organisation name and invite code, ignoring the attacker-supplied ones in the request body', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }], organisations: [{ name: 'Acme (real)', invite_code: 'real-code' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    const sent = emailCalls[0];
    expect(sent.subject).toContain('Acme (real)');
    expect(sent.subject).not.toContain('Fake Org Inc');
    expect(sent.html).toContain('real-code');
    expect(sent.html).not.toContain('attacker-supplied-code');
  });

  it('404s when orgId does not match a real organisation', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], organisations: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(404);
  });
});
