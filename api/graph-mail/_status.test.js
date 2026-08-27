import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { status } from './_status.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = () => {};
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
    if (u.includes('/rest/v1/graph_mail_connections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connections) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (query) => ({ method: 'GET', headers: { authorization: 'Bearer good' }, query });

// Phase 6.5 hardening (Prompt 16 audit, closes finding C3, CRITICAL) —
// same fix as api/calendar/_status.js's sibling test file. No test file
// existed for this endpoint before this fix.
describe('graph-mail (Outlook) status — org-scoped (closes C3)', () => {
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

  it('scopes the connection lookup by org_id, not just user_id', async () => {
    const calls = stubFetch({ connections: [{ mailbox_email: 'hr@acme.com' }] });
    const res = mockRes();
    await status(req({ orgId: 'org-1' }), res);
    expect(res.body).toEqual({ connected: true, mailbox: 'hr@acme.com' });
    const connCall = calls.find(u => u.includes('graph_mail_connections'));
    expect(connCall).toContain('org_id=eq.org-1');
  });
});
