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

// Phase 6.5 hardening (Prompt 16 audit, closes finding C2, CRITICAL) —
// requireCaseAccess is the shared boundary api/send-letter.js and
// api/send-for-signature.js now route through instead of bare
// requireOrgMembership, closing the gap where any org member (not just
// someone with a real relationship to the specific case) could deliver
// an arbitrary letter under Compass's own verified sending domain.
function stubFetchWithCase({ authOk = true, authUser = { id: 'user-1', email: 'a@b.com' }, members = [], caseRow = null, caseAccessRows = [], reviewRows = [] } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/cases')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(caseRow ? [caseRow] : []) });
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

  it('404s when the case does not exist or belongs to a different org', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], caseRow: { id: 'case-1', org_id: 'org-2', created_by: 'user-9', owner_id: null, outcome: '' } });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(404);
  });

  it('allows an HR-role member of the org regardless of case_access', async () => {
    stubFetchWithCase({ members: [{ role: 'hr_director' }], caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: '' } });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).not.toBeNull();
    expect(result.case.id).toBe('case-1');
  });

  it('allows the case creator even without a case_access row', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: '' } });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).not.toBeNull();
  });

  it('allows a member holding any case_access grant on this case', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: '' }, caseAccessRows: [{ role: 'notetaker' }] });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).not.toBeNull();
    expect(result.caseRole).toBe('notetaker');
  });

  it('403s a real org member with no relationship to the case at all — the exact gap this fix closes', async () => {
    stubFetchWithCase({ members: [{ role: 'line_manager' }], caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: '' }, caseAccessRows: [] });
    const res = mockRes();
    const result = await requireCaseAccess({ headers: { authorization: 'Bearer good' } }, res, 'org-1', 'case-1');
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
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
