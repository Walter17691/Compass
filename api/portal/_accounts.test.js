import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listAccounts } from './_accounts.js';

// ─────────────────────────────────────────────────────────────────────────
// WHO MAY ENUMERATE PORTAL ACCOUNTS.
//
// employee_portal_accounts has zero client-facing RLS by design
// (supabase/employee_portal_2026-07-25.sql), so this endpoint IS the access
// boundary for that table — and it had no test at all. Added in the
// IR-REPORT-01a follow-up, because that slice changed WHO CALLS it and the
// refusal behaviour therefore had to be pinned before the caller moved.
//
// The client change (loadPortalAccounts moved inside App.jsx's existing isHR
// block) stops a non-HR user ASKING. These tests prove the server still
// REFUSES if anyone asks anyway — the client gate is an ergonomics fix, never
// the security boundary, and nothing here was weakened to achieve it.
// ─────────────────────────────────────────────────────────────────────────

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ members = [], accounts = [] } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method || 'GET' });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(accounts) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

const req = () => ({ headers: { authorization: 'Bearer good' }, method: 'GET', query: { orgId: 'org-1' } });
const asRole = (role) => [{ user_id: 'user-1', org_id: 'org-1', role }];
const ROW = { id: 'acc-1', employee_name: 'Jordan Ellis', employee_email: 'j@example.com', created_at: '2026-10-01' };

describe('portal list-accounts — the role boundary', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('serves an HR manager', async () => {
    const calls = stubFetch({ members: asRole('hr_manager'), accounts: [ROW] });
    const res = mockRes();
    await listAccounts(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.accounts).toEqual([ROW]);
    expect(calls.some(c => c.url.includes('employee_portal_accounts'))).toBe(true);
  });

  it('serves an HR director', async () => {
    stubFetch({ members: asRole('hr_director'), accounts: [] });
    const res = mockRes();
    await listAccounts(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.accounts).toEqual([]);
  });

  it('REFUSES a line manager — the assigned investigator\'s own org role', async () => {
    const calls = stubFetch({ members: asRole('line_manager'), accounts: [ROW] });
    const res = mockRes();
    await listAccounts(req(), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.accounts).toBeUndefined();
    // The refusal happens BEFORE the table is read — no row ever leaves the DB.
    expect(calls.some(c => c.url.includes('employee_portal_accounts'))).toBe(false);
  });

  it('REFUSES a location manager', async () => {
    stubFetch({ members: asRole('location_manager'), accounts: [ROW] });
    const res = mockRes();
    await listAccounts(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('REFUSES someone with no membership in the org at all', async () => {
    const calls = stubFetch({ members: [], accounts: [ROW] });
    const res = mockRes();
    await listAccounts(req(), res);
    expect([401, 403]).toContain(res.statusCode);
    expect(calls.some(c => c.url.includes('employee_portal_accounts'))).toBe(false);
  });

  it('still requires an orgId, and still rejects non-GET', async () => {
    stubFetch({ members: asRole('hr_manager') });
    const noOrg = mockRes();
    await listAccounts({ ...req(), query: {} }, noOrg);
    expect(noOrg.statusCode).toBe(400);

    const wrongMethod = mockRes();
    await listAccounts({ ...req(), method: 'POST' }, wrongMethod);
    expect(wrongMethod.statusCode).toBe(405);
  });
});
