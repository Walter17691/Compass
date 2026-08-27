import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { status } from './_status.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connections = [] } = {}) {
  const calls = [];
  global.fetch = vi.fn((url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve({ id: 'user-1', email: 'hr@acme.com' }) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/calendar_connections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connections) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (query) => ({ method: 'GET', headers: { authorization: 'Bearer good' }, query });

// Phase 6.5 hardening (Prompt 16 audit, closes finding C3, CRITICAL) —
// was scoped by user_id alone, so a multi-org user saw "connected" (and
// which provider) for a DIFFERENT org's connection while working in an
// org with no connection at all. No test file existed for this endpoint
// before this fix.
describe('calendar status — org-scoped (closes C3)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await status(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400s when orgId is missing', async () => {
    stubFetch();
    const res = mockRes();
    await status(req({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('403s a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await status(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('reports not connected when this org has no connection, even if the user has one for a different org', async () => {
    // The stub can't simulate a real filtered query, but the URL
    // assertion below proves the request is genuinely scoped — a
    // different org's connection would never even reach this response.
    stubFetch({ connections: [] });
    const res = mockRes();
    await status(req({ orgId: 'org-1' }), res);
    expect(res.body).toEqual({ connected: false, provider: null });
  });

  it('scopes the connection lookup by org_id, not just user_id', async () => {
    const calls = stubFetch({ connections: [{ provider: 'google' }] });
    const res = mockRes();
    await status(req({ orgId: 'org-1' }), res);
    expect(res.body).toEqual({ connected: true, provider: 'google' });
    const connCall = calls.find(u => u.includes('calendar_connections'));
    expect(connCall).toContain('org_id=eq.org-1');
    expect(connCall).toContain('user_id=eq.user-1');
  });
});
