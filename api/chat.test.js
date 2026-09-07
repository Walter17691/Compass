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

// Release 1.0 UAT remediation (Defects #4/#5) — a revoked/invalid
// ANTHROPIC_API_KEY in production caused Anthropic's raw
// {"type":"error","error":{"type":"authentication_error","message":"API
// key is invalid."}} body to reach the client verbatim, which some
// callers then rendered/persisted as if it were real AI-generated
// content. PROVIDER ERROR != GENERATED CONTENT is the invariant these
// tests exist to lock in — for every upstream failure mode, regardless
// of whether the client requested a stream.
describe('api/chat — safe failure contract (Defect #4/#5 remediation)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const validBody = { model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: 'hi' }] };

  function stubAnthropicFailure({ status, anthropicBody }) {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      if (u.includes('api.anthropic.com')) return Promise.resolve({ ok: false, status, json: () => Promise.resolve(anthropicBody) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  }

  const mandatoryUatCase = { status: 401, anthropicBody: { type: 'error', error: { type: 'authentication_error', message: 'API key is invalid.' } } };

  it('MANDATORY: Anthropic 401 invalid API key never reaches the client as content, and reports a safe structured failure', async () => {
    stubAnthropicFailure(mandatoryUatCase);
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    // The exact raw provider strings must never appear anywhere in the response.
    expect(JSON.stringify(res.body)).not.toMatch(/authentication_error|API key is invalid/);
  });

  it('Anthropic 429 rate limit returns the same safe envelope, not the raw body', async () => {
    stubAnthropicFailure({ status: 429, anthropicBody: { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } } });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: { code: 'AI_UNAVAILABLE', message: 'Compass AI is temporarily unavailable. Please try again shortly.' } });
  });

  it('Anthropic 500/502/503 returns the same safe envelope', async () => {
    for (const status of [500, 502, 503]) {
      stubAnthropicFailure({ status, anthropicBody: { type: 'error', error: { type: 'api_error', message: 'Internal server error' } } });
      const res = mockRes();
      await handler(req({ body: validBody }), res);
      expect(res.statusCode).toBe(502);
      expect(res.body.ok).toBe(false);
    }
  });

  it('an Anthropic error body that is not valid JSON is still handled safely (no crash, no leak)', async () => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      if (u.includes('api.anthropic.com')) return Promise.resolve({ ok: false, status: 401, json: () => Promise.reject(new Error('not json')) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.ok).toBe(false);
  });

  it('network failure reaching Anthropic returns a safe envelope, never the raw error.message', async () => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      if (u.includes('api.anthropic.com')) return Promise.reject(new Error('getaddrinfo ENOTFOUND api.anthropic.com — internal DNS resolver at 10.0.4.2 failed'));
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/ENOTFOUND|10\.0\.4\.2/);
  });

  it('a malformed successful response (200 but unparseable body) is handled safely, not left to throw uncaught', async () => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      if (u.includes('api.anthropic.com')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('Unexpected end of JSON input')) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it('a failed response is never piped through the streaming branch even when the client requested stream:true', async () => {
    stubAnthropicFailure(mandatoryUatCase);
    const res = mockRes();
    await handler(req({ body: { ...validBody, stream: true } }), res);
    // Must be a clean JSON error, not SSE: no chunks written, headers
    // never switched to text/event-stream, a real statusCode/body set.
    expect(res.streamedChunks).toEqual([]);
    expect(res.headers['Content-Type']).not.toBe('text/event-stream');
    expect(res.statusCode).toBe(502);
    expect(res.body.ok).toBe(false);
  });

  it('a successful streaming response is unaffected by the new failure handling', async () => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      if (u.includes('api.anthropic.com')) {
        const encoder = new TextEncoder();
        const chunks = [encoder.encode('data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n')];
        let i = 0;
        return Promise.resolve({
          ok: true, status: 200,
          body: { getReader: () => ({ read: () => Promise.resolve(i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }) }) },
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const res = mockRes();
    await handler(req({ body: { ...validBody, stream: true } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.streamedChunks.join('')).toContain('content_block_delta');
    expect(res.ended).toBe(true);
  });

  it('a successful non-streaming response is unaffected by the new failure handling', async () => {
    const calls = stubFetch();
    const res = mockRes();
    await handler(req({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ content: [{ type: 'text', text: 'hi' }] });
    expect(calls.some(c => c.url.includes('api.anthropic.com'))).toBe(true);
  });
});
