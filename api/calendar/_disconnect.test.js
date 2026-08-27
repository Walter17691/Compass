import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { disconnect } from './_disconnect.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connection = null, syncedEvents = [] } = {}) {
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
    if (u.includes('/rest/v1/calendar_synced_events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(syncedEvents) });
    }
    if (u.includes('/rest/v1/calendar_connections')) {
      if (options.method === 'DELETE') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connection ? [connection] : []) });
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
// the worst half of this finding: disconnecting Google Calendar for one
// org used to delete the connection row by user_id alone, which (once
// the org-scoping upsert fix landed) could only ever match one row
// anyway — but before this fix, a user connected separately to two
// orgs would have had their SECOND org's connect silently overwrite the
// first (see _oauth-callback.js), so this endpoint's own scope mattered
// once that was fixed. No test file existed for this endpoint before.
describe('calendar disconnect — org-scoped (closes C3)', () => {
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

  it('succeeds as a no-op when this org has no connection to disconnect', async () => {
    stubFetch({ connection: null });
    const res = mockRes();
    await disconnect(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('scopes both the lookup and the delete to this org specifically, not every org this user has connected', async () => {
    const calls = stubFetch({ connection: { id: 'conn-1', org_id: 'org-1', access_token: 'tok', refresh_token: 'rtok', expires_at: new Date(Date.now() + 3600000).toISOString() } });
    const res = mockRes();
    await disconnect(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    const lookupCall = calls.find(c => c.url.includes('calendar_connections') && c.method !== 'DELETE');
    expect(lookupCall.url).toContain('org_id=eq.org-1');
    const deleteCall = calls.find(c => c.url.includes('calendar_connections') && c.url.includes('id=eq.conn-1'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall.method).toBe('DELETE');
  });
});
