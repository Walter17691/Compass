import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inviteMember as handler } from './_invite-member.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({
  authOk = true, authUser = { id: 'user-1' }, members = [], emailOk = true, rateLimitOk = true,
  organisations = [{ name: 'Acme (real)' }], existingPendingInvites = [], locations = [{ id: 'loc-1' }],
  createOk = true,
} = {}) {
  const emailCalls = [];
  const calls = [];
  global.fetch = vi.fn((url, options) => {
    const u = String(url);
    calls.push({ url: u, method: options?.method || 'GET', body: options?.body ? (() => { try { return JSON.parse(options.body); } catch { return options.body; } })() : null });
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
    if (u.includes('/rest/v1/locations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(locations) });
    }
    if (u.includes('/rest/v1/team_invites') && (!options || !options.method || options.method === 'GET')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(existingPendingInvites) });
    }
    if (u.includes('/rest/v1/team_invites') && options?.method === 'POST') {
      return Promise.resolve({ ok: createOk, json: () => Promise.resolve(createOk ? [{ id: 'invite-1' }] : {}), text: () => Promise.resolve('insert failed') });
    }
    if (u.includes('/rest/v1/team_invites') && options?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (u.includes('/rest/v1/audit_log')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (u.includes('api.resend.com')) {
      emailCalls.push(JSON.parse(options.body));
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return { emailCalls, calls };
}

const body = { email: 'sam@acme.com', name: 'Sam', role: 'hr_manager', locationIds: [], orgId: 'org-1' };
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

  it('allows an hr_director to invite a team member', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
  });

  it('rejects once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ members: [{ role: 'hr_director' }], rateLimitOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(429);
  });
});

// NEW-8 remediation — the invitation now carries its own intended access
// level, validated server-side (never trusted purely from a hidden UI
// state), rather than every invitee silently joining as location_manager.
describe('invite-member — intended role validation (NEW-8)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects a missing role', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid role string', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'super_admin' }), res);
    expect(res.statusCode).toBe(400);
  });

  // hr_director must never be reachable through ordinary team invitation,
  // even if an attacker calls this endpoint directly bypassing the UI's
  // own role dropdown (which never offers it).
  it('rejects hr_director as an intended role, even from a caller who is themselves hr_director', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'hr_director' }), res);
    expect(res.statusCode).toBe(400);
  });

  it.each(['hr_manager', 'location_manager', 'line_manager', 'investigator', 'legal_reviewer', 'auditor'])(
    'accepts "%s" as a valid intended role', async (role) => {
      const locationIds = role === 'location_manager' ? ['loc-1'] : [];
      stubFetch({ members: [{ role: 'hr_director' }] });
      const res = mockRes();
      await handler(req({ ...body, role, locationIds }), res);
      expect(res.statusCode).toBe(200);
    }
  );
});

describe('invite-member — Location Manager location requirement (NEW-8)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects a location_manager invitation with zero locations', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'location_manager', locationIds: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a location belonging to a different organisation', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], locations: [] });
    const res = mockRes();
    await handler(req({ ...body, role: 'location_manager', locationIds: ['foreign-loc'] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a location_manager invitation with a valid organisation location', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], locations: [{ id: 'loc-1' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'location_manager', locationIds: ['loc-1'] }), res);
    expect(res.statusCode).toBe(200);
  });

  it('does not require a location for roles that are not location-scoped', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'investigator', locationIds: [] }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('invite-member — duplicate pending invitation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects a second invitation while one is already pending for the same email', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], existingPendingInvites: [{ id: 'existing-invite' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });
});

describe('invite-member — organisation name looked up server-side, not trusted from the client', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('uses the real organisation name, ignoring any attacker-supplied one in the request body', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager' }], organisations: [{ name: 'Acme (real)' }] });
    const res = mockRes();
    await handler(req({ ...body, orgName: 'Fake Org Inc' }), res);
    expect(res.statusCode).toBe(200);
    const sent = emailCalls[0];
    expect(sent.subject).toContain('Acme (real)');
    expect(sent.subject).not.toContain('Fake Org Inc');
  });

  it('404s when orgId does not match a real organisation', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], organisations: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(404);
  });
});

// NEW-8 remediation — the email must now truthfully state the actual
// intended role, and link with a unique per-invitation token rather than
// the org's shared, permanent invite_code.
describe('invite-member — truthful email copy and unique token link', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('states the actual intended role in the email', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, role: 'auditor' }), res);
    const sent = emailCalls[0];
    expect(sent.html).toContain('Auditor');
  });

  it('links with the canonical domain and a ?teamInvite= token, not the shared invite_code', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).toMatch(/https:\/\/compasshruk\.com\?teamInvite=[^"&\s]+/);
    expect(sent.html).not.toContain('invite_code');
    expect(sent.html).not.toContain('compass-lemon-iota.vercel.app');
  });

  // Final security gate — the raw token exists only in the email link;
  // team_invites persists only its SHA-256 hash, so a database-level read
  // (dashboard, backup, support tooling) never discloses a usable
  // credential.
  it('stores only a hash of the token in team_invites, never the raw value the email links to', async () => {
    const { calls, emailCalls } = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    const createCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'POST');
    const rawToken = emailCalls[0].html.match(/\?teamInvite=([^"&\s]+)/)[1];
    expect(createCall.body.token_hash).toBeTruthy();
    expect(createCall.body.token).toBeUndefined();
    expect(JSON.stringify(createCall.body)).not.toContain(decodeURIComponent(rawToken));
  });

  it('states the invitation expires', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    const sent = emailCalls[0];
    expect(sent.html).toMatch(/expir/i);
  });

  // NEW-11 remediation — the email is the invited person's onboarding
  // entry point, so it must tell them who invited them (when known) and,
  // critically, that THEY create their own password — never one the
  // admin set on their behalf.
  it('names the inviting HR admin when their org_members name is known', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager', name: 'Pat HR' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(emailCalls[0].html).toContain('Pat HR');
  });

  it('never mentions a password, temporary password, or invite code — only that the recipient creates their own credentials', async () => {
    const { emailCalls } = stubFetch({ members: [{ role: 'hr_manager', name: 'Pat HR' }] });
    const res = mockRes();
    await handler(req(), res);
    const html = emailCalls[0].html.toLowerCase();
    expect(html).not.toMatch(/temporary password|your password is|invite code|invite_code/);
    expect(html).toMatch(/you'll create your password|sign in/);
  });
});

describe('invite-member — audit trail', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('records a "Team invitation created" audit event with role and email, never the token', async () => {
    const { calls } = stubFetch({ members: [{ role: 'hr_manager', name: 'HR Person' }] });
    const res = mockRes();
    await handler(req(), res);
    const auditCall = calls.find(c => c.url.includes('/rest/v1/audit_log') && c.method === 'POST');
    expect(auditCall).toBeTruthy();
    expect(auditCall.body.action).toBe('Team invitation created');
    expect(auditCall.body.detail).toContain('sam@acme.com');
    expect(auditCall.body.token).toBeUndefined();
    expect(JSON.stringify(auditCall.body)).not.toContain('token');
  });
});

describe('invite-member — email failure does not leave an ambiguous pending invitation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('deletes the just-created invitation row when the email fails to send', async () => {
    const { calls } = stubFetch({ members: [{ role: 'hr_manager' }], emailOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(500);
    const deleteCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'DELETE');
    expect(deleteCall).toBeTruthy();
  });
});
