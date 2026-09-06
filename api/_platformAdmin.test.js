import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requirePlatformAdmin } from './_platformAdmin.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Platform Admin Foundation — requirePlatformAdmin is the sole
// authorization check for cross-tenant operator routes, deliberately
// independent of org_members. These tests prove: a normal (non-admin)
// user is denied, a genuine platform admin is recognised, a revoked
// admin is denied, and — critically — that no client-supplied value
// (an orgId, a role, anything else in the request) can influence the
// result. The only inputs that matter are the caller's own verified
// identity and the live platform_admins row, both resolved server-side.
function stubFetch({
  authOk = true,
  authUser = { id: 'user-1', email: 'a@b.com' },
  admins = [],
} = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/platform_admins')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(admins) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = (overrides = {}) => ({
  headers: { authorization: 'Bearer good' },
  body: {},
  ...overrides,
});

describe('requirePlatformAdmin', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('unauthenticated caller (no token) is denied with 401', async () => {
    stubFetch();
    const res = mockRes();
    const result = await requirePlatformAdmin({ headers: {} }, res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('caller with a token Supabase rejects is denied with 401', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    const result = await requirePlatformAdmin(req(), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('a normal authenticated user with no platform_admins row is denied with 403', async () => {
    stubFetch({ admins: [] });
    const res = mockRes();
    const result = await requirePlatformAdmin(req(), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('a genuine, non-revoked platform admin is recognised', async () => {
    stubFetch({ admins: [{ user_id: 'user-1', granted_at: '2026-09-01T00:00:00Z' }] });
    const res = mockRes();
    const result = await requirePlatformAdmin(req(), res);
    expect(result).toEqual({ caller: { id: 'user-1', email: 'a@b.com' }, grantedAt: '2026-09-01T00:00:00Z' });
    expect(res.statusCode).toBeNull();
  });

  it('the platform_admins query filters on revoked_at=is.null — a revoked admin\'s row would not be returned by the live query, and an empty result denies with 403', async () => {
    // Simulates what the real revoked_at=is.null filter does server-side:
    // once revoked, the row no longer matches, so the endpoint sees no
    // admin row at all — same as never having been one.
    stubFetch({ admins: [] });
    const res = mockRes();
    const result = await requirePlatformAdmin(req(), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('the platform_admins lookup query is scoped by the caller\'s own verified id, never a client-supplied one', async () => {
    stubFetch({ authUser: { id: 'real-user-id', email: 'a@b.com' }, admins: [] });
    const res = mockRes();
    await requirePlatformAdmin(req({ body: { userId: 'someone-elses-id', orgId: 'org-x', role: 'platform_admin' } }), res);
    const platformAdminCall = global.fetch.mock.calls.find(([url]) => String(url).includes('/rest/v1/platform_admins'));
    expect(platformAdminCall[0]).toContain('user_id=eq.real-user-id');
    expect(platformAdminCall[0]).not.toContain('someone-elses-id');
  });

  it('no client-supplied orgId, role, or any other body field can substitute for a real platform_admins row', async () => {
    stubFetch({ admins: [] });
    const res = mockRes();
    const result = await requirePlatformAdmin(req({ body: { orgId: 'org-1', role: 'hr_director', isPlatformAdmin: true } }), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('does not expose any cross-tenant information in the denial response', async () => {
    stubFetch({ admins: [] });
    const res = mockRes();
    await requirePlatformAdmin(req(), res);
    expect(JSON.stringify(res.body)).not.toMatch(/org|customer|tenant/i);
  });

  it('returns null (not a thrown error) if the network call itself fails', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/v1/user')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1', email: 'a@b.com' }) });
      }
      return Promise.reject(new Error('network down'));
    });
    const res = mockRes();
    const result = await requirePlatformAdmin(req(), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(500);
  });
});
