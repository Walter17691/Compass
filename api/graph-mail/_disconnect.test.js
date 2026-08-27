import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { disconnect } from './_disconnect.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connections = [] } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve({ id: 'user-1', email: 'hr@acme.com' }) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/graph_mail_connections')) {
      if (options.method === 'DELETE') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connections) });
    }
    if (u.includes('/rest/v1/integration_events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body });

// Phase 6.5 hardening (Prompt 16 audit, closes finding C3, CRITICAL) —
// same class of bug as api/calendar/_ms365-disconnect.js: the DELETE
// itself filtered by user_id+provider alone, no org_id — disconnecting
// Outlook for one org deleted every org's connection for this user. No
// test file existed for this endpoint before this fix.
describe('graph-mail (Outlook) disconnect — org-scoped (closes C3)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await disconnect(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400s when orgId is missing', async () => {
    stubFetch();
    const res = mockRes();
    await disconnect(req({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('403s a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await disconnect(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('scopes the DELETE itself by org_id, not just user_id and provider', async () => {
    const calls = stubFetch({ connections: [{ org_id: 'org-1' }] });
    const res = mockRes();
    await disconnect(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    const deleteCall = calls.find(c => c.url.includes('graph_mail_connections') && c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall.url).toContain('org_id=eq.org-1');
    expect(deleteCall.url).toContain('provider=eq.microsoft');
  });
});
