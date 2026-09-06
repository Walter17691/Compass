import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCaller, requireOrgMembership, requireOrgRole, requireCaseAccess, verifyOutcomeApproved } from './_auth.js';

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

// Commercial-readiness audit remediation (2026-09) — requireCaseAccess no
// longer re-derives "can this caller touch this case" as a hand-rolled JS
// predicate (that predicate had drifted from live RLS on both
// confidentiality and location — see api/_auth.js's own comment). It now
// makes exactly two /rest/v1/cases calls per lookup: a service-role
// existence/tenant check (id,org_id — never contributes to the access
// decision, only preserves 404-vs-403 semantics), and a CALLER-SCOPED
// call (apikey=anon, Authorization=Bearer <caller token>) that asks
// Postgres' own live RLS stack whether the case is visible — that second
// call's result IS the authorization decision. Tests below distinguish
// the two calls by their distinct `select` list (id,org_id vs id,outcome)
// since both hit the same URL shape, and drive the caller-scoped response
// directly to simulate what live RLS does for a given scenario (RLS
// content itself is verified separately, live, against production
// pg_policies).
function stubFetchWithCase({ authOk = true, authUser = { id: 'user-1', email: 'a@b.com' }, members = [], existsRow = null, callerVisibleRow = undefined, caseAccessRows = [], reviewRows = [] } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/cases')) {
      // The two /rest/v1/cases calls have distinct `select` lists in the
      // real code (existence check: id,org_id via the service key;
      // caller-scoped RLS check: id,outcome via the caller's own bearer
      // token) — distinguish on that rather than on headers, since the
      // service key is unset/undefined in this test environment.
      if (u.includes('select=id,outcome')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(callerVisibleRow ? [callerVisibleRow] : []) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(existsRow ? [existsRow] : []) });
    }
    if (u.includes('/rest/v1/case_access')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(caseAccessRows) });
    }
    if (u.includes('/rest/v1/hr_review_requests')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reviewRows) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

describe('requireCaseAccess', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('falls back to a plain org-membership check when caseId is omitted (a brand-new case may not exist yet)', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', undefined);
    expect(result).not.toBeNull();
    expect(result.case).toBeUndefined();
  });

  it('404s when the case does not exist at all', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], existsRow: null });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(404);
  });

  it('404s when the case belongs to a different org (no cross-tenant existence leak)', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], existsRow: { id: 'case-1', org_id: 'org-2' } });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(404);
  });

  // Item A/L/M of the adversarial matrix (HR Director/legal_reviewer/
  // auditor confidential oversight): live RLS grants these roles
  // visibility via has_confidential_case_oversight() regardless of any
  // other relationship — simulated here by a populated caller-visible row.
  it('allows access when the caller-scoped RLS query proves the case is visible (e.g. HR Director on a confidential case)', async () => {
    stubFetchWithCase({ members: [{ role: 'hr_director' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: { id: 'case-1', outcome: '' } });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).not.toBeNull();
    expect(result.case.id).toBe('case-1');
  });

  // Items C/D of the adversarial matrix (hr_manager on a confidential
  // case with no creator/case_access relationship, including owner-only):
  // live RLS denies this — an empty caller-scoped result must translate
  // to a 403, never a silent allow. This is the exact class of bug this
  // remediation closes: requireCaseAccess previously granted access via
  // canSeeAllOrgCases()/owner_id without ever asking RLS.
  it('denies access when the caller-scoped RLS query returns no row — the exact confidentiality/ownership gap this fix closes', async () => {
    stubFetchWithCase({ members: [{ role: 'hr_manager' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: undefined });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  // Item H of the adversarial matrix (creator whose location access has
  // since been removed): live RLS's permissive policy has no created_by
  // exemption, so a caller-scoped query correctly returns nothing even
  // for the case's own creator once location access is lost.
  it('denies access to the case creator when the caller-scoped RLS query returns no row (e.g. lost location access) — the location gap this fix also closes', async () => {
    stubFetchWithCase({ members: [{ role: 'location_manager' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: undefined });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it('queries the caller-scoped endpoint with the caller\'s own bearer token, not the service key', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: { id: 'case-1', outcome: '' } });
    const res = mockRes();
    await requireCaseAccess({ headers: { authorization: 'Bearer caller-token-xyz' } }, res, 'org-1', 'case-1');
    const callerScopedCall = global.fetch.mock.calls.find(([url, opts]) => String(url).includes('/rest/v1/cases') && opts.headers.Authorization === 'Bearer caller-token-xyz');
    expect(callerScopedCall).toBeDefined();
  });

  it('surfaces the caller\'s own case_access role once access is already proven, without it affecting the decision', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: { id: 'case-1', outcome: '' }, caseAccessRows: [{ role: 'notetaker' }] });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).not.toBeNull();
    expect(result.caseRole).toBe('notetaker');
  });

  it('never exposes the outcome field or grants access before the caller-scoped check runs — 403 is returned with no case data attached', async () => {
    stubFetchWithCase({ members: [{ role: 'hr_manager' }], existsRow: { id: 'case-1', org_id: 'org-1' }, callerVisibleRow: undefined });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.body).toEqual({ error: 'You do not have access to this case' });
  });
});

describe('verifyOutcomeApproved', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns true for an outcome type that was never approval-gated', async () => {
    stubFetchWithCase({});
    expect(await verifyOutcomeApproved('case-1', 'No further action')).toBe(true);
  });

  // Phase 6.5 hardening (closes Prompt 16 audit finding H10, HIGH) — a
  // never-recorded outcome (cases.outcome === "", the real default) used
  // to fall through the same branch as a genuinely-decided, genuinely-
  // non-gated outcome — reproduces exactly what CaseViewScreen's Copilot
  // "Draft outcome letter" action leaves behind, since it never calls
  // OutcomeModal's finalizeOutcome (the only code path that sets
  // cases.outcome).
  it('returns false when no outcome has been recorded at all — the exact gap H10 closes', async () => {
    stubFetchWithCase({});
    expect(await verifyOutcomeApproved('case-1', '')).toBe(false);
  });

  it('returns false for a null/undefined outcome the same way', async () => {
    stubFetchWithCase({});
    expect(await verifyOutcomeApproved('case-1', null)).toBe(false);
    expect(await verifyOutcomeApproved('case-1', undefined)).toBe(false);
  });

  it('returns false when no matching approved hr_review_requests row exists', async () => {
    stubFetchWithCase({ reviewRows: [] });
    expect(await verifyOutcomeApproved('case-1', 'Summary dismissal (gross misconduct)')).toBe(false);
  });

  it('returns true once a matching approved hr_review_requests row exists', async () => {
    stubFetchWithCase({ reviewRows: [{ id: 'review-1' }] });
    expect(await verifyOutcomeApproved('case-1', 'Final written warning')).toBe(true);
  });
});
