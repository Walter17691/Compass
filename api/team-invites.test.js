import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './team-invites.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({
  authOk = true, authUser = { id: 'hr-1', email: 'hr@acme.com' }, members = [{ role: 'hr_manager', name: 'HR Person' }],
  invites = [{ id: 'inv-1', name: 'Sam', email: 'sam@acme.com', intended_role: 'auditor', intended_location_ids: [], created_at: '2026-09-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', status: 'pending', org_id: 'org-1' }],
  organisations = [{ name: 'Acme' }], emailOk = true, rateLimitOk = true,
} = {}) {
  const calls = [];
  const emailCalls = [];
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
    if (u.includes('/rest/v1/team_invites') && (!options?.method || options.method === 'GET')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(invites) });
    }
    if (u.includes('/rest/v1/team_invites') && options?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (u.includes('/rest/v1/team_invites') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'inv-2' }]) });
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
  return { calls, emailCalls };
}

describe('team-invites — GET list, authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { orgId: 'org-1' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-HR caller', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { orgId: 'org-1' } }, res);
    expect(res.statusCode).toBe(403);
  });

  it('lists pending invitations for an HR caller with role labels', async () => {
    stubFetch();
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { orgId: 'org-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.invites).toHaveLength(1);
    expect(res.body.invites[0].roleLabel).toBe('Auditor (read-only)');
  });

  it('flags an expired invitation', async () => {
    stubFetch({ invites: [{ id: 'inv-1', name: 'Sam', email: 'sam@acme.com', intended_role: 'auditor', intended_location_ids: [], created_at: '2020-01-01T00:00:00.000Z', expires_at: '2020-01-08T00:00:00.000Z', status: 'pending' }] });
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { orgId: 'org-1' } }, res);
    expect(res.body.invites[0].expired).toBe(true);
  });
});

describe('team-invites — revoke', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const req = (b = {}) => ({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action: 'revoke', orgId: 'org-1', inviteId: 'inv-1', ...b } });

  it('rejects a non-HR caller', async () => {
    stubFetch({ members: [{ role: 'investigator' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('revokes a pending invitation', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    const patchCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'PATCH');
    expect(patchCall.body.status).toBe('revoked');
  });

  it('records a "Team invitation revoked" audit event', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    const auditCall = calls.find(c => c.url.includes('/rest/v1/audit_log'));
    expect(auditCall.body.action).toBe('Team invitation revoked');
  });

  it('404s for an invitation that does not exist', async () => {
    stubFetch({ invites: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects revoking an invitation that is no longer pending', async () => {
    stubFetch({ invites: [{ id: 'inv-1', name: 'Sam', email: 'sam@acme.com', intended_role: 'auditor', status: 'accepted' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(409);
  });
});

describe('team-invites — resend (rotate token)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const req = (b = {}) => ({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action: 'resend', orgId: 'org-1', inviteId: 'inv-1', ...b } });

  it('rejects a non-HR caller', async () => {
    stubFetch({ members: [{ role: 'legal_reviewer' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('revokes the old invitation and creates a new one with a fresh token', async () => {
    const { calls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    const patchCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'PATCH');
    expect(patchCall.body.status).toBe('revoked');
    const createCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'POST');
    expect(createCall.body.token_hash).toBeTruthy();
    // The raw token must never reach team_invites — only its hash.
    expect(createCall.body.token).toBeUndefined();
  });

  it('sends a new email with the rotated token', async () => {
    const { emailCalls } = stubFetch();
    const res = mockRes();
    await handler(req(), res);
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0].html).toMatch(/\?teamInvite=/);
  });

  it('preserves the original intended role and locations on the rotated invitation', async () => {
    const { calls } = stubFetch({ invites: [{ id: 'inv-1', name: 'Sam', email: 'sam@acme.com', intended_role: 'location_manager', intended_location_ids: ['loc-9'], status: 'pending' }] });
    const res = mockRes();
    await handler(req(), res);
    const createCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'POST');
    expect(createCall.body.intended_role).toBe('location_manager');
    expect(createCall.body.intended_location_ids).toEqual(['loc-9']);
  });

  it('deletes the newly-created row and does not leave an ambiguous state if the resend email fails', async () => {
    const { calls } = stubFetch({ emailOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(500);
    const deleteCall = calls.find(c => c.url.includes('/rest/v1/team_invites') && c.method === 'DELETE');
    expect(deleteCall).toBeTruthy();
  });

  it('respects the rate limit', async () => {
    stubFetch({ rateLimitOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(429);
  });
});

describe('team-invites — validation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unknown action', async () => {
    stubFetch();
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action: 'delete-forever', orgId: 'org-1', inviteId: 'inv-1' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('requires orgId and inviteId', async () => {
    stubFetch();
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action: 'revoke' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
