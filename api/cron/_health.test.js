import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { health } from './_health.js';

// Phase 7 (Controlled Beta Infrastructure Gate 6) — the health endpoint
// must never leak a secret value, must report an accurate ok/not-ok
// verdict driven by real database reachability + critical-config
// presence, and must not require any auth (it's meant to be pollable by
// an external uptime monitor with nothing but the URL).
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

describe('health', () => {
  let originalFetch;
  let originalEnv;
  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = { ...process.env };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('reports ok:true with a 200 when the database is reachable and critical config is present', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.CRON_SECRET = 'test-secret';
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'org-a' }]) }));

    const res = mockRes();
    await health({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.database.ok).toBe(true);
    expect(typeof res.body.database.latencyMs).toBe('number');
    expect(res.body.missingCritical).toEqual([]);
  });

  it('reports ok:false with a 503 when the database is unreachable', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.CRON_SECRET = 'test-secret';
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'internal detail' }) }));

    const res = mockRes();
    await health({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.database.ok).toBe(false);
  });

  it('reports ok:false with a 503 when a network error is thrown, without leaking the error itself', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.CRON_SECRET = 'test-secret';
    global.fetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED at 10.0.0.5:5432 — internal network detail')));

    const res = mockRes();
    await health({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body.ok).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('flags missing critical config even when the database is reachable', async () => {
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.CRON_SECRET;
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

    const res = mockRes();
    await health({}, res);

    expect(res.body.ok).toBe(false);
    expect(res.body.missingCritical).toContain('SUPABASE_SERVICE_KEY');
    expect(res.body.missingCritical).toContain('CRON_SECRET');
  });

  it('reports config presence as booleans only, never the actual values', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'a-real-secret-value-that-must-never-appear';
    process.env.CRON_SECRET = 'test-secret';
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

    const res = mockRes();
    await health({}, res);

    expect(typeof res.body.config.SUPABASE_SERVICE_KEY).toBe('boolean');
    expect(JSON.stringify(res.body)).not.toContain('a-real-secret-value-that-must-never-appear');
  });
});
