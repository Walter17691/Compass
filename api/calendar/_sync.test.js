import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sync } from './_sync.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const FAR_FUTURE = new Date(Date.now() + 3600000).toISOString();

function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connections = [{ id: 'conn-1', org_id: 'org-1', provider: 'google', access_token: 'tok', expires_at: FAR_FUTURE }], syncedEvents = [] } = {}) {
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connections) });
    }
    if (u.includes('/rest/v1/integration_events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (u.startsWith('https://www.googleapis.com/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'google-evt-1' }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body });

// Phase 6.5 hardening (Prompt 16 audit, closes finding C3, CRITICAL) —
// the highest-stakes instance of this finding: syncing deadlines while
// working in Org A used to look the connection up by user_id alone, so
// a multi-org user could have Org A's confidential meeting/deadline
// titles pushed to a calendar actually connected under Org B, logged
// under Org B's own org_id. No test file existed for this endpoint
// before this fix.
describe('calendar sync — org-scoped (closes C3)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400s when orgId is missing', async () => {
    stubFetch();
    const res = mockRes();
    await sync(req({ deadlines: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('403s a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('404s when this org has no calendar connection, even if the user has one for a different org', async () => {
    stubFetch({ connections: [] });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('scopes the connection lookup to the calling org, not just the caller\'s user_id — the exact leak this fix closes', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    const connCall = calls.find(c => c.url.includes('calendar_connections'));
    expect(connCall.url).toContain('org_id=eq.org-1');
    expect(connCall.url).toContain('user_id=eq.user-1');
  });
});
