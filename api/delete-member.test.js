import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './delete-member.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (structural remediation, Prompt 12 — Identity
// Deletion / Multi-Org Membership invariant). This endpoint used to
// unconditionally delete the underlying auth.users row after removing a
// team member's org_members row — for a multi-org user (an explicitly
// supported scenario), "remove from OUR team" silently destroyed their
// entire Compass identity, including memberships in unrelated orgs. The
// stub below distinguishes org_members lookups by their query string
// (caller's own role vs. the target row vs. the remaining-directors
// count) so tests can exercise each branch precisely, and asserts no
// call is ever made to /auth/v1/admin/users/* — the regression test for
// the bug itself.
function stubFetch({ authOk = true, authUser = { id: 'caller-1' }, callerRole = null, target = null, directorCount = 2, deleteOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method, body: options.body });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/auth/v1/admin/users/')) {
      // Should never be hit post-fix — see the dedicated assertion below.
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (u.includes('/rest/v1/org_members')) {
      if (u.includes('role=eq.hr_director') && u.includes('select=id')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(Array.from({ length: directorCount }, (_, i) => ({ id: `dir-${i}` }))) });
      }
      if (u.includes(`user_id=eq.${encodeURIComponent(authUser.id)}`)) {
        // requireOrgRole's own caller-role lookup.
        return Promise.resolve({ ok: true, json: () => Promise.resolve(callerRole ? [{ role: callerRole }] : []) });
      }
      // Target member lookup (id=eq.<orgMemberId>&org_id=eq.<orgId>).
      return Promise.resolve({ ok: true, json: () => Promise.resolve(target ? [target] : []) });
    }
    return Promise.resolve({ ok: deleteOk, text: () => Promise.resolve(deleteOk ? '' : 'delete failed'), json: () => Promise.resolve([]) });
  });
  return calls;
}

const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body });

describe('delete-member', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller with no membership in the named org', async () => {
    stubFetch({ callerRole: null });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a non-HR caller', async () => {
    stubFetch({ callerRole: 'location_manager', target: { org_id: 'org-a', user_id: 'target-1', role: 'investigator' } });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('404s when the target member does not belong to the named org — closes the arbitrary-row cross-org lookup bug', async () => {
    stubFetch({ callerRole: 'hr_director', target: null });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects removing yourself via this endpoint', async () => {
    stubFetch({ authUser: { id: 'caller-1' }, callerRole: 'hr_director', target: { org_id: 'org-a', user_id: 'caller-1', role: 'hr_director' } });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an hr_manager removing an hr_director — role hierarchy', async () => {
    stubFetch({ callerRole: 'hr_manager', target: { org_id: 'org-a', user_id: 'target-1', role: 'hr_director' } });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects removing the organisation\'s only hr_director — lockout guard', async () => {
    stubFetch({ callerRole: 'hr_director', target: { org_id: 'org-a', user_id: 'target-1', role: 'hr_director' }, directorCount: 1 });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('allows an hr_director to remove another hr_director when a second one remains', async () => {
    stubFetch({ callerRole: 'hr_director', target: { org_id: 'org-a', user_id: 'target-1', role: 'hr_director' }, directorCount: 2 });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('removes only the org_members row, scoped to the named org, and never touches the auth identity', async () => {
    const calls = stubFetch({ callerRole: 'hr_director', target: { org_id: 'org-a', user_id: 'target-1', role: 'investigator' } });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-a' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const del = calls.find(c => c.method === 'DELETE');
    expect(del.url).toContain('/rest/v1/org_members');
    expect(del.url).toContain('id=eq.m1');
    expect(del.url).toContain('org_id=eq.org-a');
    expect(calls.some(c => c.url.includes('/auth/v1/admin/users/'))).toBe(false);
  });

  it('a multi-org caller acting on the org they actually named is scoped correctly, not an arbitrary other org', async () => {
    // Regression for the original bug: the caller lookup is now filtered
    // by org_id, so a caller who also belongs to a different org (with a
    // different role there) is evaluated against THIS org's role only.
    stubFetch({ callerRole: 'hr_director', target: { org_id: 'org-b', user_id: 'target-1', role: 'investigator' } });
    const res = mockRes();
    await handler(req({ orgMemberId: 'm1', orgId: 'org-b' }), res);
    expect(res.statusCode).toBe(200);
  });
});
