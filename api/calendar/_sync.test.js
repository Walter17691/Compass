import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sync } from './_sync.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const FAR_FUTURE = new Date(Date.now() + 3600000).toISOString();
const PAST = new Date(Date.now() - 3600000).toISOString();

// Defect #1 remediation — tokenRefresh lets a test force the connection
// into its expired branch (getValidAccessToken only calls Google's token
// endpoint at all once expires_at is in the past — FAR_FUTURE above never
// exercises this path) and control exactly what that endpoint returns,
// so the sync/error-classification behaviour can be tested without a
// real Google account.
function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connections = [{ id: 'conn-1', org_id: 'org-1', provider: 'google', access_token: 'tok', expires_at: FAR_FUTURE }], syncedEvents = [], tokenRefresh = null, calendarApi = null } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    let parsedBody = null;
    if (options.body) { try { parsedBody = JSON.parse(options.body); } catch { parsedBody = options.body; } }
    calls.push({ url: u, method: options.method, body: parsedBody });
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
    if (u.includes('oauth2.googleapis.com/token')) {
      if (tokenRefresh) return Promise.resolve(tokenRefresh);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'new-tok', expires_in: 3600 }) });
    }
    if (u.startsWith('https://www.googleapis.com/')) {
      if (calendarApi) return Promise.resolve(calendarApi);
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

// Defect #1 remediation — the actual production repro (invalid_grant from
// a revoked/expired refresh token) and its neighbours: a real 500 crash
// with a raw provider payload leaking to the client must never happen
// again, and a transient provider failure must never be classified the
// same way as a genuinely invalid credential.
describe('calendar sync — error classification and sanitization (Defect #1)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const expiredConnection = [{ id: 'conn-1', org_id: 'org-1', provider: 'google', access_token: 'stale-tok', refresh_token: 'revoked-refresh', expires_at: PAST }];

  it('C. invalid_grant on token refresh: sanitized 409, reconnect-required code, no raw provider text', async () => {
    stubFetch({
      connections: expiredConnection,
      tokenRefresh: { ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) },
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ ok: false, error: { code: 'CALENDAR_RECONNECT_REQUIRED', message: 'Google Calendar needs to be reconnected.' } });
    expect(JSON.stringify(res.body)).not.toContain('invalid_grant');
    expect(JSON.stringify(res.body)).not.toContain('revoked-refresh');
  });

  it('logs CALENDAR_RECONNECT_REQUIRED to integration_events on invalid_grant, never the raw refresh token', async () => {
    const calls = stubFetch({
      connections: expiredConnection,
      tokenRefresh: { ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) },
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    const eventCall = calls.find(c => c.url.includes('integration_events') && c.method === 'POST');
    expect(eventCall.body).toMatchObject({ org_id: 'org-1', provider: 'google_calendar', event_type: 'sync', status: 'error', detail: 'CALENDAR_RECONNECT_REQUIRED' });
    expect(JSON.stringify(eventCall.body)).not.toContain('revoked-refresh');
  });

  it('D/invalid_client. another Google credential-invalid code is also classified as reconnect-required', async () => {
    stubFetch({
      connections: expiredConnection,
      tokenRefresh: { ok: false, status: 401, json: () => Promise.resolve({ error: 'invalid_client' }) },
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('CALENDAR_RECONNECT_REQUIRED');
  });

  it('F/G. Google 429/5xx on token refresh is a temporary failure, not reconnect-required', async () => {
    stubFetch({
      connections: expiredConnection,
      tokenRefresh: { ok: false, status: 429, json: () => Promise.resolve({ error: 'rate_limit_exceeded' }) },
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: { code: 'CALENDAR_SYNC_UNAVAILABLE', message: 'Google Calendar sync is temporarily unavailable. Please try again shortly.' } });
    expect(JSON.stringify(res.body)).not.toContain('rate_limit_exceeded');
  });

  it('H. a network failure during token refresh is a temporary failure, not reconnect-required, and does not crash', async () => {
    stubFetch({ connections: expiredConnection });
    const withoutNetwork = global.fetch;
    global.fetch = vi.fn((url, options) => {
      if (String(url).includes('oauth2.googleapis.com/token')) return Promise.reject(new Error('fetch failed: ECONNRESET'));
      return withoutNetwork(url, options);
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error.code).toBe('CALENDAR_SYNC_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('ECONNRESET');
  });

  it('I. a malformed (non-JSON) Google response does not crash and is treated as temporary', async () => {
    stubFetch({
      connections: expiredConnection,
      tokenRefresh: { ok: false, status: 500, json: () => Promise.reject(new SyntaxError('Unexpected token in JSON')) },
    });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error.code).toBe('CALENDAR_SYNC_UNAVAILABLE');
  });

  it('B. a healthy token (not yet expired) never calls the Google token endpoint at all', async () => {
    const calls = stubFetch(); // default connections use FAR_FUTURE expiry
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    expect(calls.some(c => c.url.includes('oauth2.googleapis.com/token'))).toBe(false);
  });

  it('a successful sync after refreshing an expired token logs success, not an error', async () => {
    const calls = stubFetch({ connections: expiredConnection });
    const res = mockRes();
    await sync(req({ deadlines: [], orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    const eventCall = calls.find(c => c.url.includes('integration_events') && c.method === 'POST');
    expect(eventCall.body).toMatchObject({ status: 'success' });
  });
});
