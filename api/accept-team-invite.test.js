import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './accept-team-invite.js';
import { hashTeamInviteToken } from './_teamInviteToken.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({
  authOk = true, authUser = { id: 'user-1', email: 'invited@acme.com' },
  invite = { email: 'invited@acme.com', intended_role: 'hr_manager', status: 'pending', expires_at: '2099-01-01T00:00:00.000Z', org_id: 'org-1' },
  organisations = [{ name: 'Acme' }],
  rpcOk = true, rpcResult = [{ org_id: 'org-1', org_name: 'Acme', role: 'hr_manager' }], rpcError = null,
} = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options) => {
    const u = String(url);
    calls.push({ url: u, method: options?.method || 'GET', body: options?.body ? (() => { try { return JSON.parse(options.body); } catch { return options.body; } })() : null });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/rpc/accept_team_invite')) {
      return Promise.resolve({ ok: rpcOk, json: () => Promise.resolve(rpcOk ? rpcResult : { message: rpcError }) });
    }
    if (u.includes('/rest/v1/team_invites')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(invite ? [invite] : []) });
    }
    if (u.includes('/rest/v1/organisations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(organisations) });
    }
    if (u.includes('/rest/v1/audit_log')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return { calls };
}

const req = (overrides = {}) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { token: 'the-raw-token' }, query: { token: 'the-raw-token' }, ...overrides });

describe('accept-team-invite — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller on GET', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unauthenticated caller on POST', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('requires a token', async () => {
    stubFetch();
    const res = mockRes();
    await handler(req({ body: {}, query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('accept-team-invite — GET status', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns org name, invited email and role label for a pending invite', async () => {
    stubFetch();
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.orgName).toBe('Acme');
    expect(res.body.invitedEmail).toBe('invited@acme.com');
    expect(res.body.roleLabel).toBe('HR Manager');
    expect(res.body.status).toBe('pending');
  });

  it('reports an expired invitation even though its DB status is still "pending"', async () => {
    stubFetch({ invite: { email: 'invited@acme.com', intended_role: 'hr_manager', status: 'pending', expires_at: '2020-01-01T00:00:00.000Z', org_id: 'org-1' } });
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.status).toBe('expired');
  });

  it('404s for an unknown token', async () => {
    stubFetch({ invite: null });
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('looks up the invitation by the HASH of the token, never the raw value', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    const lookupCall = calls.find(c => c.url.includes('/rest/v1/team_invites'));
    expect(lookupCall.url).toContain(hashTeamInviteToken('the-raw-token'));
    expect(lookupCall.url).not.toContain('the-raw-token');
  });
});

// Final security gate — the SQL function now derives the caller's
// verified email itself from the session's own JWT (auth.jwt()->>'email'),
// so this endpoint no longer looks it up via the auth admin API or passes
// it as an RPC argument — there is nothing left for a direct RPC caller
// to lie about. Only the token's hash is ever sent.
describe('accept-team-invite — POST acceptance, identity derived server-side', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('accepts successfully when the RPC reports success', async () => {
    stubFetch();
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.role).toBe('hr_manager');
  });

  it('sends only the token hash to the RPC — no email parameter of any kind', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    const rpcCall = calls.find(c => c.url.includes('rpc/accept_team_invite'));
    expect(rpcCall.body.p_token_hash).toBe(hashTeamInviteToken('the-raw-token'));
    expect(rpcCall.body.p_verified_email).toBeUndefined();
    expect(JSON.stringify(rpcCall.body)).not.toContain('email');
  });

  it('never sends the raw token anywhere, only its hash', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    calls.forEach(c => {
      expect(JSON.stringify(c.body)).not.toContain('the-raw-token');
      expect(c.url).not.toContain('the-raw-token');
    });
  });

  it('denies when the RPC reports a different email address (enforced server-side, not by this endpoint)', async () => {
    stubFetch({ rpcOk: false, rpcError: 'This invitation was sent to a different email address' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/different email address/);
  });

  it('denies an expired invitation', async () => {
    stubFetch({ rpcOk: false, rpcError: 'This invitation has expired' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('denies a revoked invitation', async () => {
    stubFetch({ rpcOk: false, rpcError: 'This invitation has been revoked' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('denies an already-accepted invitation', async () => {
    stubFetch({ rpcOk: false, rpcError: 'This invitation has already been used' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('denies a malformed/unknown token', async () => {
    stubFetch({ rpcOk: false, rpcError: 'Invitation not found' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('denies when the RPC cannot verify the caller\'s account email', async () => {
    stubFetch({ rpcOk: false, rpcError: 'Could not verify your account email' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('never leaks a raw DB/provider error for an unexpected RPC failure', async () => {
    stubFetch({ rpcOk: false, rpcError: 'relation "team_invites" does not exist' });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(500);
  });

  it('records a "Team invitation accepted" audit event on success', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    const auditCall = calls.find(c => c.url.includes('/rest/v1/audit_log'));
    expect(auditCall).toBeTruthy();
    expect(auditCall.body.action).toBe('Team invitation accepted');
  });
});
