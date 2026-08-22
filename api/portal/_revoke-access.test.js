import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revokeAccess } from './_revoke-access.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ members = [], deleteOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: deleteOk, text: () => Promise.resolve(deleteOk ? '' : 'delete failed') });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (body) => ({ headers: { authorization: 'Bearer good' }, method: 'POST', body });

// Phase 6.5 hardening — revoked access (Prompt 3, part D). revoke-access
// is the only place that deletes an employee_portal_accounts row; once
// deleted, every other portal endpoint (case-list/case-detail/signatures/
// onboarding/status) independently looks the caller's account up by
// user_id and 404s with no account found — proven directly against
// case-list/case-detail/signatures in their own test files ("404s when
// the caller has no portal account" / equivalent). This file tests
// revoke-access itself: only HR can call it, and it issues a real DELETE.
describe('portal revoke-access', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects a non-HR caller', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await revokeAccess(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('lets HR revoke a portal account, issuing a real DELETE scoped to that org', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await revokeAccess(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(200);
    const del = calls.find(c => c.url.includes('/rest/v1/employee_portal_accounts') && c.method === 'DELETE');
    expect(del).toBeTruthy();
    expect(del.url).toContain('org_id=eq.org-1');
    expect(del.url).toContain('employee_name=eq.' + encodeURIComponent('Sam Employee'));
  });

  it('400s when orgId or employeeName is missing', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await revokeAccess(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(400);
  });
});
