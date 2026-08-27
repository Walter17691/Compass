import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signatures } from './_signatures.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening — signing_requests tenant isolation (Prompt 3, part
// A). The fetch stub below inspects the ACTUAL query string each request
// builds, rather than blindly returning canned data regardless of the
// filter — a query missing the org_id or employee_email predicate would
// otherwise pass a test that trusts the stub, exactly the class of bug
// this whole fix targets.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, account = null, signingRequest = null, patchOk = true } = {}) {
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(account ? [account] : []) });
    }
    if (u.includes('/rest/v1/signing_requests')) {
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: patchOk, text: () => Promise.resolve(patchOk ? '' : 'update failed'), json: () => Promise.resolve([]) });
      }
      // GET (list) — requires org_id + employee_email in the query, not employee_name.
      if (u.includes('sign_id=eq.')) {
        // The single-row lookup used by the POST ownership check.
        return Promise.resolve({ ok: true, json: () => Promise.resolve(signingRequest ? [signingRequest] : []) });
      }
      const orgOk = signingRequest && u.includes(`org_id=eq.${encodeURIComponent(signingRequest.org_id)}`);
      const emailOk = signingRequest && u.includes(`employee_email=eq.${encodeURIComponent(signingRequest.employee_email)}`);
      const nameLeftIn = u.includes('employee_name=eq.');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(orgOk && emailOk && !nameLeftIn && signingRequest ? [signingRequest] : []) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = (method, body = {}) => ({ headers: { authorization: 'Bearer good' }, method, body });

describe('portal signatures — GET (list pending)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('401s an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await signatures(req('GET'), res);
    expect(res.statusCode).toBe(401);
  });

  it('404s when the caller has no portal account', async () => {
    stubFetch({ account: null });
    const res = mockRes();
    await signatures(req('GET'), res);
    expect(res.statusCode).toBe(404);
  });

  it('fails closed to an empty list when the portal account has no email on file', async () => {
    stubFetch({ account: { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: '' } });
    const res = mockRes();
    await signatures(req('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pending).toEqual([]);
  });

  it('returns a pending request that matches the caller\'s own org and email', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam@acme.com', status: 'sent', document: 'x' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pending).toHaveLength(1);
  });

  it('does not return another tenant\'s pending signature for a same-named employee (cross-tenant isolation)', async () => {
    // Account is at org-1; the only signing request in the fake table
    // belongs to org-2 — same employee_email, different org.
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-2', employee_email: 'sam@acme.com', status: 'sent', document: 'x' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pending).toEqual([]);
  });
});

describe('portal signatures — POST (sign)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('400s when signId or signature is missing', async () => {
    stubFetch({ account: { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' } });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('fails closed (403) when the caller\'s own portal account has no email on file', async () => {
    stubFetch({ account: { org_id: 'org-1', employee_name: 'Sam', employee_email: '' } });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects signing another tenant\'s document — org_id mismatch', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-2', employee_email: 'sam@acme.com', status: 'sent' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects signing a same-org document belonging to a different employee (name collision / different email)', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam.imposter@other.com', status: 'sent' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('fails closed when the stored signing request has no email on file, even in the same org', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: '', status: 'sent' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects re-signing an already-actioned request', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam@acme.com', status: 'signed' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a genuine own-document signature', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam@acme.com', status: 'sent' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.8, MEDIUM) —
  // unlike api/signing.js's own POST handler, this path never checked
  // expires_at at all, so a portal user could sign well past the
  // request's 7-day expiry window.
  it('rejects signing a request past its expiry, even though its status is still "sent"/"opened"', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam@acme.com', status: 'opened', expires_at: '2020-01-01T00:00:00.000Z' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts signing a request with an expiry still in the future', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam', employee_email: 'sam@acme.com' };
    const signingRequest = { sign_id: 's1', org_id: 'org-1', employee_email: 'sam@acme.com', status: 'sent', expires_at: '2099-01-01T00:00:00.000Z' };
    stubFetch({ account, signingRequest });
    const res = mockRes();
    await signatures(req('POST', { signId: 's1', signature: 'data:...' }), res);
    expect(res.statusCode).toBe(200);
  });
});
