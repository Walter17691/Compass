import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { oauthCallback } from './_oauth-callback.js';
import { signState } from './_state.js';

function mockRes() {
  const res = { statusCode: null, redirectedTo: null, headers: {} };
  res.setHeader = () => {};
  res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; };
  return res;
}

function buildReq({ code = 'auth-code', nonce = 'real-nonce' } = {}) {
  const payload = { orgId: 'org-1', userId: 'user-1', nonce, expiresAt: Date.now() + 600000 };
  const state = signState(payload);
  return {
    query: { code, state },
    headers: { cookie: `calendar_oauth_nonce=${nonce}` },
  };
}

function stubFetch({ tokenData = {} } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return Promise.resolve({ ok: !!tokenData.access_token && !tokenData.error, json: () => Promise.resolve(tokenData) });
    }
    if (u.includes('/rest/v1/integration_events')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (u.includes('/rest/v1/calendar_connections')) return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.11, MEDIUM) — a
// provider can return a genuinely live access_token with no refresh_token
// (e.g. a user who'd already granted access once before, so no re-consent
// prompt fired). This used to log that token verbatim.
describe('calendar oauth-callback — never logs a live access_token (Prompt 11 audit, 2.11)', () => {
  let originalFetch, originalConsoleError;
  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    vi.stubEnv('CALENDAR_STATE_SECRET', 'test-secret');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  });
  afterEach(() => { global.fetch = originalFetch; console.error = originalConsoleError; vi.unstubAllEnvs(); });

  it('redacts the token when the exchange succeeds but no refresh_token is returned', async () => {
    stubFetch({ tokenData: { access_token: 'ya29.live-secret-token', scope: 'calendar' } });
    const logCalls = [];
    console.error = (...args) => logCalls.push(args);

    const res = mockRes();
    await oauthCallback(buildReq(), res);

    expect(res.redirectedTo).toContain('calendar=error');
    const loggedText = JSON.stringify(logCalls);
    expect(loggedText).not.toContain('ya29.live-secret-token');
    expect(loggedText).toContain('[redacted]');
  });

  it('redacts the token when the exchange fails outright with an error payload', async () => {
    stubFetch({ tokenData: { error: 'invalid_grant', access_token: 'should-never-appear-in-logs' } });
    const logCalls = [];
    console.error = (...args) => logCalls.push(args);

    const res = mockRes();
    await oauthCallback(buildReq(), res);

    const loggedText = JSON.stringify(logCalls);
    expect(loggedText).not.toContain('should-never-appear-in-logs');
    expect(loggedText).toContain('invalid_grant');
  });
});
