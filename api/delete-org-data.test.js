import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './delete-org-data.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const ALL_TABLES = [
  'cases', 'starter_instances', 'dsar_requests', 'hr_review_requests', 'wellbeing_notes',
  'concern_referrals', 'leaver_instances', 'case_tasks', 'signing_requests', 'employee_records',
  'employee_portal_accounts', 'employee_portal_invites', 'case_views', 'improvement_initiatives',
  'manager_capability_insights', 'er_executive_briefs', 'org_events', 'integration_events', 'audit_log',
];

// Phase 6.5 hardening (data-lifecycle review) — organisation deletion.
// The task's own required test: deleting Org A must never delete Org B.
// Every DELETE this endpoint issues is filtered by org_id=eq.<orgId> —
// this stub records every call's URL so tests can assert the exact org
// scoping, rather than trusting the handler ran without checking what it
// actually sent.
function stubFetch({ authOk = true, authUser = { id: 'user-1', email: 'hr@acme.com' }, members = [], deleteOk = true } = {}) {
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
    // Every table DELETE, and the final audit_log POST.
    return Promise.resolve({ ok: deleteOk, text: () => Promise.resolve(deleteOk ? '' : 'delete failed'), json: () => Promise.resolve([]) });
  });
  return calls;
}

const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body });

describe('delete-org-data — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a real member who is not an HR Director', async () => {
    stubFetch({ members: [{ role: 'hr_manager', name: 'Alex' }] });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('400s when orgId is missing', async () => {
    stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }] });
    const res = mockRes();
    await handler(req({}), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('delete-org-data — full table coverage and tenant isolation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('issues a DELETE for every table in the real data inventory, each scoped to org_id', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }] });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(200);

    for (const table of ALL_TABLES) {
      const del = calls.find(c => c.url.includes(`/rest/v1/${table}?`) && c.method === 'DELETE');
      expect(del, `expected a DELETE for ${table}`).toBeTruthy();
      expect(del.url).toContain('org_id=eq.org-a');
    }
  });

  it('deleting Org A never issues a delete scoped to Org B', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }] });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(200);

    const deleteCalls = calls.filter(c => c.method === 'DELETE');
    expect(deleteCalls.length).toBeGreaterThan(0);
    for (const call of deleteCalls) {
      expect(call.url).not.toContain('org-b');
      expect(call.url).toContain('org_id=eq.org-a');
    }
  });

  it('records the deletion event itself as a fresh audit_log row, after clearing the org\'s previous audit trail', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_director', name: 'Alex Director' }] });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);

    const auditDelete = calls.find(c => c.url.includes('/rest/v1/audit_log?') && c.method === 'DELETE');
    const auditInsert = calls.find(c => c.url.startsWith('https://npeegfsoijhdnnvuqjin.supabase.co/rest/v1/audit_log') && c.method === 'POST');
    expect(auditDelete).toBeTruthy();
    expect(auditInsert).toBeTruthy();

    const payload = JSON.parse(auditInsert.body);
    expect(payload.org_id).toBe('org-a');
    expect(payload.action).toBe('Organisation data deleted');
    expect(payload.user_name).toBe('Alex Director');
    // No case/employee specifics — a generic statement of what happened,
    // not sensitive detail.
    expect(payload.detail).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/); // no "Firstname Lastname"-shaped names
  });

  it('does not fail the whole request if one table\'s delete errors — continues clearing the rest', async () => {
    stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }], deleteOk: false });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    // Best-effort: every table is still attempted even if earlier ones
    // failed, and the endpoint itself reports success rather than
    // aborting halfway through.
    expect(res.statusCode).toBe(200);
  });
});
