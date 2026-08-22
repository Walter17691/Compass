import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './signing.js';

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

// Phase 6.5 hardening — document signing flow (Prompt 3, part A). The
// create path (no signId in the body) requires real org membership and
// persists org_id on the new row — the load-bearing fix
// signing_requests_org_scope_2026-08-21.sql and api/portal/_signatures.js
// both depend on. The direct sign/view path (by sign_id) is deliberately
// NOT org-scoped by design: the signer is an external, unauthenticated
// party, and the unguessable sign_id itself is the access boundary — see
// this file's own header comment. These tests cover both paths.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], signingRequest = null, insertOk = true, patchOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method, body: options.body });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/signing_requests')) {
      if (options.method === 'POST') {
        return Promise.resolve({ ok: insertOk, text: () => Promise.resolve(insertOk ? '' : 'insert failed') });
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: patchOk, text: () => Promise.resolve(patchOk ? '' : 'update failed'), json: () => Promise.resolve(signingRequest ? [signingRequest] : []) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(signingRequest ? [signingRequest] : []) });
    }
    if (u.includes('api.resend.com')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

describe('api/signing — create (POST, no signId)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const createBody = { document: 'x', employeeEmail: 'sam@acme.com', employeeName: 'Sam', managerName: 'Alex', orgId: 'org-1' };

  it('rejects a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: createBody }, res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects creation with no orgId at all', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    const noOrg = { document: createBody.document, employeeEmail: createBody.employeeEmail, employeeName: createBody.employeeName, managerName: createBody.managerName };
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: noOrg }, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a signing request and persists org_id for a real org member', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: createBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const insert = calls.find(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'POST');
    const payload = JSON.parse(insert.body);
    expect(payload.org_id).toBe('org-1');
  });
});

describe('api/signing — sign/acknowledge/decline (POST with signId)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('404s an unknown sign_id', async () => {
    stubFetch({ signingRequest: null });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 'no-such-id', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects re-actioning an already-signed request', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'signed', expires_at: null } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(409);
  });

  it('rejects an expired signing link', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: '2020-01-01T00:00:00.000Z' } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(409);
  });

  it('accepts a signature on a real, pending, unexpired request — no org membership required (the signer is external)', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, employee_name: 'Sam', manager_email: null } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('api/signing — GET (view by sign_id)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('404s an unknown sign_id', async () => {
    stubFetch({ signingRequest: null });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 'no-such-id' } }, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns a real signing request by its unguessable sign_id alone', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: null } });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sign_id).toBe('s1');
  });
});
