import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCaller, requireOrgMembership, requireOrgRole } from './_auth.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Routes a stubbed global fetch to canned responses by URL — verifyCaller
// hits Supabase's /auth/v1/user, requireOrgMembership's own follow-up
// query hits /rest/v1/org_members, exactly like the real endpoints these
// helpers are used from.
function stubFetch({ authOk = true, authUser = { id: 'user-1', email: 'a@b.com' }, members = [] } = {}) {
  global.fetch = vi.fn((url) => {
    if (String(url).includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (String(url).includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

describe('verifyCaller', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns null with no Authorization header at all', async () => {
    expect(await verifyCaller({ headers: {} })).toBeNull();
  });

  it('returns null for a header that is not a Bearer token', async () => {
    expect(await verifyCaller({ headers: { authorization: 'Basic xyz' } })).toBeNull();
  });

  it('returns null when Supabase rejects the token', async () => {
    stubFetch({ authOk: false });
    expect(await verifyCaller({ headers: { authorization: 'Bearer bad' } })).toBeNull();
  });

  it('returns {id, email} for a token Supabase accepts', async () => {
    stubFetch({ authUser: { id: 'user-1', email: 'a@b.com' } });
    expect(await verifyCaller({ headers: { authorization: 'Bearer good' } })).toEqual({ id: 'user-1', email: 'a@b.com' });
  });

  it('returns null (not a thrown error) if the network call itself fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    expect(await verifyCaller({ headers: { authorization: 'Bearer good' } })).toBeNull();
  });
});

// Phase 6.5 hardening (P0) — requireOrgMembership/requireOrgRole are the
// one shared authorization boundary every service-role api/ endpoint
// (which bypasses RLS entirely) should route through, replacing several
// endpoints' own inconsistent, sometimes-missing hand-rolled checks.
describe('requireOrgMembership', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('responds 401 and returns null when the caller cannot be verified', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    const result = await requireOrgMembership({ headers: {} }, res, 'org-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('responds 400 and returns null when orgId is missing', async () => {
    stubFetch();
    const res = mockRes();
    const result = await requireOrgMembership({ headers: { authorization: 'Bearer good' } }, res, undefined);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it('responds 403 and returns null when the caller is real but not a member of this org — the exact gap this fix closes', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    const result = await requireOrgMembership({ headers: { authorization: 'Bearer good' } }, res, 'org-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('returns {caller, role} for a real member', async () => {
    stubFetch({ authUser: { id: 'user-1', email: 'a@b.com' }, members: [{ role: 'line_manager' }] });
    const res = mockRes();
    const result = await requireOrgMembership({ headers: { authorization: 'Bearer good' } }, res, 'org-1');
    expect(result).toEqual({ caller: { id: 'user-1', email: 'a@b.com' }, role: 'line_manager' });
    expect(res.statusCode).toBeNull(); // no error response written on success
  });
});

describe('requireOrgRole', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('accepts an array of allowed roles', async () => {
    stubFetch({ members: [{ role: 'hr_director' }] });
    const res = mockRes();
    const result = await requireOrgRole({ headers: { authorization: 'Bearer good' } }, res, 'org-1', ['hr_director', 'hr_manager']);
    expect(result).not.toBeNull();
    expect(result.role).toBe('hr_director');
  });

  it('accepts a predicate function (e.g. isHrRole) as the role check', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    const isHrRole = (role) => role === 'hr_manager' || role === 'hr_director';
    const result = await requireOrgRole({ headers: { authorization: 'Bearer good' } }, res, 'org-1', isHrRole);
    expect(result).not.toBeNull();
  });

  it('responds 403 and returns null when the member is real but holds a disallowed role — the missing check api/portal/_invite.js had', async () => {
    stubFetch({ members: [{ role: 'location_manager' }] });
    const res = mockRes();
    const result = await requireOrgRole({ headers: { authorization: 'Bearer good' } }, res, 'org-1', ['hr_director', 'hr_manager']);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('still responds 403 for non-membership before ever reaching the role check', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    const result = await requireOrgRole({ headers: { authorization: 'Bearer good' } }, res, 'org-1', ['hr_director']);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });
});
