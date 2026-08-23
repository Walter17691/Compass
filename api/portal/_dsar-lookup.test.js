import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dsarLookup } from './_dsar-lookup.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (data-lifecycle review) — signing_requests and
// employee_portal_accounts both have zero client-facing RLS, so this is
// the only path a DSAR compile can reach either through. HR-role-gated,
// same pattern as api/portal/_accounts.js.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], signingRequests = [], portalAccounts = [] } = {}) {
  const calls = [];
  global.fetch = vi.fn((url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/signing_requests')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(signingRequests) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(portalAccounts) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = (query) => ({ method: 'GET', headers: { authorization: 'Bearer good' }, query });

describe('portal dsar-lookup', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a real member who is not HR', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('400s when orgId is missing', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    await dsarLookup(req({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns both signing requests and portal accounts for an HR caller, scoped to the org and employee (DSAR use)', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_manager' }],
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee', document: 'x' }],
      portalAccounts: [{ id: 'pa1', employee_name: 'Sam Employee' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.signingRequests).toHaveLength(1);
    expect(res.body.portalAccounts).toHaveLength(1);
    const signingCall = calls.find(u => u.includes('signing_requests'));
    const accountsCall = calls.find(u => u.includes('employee_portal_accounts'));
    expect(signingCall).toContain('org_id=eq.org-1');
    expect(signingCall).toContain('employee_name=eq.Sam');
    expect(accountsCall).toContain('org_id=eq.org-1');
    expect(accountsCall).toContain('employee_name=eq.Sam');
  });

  it('returns every row for the org when employeeName is omitted (org-wide export use)', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_director' }],
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee' }, { sign_id: 's2', employee_name: 'Priya Shah' }],
      portalAccounts: [{ id: 'pa1', employee_name: 'Sam Employee' }, { id: 'pa2', employee_name: 'Priya Shah' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.signingRequests).toHaveLength(2);
    expect(res.body.portalAccounts).toHaveLength(2);
    const signingCall = calls.find(u => u.includes('signing_requests'));
    expect(signingCall).not.toContain('employee_name=eq.');
  });
});
