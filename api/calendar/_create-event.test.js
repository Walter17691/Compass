import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEvent } from './_create-event.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body });

const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

// Phase 6.5 hardening (production regression suite, integrations) — the
// real create-a-calendar-event endpoint every meeting-scheduling flow
// goes through. No existing test exercised the actual network path (only
// buildGoogleEvent/buildMicrosoftEvent's pure payload shape) — in
// particular, the multi-connection "one provider fails, another
// succeeds" resilience this handler's own loop is written to support was
// entirely unverified.
function stubFetch({ authOk = true, members = [{ role: 'hr_manager' }], connections = [{ id: 'conn-google', provider: 'google', org_id: 'org-1', expires_at: FAR_FUTURE, access_token: 'tok' }], eventResponses = {} } = {}) {
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
    if (u.includes('/rest/v1/calendar_connections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(connections) });
    }
    if (u.includes('/rest/v1/integration_events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (u.startsWith('https://www.googleapis.com/')) {
      const r = eventResponses.google || { ok: true, json: () => Promise.resolve({ id: 'google-evt-1' }) };
      return Promise.resolve({ text: () => Promise.resolve('google failure body'), ...r });
    }
    if (u.startsWith('https://graph.microsoft.com/')) {
      const r = eventResponses.microsoft || { ok: true, json: () => Promise.resolve({ id: 'ms-evt-1' }) };
      return Promise.resolve({ text: () => Promise.resolve('microsoft failure body'), ...r });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  return calls;
}

const validBody = { title: 'Investigation meeting', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z', orgId: 'org-1' };

describe('createEvent', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a request missing required fields', async () => {
    stubFetch();
    const res = mockRes();
    await createEvent(req({ ...validBody, title: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the caller has no connected calendar', async () => {
    stubFetch({ connections: [] });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(404);
  });

  // Phase 6.5 hardening (Prompt 16 audit, closes finding C3, CRITICAL) —
  // orgId is now required and the caller's real membership in it is
  // verified server-side, not trusted from the client.
  it('400s when orgId is missing entirely', async () => {
    stubFetch();
    const res = mockRes();
    await createEvent(req({ ...validBody, orgId: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it('403s a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(403);
  });

  it('scopes the connection lookup to the calling org, not just the caller\'s user_id — the exact cross-tenant mingling this fix closes', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(200);
    const connCall = calls.find(c => c.url.includes('calendar_connections'));
    expect(connCall.url).toContain('org_id=eq.org-1');
  });

  it('creates the event and returns its id when the single connected calendar succeeds', async () => {
    stubFetch();
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.events).toEqual([{ provider: 'google', eventId: 'google-evt-1' }]);
  });

  // The named "failed calendar event" scenario — one connected calendar
  // fails, but a user with more than one connection still gets their
  // event on whichever one actually succeeded, rather than the whole
  // request failing because of the first provider's problem.
  it('a failed calendar event on one provider does not prevent success on another connected provider', async () => {
    stubFetch({
      connections: [
        { id: 'conn-google', provider: 'google', org_id: 'org-1', expires_at: FAR_FUTURE, access_token: 'tok' },
        { id: 'conn-ms', provider: 'microsoft', org_id: 'org-1', expires_at: FAR_FUTURE, access_token: 'tok' },
      ],
      eventResponses: { google: { ok: false, status: 500 } },
    });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.events).toEqual([{ provider: 'microsoft', eventId: 'ms-evt-1' }]);
  });

  // A 429 from the provider's event-creation endpoint is just another
  // non-ok response as far as this handler is concerned — no special
  // retry exists (or is silently swallowed) here; it's logged and the
  // loop moves on to any other connection, same as any other failure.
  it('treats a 429 from the provider the same as any other failure — logs it, keeps going, still fails cleanly if it was the only connection', async () => {
    stubFetch({ eventResponses: { google: { ok: false, status: 429 } } });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/Couldn't create the event/);
  });

  it('returns 502, not a crash, when every connected calendar fails', async () => {
    stubFetch({
      connections: [
        { id: 'conn-google', provider: 'google', org_id: 'org-1', expires_at: FAR_FUTURE, access_token: 'tok' },
        { id: 'conn-ms', provider: 'microsoft', org_id: 'org-1', expires_at: FAR_FUTURE, access_token: 'tok' },
      ],
      eventResponses: { google: { ok: false, status: 500 }, microsoft: { ok: false, status: 503 } },
    });
    const res = mockRes();
    await createEvent(req(validBody), res);
    expect(res.statusCode).toBe(502);
  });
});
