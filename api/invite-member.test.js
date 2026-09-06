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
// role is included for the same reason (Team Invitations P0 remediation —
// the endpoint no longer reads it at all, see the dedicated test below).
const body = { email: 'sam@acme.com', name: 'Sam', role: 'hr_director', orgId: 'org-1', orgName: 'Fake Org Inc', inviteCode: 'attacker-supplied-code' };
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

// Team Invitations P0 remediation (2026-09) — join_org_with_invite_code
// always assigns location_manager with no locations, regardless of
// anything this endpoint might say. The email must never claim a role or
// location was assigned, never claim expiry/single-use (the shared code
// has neither), and must state the true default-access behaviour instead.
describe('invite-member — truthful email copy (Team Invitations P0)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('never claims a role was assigned, even when the request body supplies one (an attacker-supplied hr_director role has no effect)', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'hr_director' }), res);
    expect(res.statusCode).toBe(200);
    const sent = emailCalls[0];
    expect(sent.html).not.toMatch(/as <strong>/i);
    expect(sent.html).not.toContain('HR Director');
    expect(sent.html).toContain('Location Manager access initially');
  });

  it('never claims expiry or single-use', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).not.toMatch(/expir/i);
    expect(sent.html).not.toMatch(/one-time|single-use|single use/i);
  });

  it('accurately describes the join flow: initial Location Manager access, HR configures final access afterward', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).toContain('Location Manager access initially');
    expect(sent.html).toMatch(/HR team will configure/i);
  });

  it('still works correctly when the request body omits role/locationIds entirely (the real frontend contract)', async () => {
    const minimalBody = { email: body.email, name: body.name, orgId: body.orgId };
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(minimalBody), res);
    expect(res.statusCode).toBe(200);
    expect(emailCalls.length).toBe(1);
  });
});

// Team Invitations P0, final domain correction (2026-09) — the join link
// previously used the auto-generated Vercel project alias
// (compass-lemon-iota.vercel.app), not the branded customer-facing
// domain. Every other from/reply-to address in this codebase's emails
// (notifications@mail.compasshruk.com, hello@compasshruk.com,
// privacy@compasshruk.com) already uses the bare compasshruk.com apex,
// never a www. prefix — this email now matches that convention.
describe('invite-member — canonical Compass domain, not the Vercel alias (Team Invitations P0 domain correction)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('uses the canonical compasshruk.com domain for the join link and code fallback', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }], organisations: [{ name: 'Acme (real)', invite_code: 'real-code' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).toContain('https://compasshruk.com?invite=real-code');
    expect(sent.html).toContain('https://compasshruk.com');
  });

  it('never contains the old unbranded Vercel hostname', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).not.toContain('compass-lemon-iota.vercel.app');
  });

  it('preserves the ?invite= query parameter main.jsx depends on', async () => {
    const emailCalls = stubFetch({ members: [{ role: 'hr_manager' }], organisations: [{ name: 'Acme (real)', invite_code: 'real-code' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).toMatch(/\?invite=real-code/);
  });
});
