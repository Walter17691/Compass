import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './chat.js';

function mockRes() {
  const res = { statusCode: null, body: null, headers: {}, streamedChunks: [], ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.write = (chunk) => { res.streamedChunks.push(chunk); };
  res.end = () => { res.ended = true; return res; };
  return res;
}

// Phase 6.5 hardening (Prompt 14, Section 7 — closes independent audit
// finding 2.2, "api/chat.js is an unmetered, unconstrained proxy to
// Anthropic on Compass's own API key, and has zero test coverage"). Covers
// the auth/rate-limit gates that already existed, and the model/max_tokens
// validation added alongside these tests to close the actual "unconstrained
// cost" gap — an authenticated caller could previously set an arbitrary
// model or max_tokens on Compass's own Anthropic key.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, rateLimitOk = true, anthropicOk = true, anthropicBody = { content: [{ type: 'text', text: 'hi' }] } } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method, body: options.body });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('check_rate_limit')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    }
    if (u.includes('api.anthropic.com')) {
      return Promise.resolve({ ok: anthropicOk, status: anthropicOk ? 200 : 500, json: () => Promise.resolve(anthropicBody) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

function req({ method = 'POST', headers = { authorization: 'Bearer tok' }, body = {} } = {}) {
  return { method, headers, body };
}

describe('api/chat', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const validBody = { model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: 'hi' }] };

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller over the rate limit', async () => {
    stubFetch({ rateLimitOk: false });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(429);
  });

  it('rejects a non-allow-listed model', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await handler(req({ body: { ...validBody, model: 'some-other-model' } }), res);
    expect(res.statusCode).toBe(400);
    expect(calls.some(c => c.url.includes('api.anthropic.com'))).toBe(false);
  });

  it('rejects max_tokens above the ceiling', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await handler(req({ body: { ...validBody, max_tokens: 100000 } }), res);
    expect(res.statusCode).toBe(400);
    expect(calls.some(c => c.url.includes('api.anthropic.com'))).toBe(false);
  });

  it('rejects a non-integer or non-positive max_tokens', async () => {
    stubFetch();
    for (const bad of [0, -5, 1.5, 'lots', undefined]) {
      const res = mockRes();
      await handler(req({ body: { ...validBody, max_tokens: bad } }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('forwards a valid request to Anthropic and returns the response', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ content: [{ type: 'text', text: 'hi' }] });
    const anthropicCall = calls.find(c => c.url.includes('api.anthropic.com'));
    expect(anthropicCall).toBeTruthy();
    expect(JSON.parse(anthropicCall.body).model).toBe('claude-sonnet-4-6');
  });

  it('rejects a non-POST, non-OPTIONS method', async () => {
    stubFetch();
    const res = mockRes();
    await handler(req({ method: 'GET', body: validBody }), res);
    expect(res.statusCode).toBe(405);
  });

  it('responds to a CORS preflight without requiring auth', async () => {
    const res = mockRes();
    await handler(req({ method: 'OPTIONS', headers: {} }), res);
    expect(res.statusCode).toBe(200);
  });
});
