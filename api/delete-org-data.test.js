import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './delete-org-data.js';
import { ORG_SCOPED_TABLES } from '../src/lib/dataInventory.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
// completeness invariant) — this used to be a hand-copied duplicate of
// the handler's own local table list, which the independent audit
// correctly flagged as a test that "asserts the code matches itself"
// and can never catch a missing table. Importing the same shared
// dataInventory.js the handler itself now reads from doesn't reintroduce
// that problem — src/test/dataInventory.test.js is the one that
// independently re-derives the expected table set (from a live schema
// snapshot) and checks dataInventory.js against it. This file's job is
// only to prove the handler actually iterates every table THAT LIST
// contains and scopes each delete correctly — a different, legitimate
// concern from "is the list itself complete."
const ALL_TABLES = [...ORG_SCOPED_TABLES, 'audit_log'];

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

  it('still attempts every table even if earlier ones fail, but reports the failure honestly instead of {success:true}', async () => {
    // Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
    // completeness invariant): a GDPR Art. 17 erasure request that
    // reports success while real personal data remains in one or more
    // tables is a confidently-false statement to the user — the old
    // behaviour this test used to assert. Every table must still be
    // attempted (best-effort, not abort-on-first-failure), but the
    // response itself must be an honest failure.
    const calls = stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }], deleteOk: false });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);

    for (const table of ALL_TABLES) {
      const del = calls.find(c => c.url.includes(`/rest/v1/${table}?`) && c.method === 'DELETE');
      expect(del, `expected a DELETE attempt for ${table} even after an earlier failure`).toBeTruthy();
    }
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.failedTables.length).toBeGreaterThan(0);
  });

  it('reports real success — 200, success:true, no failedTables — when every table clears', async () => {
    stubFetch({ members: [{ role: 'hr_director', name: 'Alex' }], deleteOk: true });
    const res = mockRes();
    await handler(req({ orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
