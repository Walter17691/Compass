import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acceptTeamInvite as handler } from './_accept-team-invite.js';
import { hashTeamInviteToken } from '../_teamInviteToken.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({
  authOk = true, authUser = { id: 'user-1', email: 'invited@acme.com' },
  invite = { name: 'Sam Invitee', email: 'invited@acme.com', intended_role: 'hr_manager', status: 'pending', expires_at: '2099-01-01T00:00:00.000Z', org_id: 'org-1', created_by: 'inviter-1' },
  organisations = [{ name: 'Acme' }],
  orgMembers = [{ name: 'Pat Inviter' }],
  rpcOk = true, rpcResult = [{ org_id: 'org-1', org_name: 'Acme', role: 'hr_manager' }], rpcError = null,
} = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options) => {
    const u = String(url);
    calls.push({ url: u, method: options?.method || 'GET', headers: options?.headers || {}, body: options?.body ? (() => { try { return JSON.parse(options.body); } catch { return options.body; } })() : null });
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
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(orgMembers) });
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

  // NEW-11 remediation — a brand-new invitee has no Compass account yet,
  // so no access token to send. GET must work without one so the
  // activation screen can show who invited them, to what org, and at
  // what role BEFORE they create an account. Only the raw, unguessable
  // token itself gates this — never a caller's identity.
  it('does NOT require authentication for GET — a not-yet-signed-up invitee must be able to preview the invitation', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
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

  // NEW-11 remediation — the activation screen needs enough context to
  // greet a brand-new invitee by name and tell them who invited them,
  // before any account exists.
  it('includes the invited name, inviter name, and expiry for the activation screen', async () => {
    stubFetch();
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.body.invitedName).toBe('Sam Invitee');
    expect(res.body.inviterName).toBe('Pat Inviter');
    expect(res.body.expiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('omits the inviter name gracefully rather than failing, if the inviter has no org_members row', async () => {
    stubFetch({ orgMembers: [] });
    const res = mockRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.inviterName).toBeNull();
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

  // P1 fix (2026-09-12) — a real production accept attempt failed with
  // "Not authenticated" from accept_team_invite() itself. Root cause,
  // proven directly against the database: auth.uid() reads the JWT's own
  // 'sub' claim, and this endpoint was authenticating its RPC call as the
  // SERVICE ROLE (no 'sub' claim — auth.uid() IS NULL for any
  // service-role-authenticated request), not as the calling user. The
  // RPC's own first check (`if auth.uid() is null then raise exception
  // 'Not authenticated'`) was therefore unconditionally true regardless
  // of who actually called this endpoint — no one could ever accept an
  // invitation. This asserts the RPC call is authenticated as the real
  // caller (their own bearer token as Authorization, the public anon key
  // as apikey) — never the service-role key — so auth.uid()/auth.jwt()
  // inside the SECURITY DEFINER function resolve to the real user.
  it('authenticates the RPC call as the real calling user, never as the service role', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req({ headers: { authorization: 'Bearer callers-own-access-token' } }), res);
    const rpcCall = calls.find(c => c.url.includes('rpc/accept_team_invite'));
    // The exact bug: this must be the caller's own token, never the
    // service key (which would make auth.uid() resolve to null).
    expect(rpcCall.headers.Authorization).toBe('Bearer callers-own-access-token');
    // apikey must be the public anon key — the standard pairing for an
    // authenticated-as-user PostgREST call, matching api/_auth.js's own
    // callerCaseVisible() convention.
    expect(rpcCall.headers.apikey).toMatch(/^eyJ/);
    expect(rpcCall.headers.apikey).not.toBe(rpcCall.headers.Authorization.replace('Bearer ', ''));
  });

  // Final pre-deployment gate — a direct, tampered request is the actual
  // threat model here: the locked email field on the activation screen is
  // a UX nicety, not a security boundary. Proves an attacker who crafts
  // their own POST body (bypassing the UI entirely) cannot smuggle a
  // different email, role, location, or org through to the RPC — the
  // handler only ever reads req.body.token and forwards its hash; every
  // other field the request might contain is silently ignored, and the
  // intended role/locations/org actually granted come exclusively from
  // the DB row the token itself resolves to, never from the request.
  it('ignores every attacker-supplied field beyond the token — role, email, org, and location cannot be smuggled through the request body', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req({
      body: {
        token: 'the-raw-token',
        email: 'attacker@evil.com',
        p_verified_email: 'attacker@evil.com',
        intended_role: 'hr_director',
        role: 'hr_director',
        intended_location_ids: ['loc-attacker'],
        org_id: 'org-attacker',
        user_id: 'attacker-id',
      },
    }), res);
    const rpcCall = calls.find(c => c.url.includes('rpc/accept_team_invite'));
    expect(Object.keys(rpcCall.body)).toEqual(['p_token_hash']);
    expect(rpcCall.body.p_token_hash).toBe(hashTeamInviteToken('the-raw-token'));
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
