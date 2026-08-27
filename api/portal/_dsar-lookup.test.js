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
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], signingRequests = [], portalAccounts = [], portalInvites = [], profiles = [], caseViews = [] } = {}) {
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
    if (u.includes('/rest/v1/employee_portal_invites')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(portalInvites) });
    }
    if (u.includes('/rest/v1/profiles')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(profiles) });
    }
    if (u.includes('/rest/v1/case_views')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(caseViews) });
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
    expect(signingCall).toContain('employee_name.eq.Sam');
    expect(accountsCall).toContain('org_id=eq.org-1');
    expect(accountsCall).toContain('employee_name=eq.Sam');
  });

  // Phase 6.5 hardening (closes Prompt 16 audit finding H16, HIGH) — a
  // manager who chaired/approved a meeting is named as manager_name, not
  // employee_name, on that signing_requests row. Before this fix their
  // own DSAR could never surface it.
  it('also matches signing requests where the subject is the manager-side signatory, not the employee', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_manager' }],
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee', manager_name: 'Priya Manager', document: 'x' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Priya Manager' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.signingRequests).toHaveLength(1);
    const signingCall = calls.find(u => u.includes('signing_requests'));
    expect(signingCall).toContain('org_id=eq.org-1');
    expect(signingCall).toContain('or=(employee_name.eq.Priya');
    expect(signingCall).toContain('manager_name.eq.Priya');
  });

  it('does not apply the manager_name/employee_name OR filter to employee_portal_accounts or employee_portal_invites', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_manager' }],
      portalAccounts: [{ id: 'pa1', employee_name: 'Sam Employee' }],
      portalInvites: [{ id: 'pi1', employee_name: 'Sam Employee' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    const accountsCall = calls.find(u => u.includes('employee_portal_accounts'));
    const invitesCall = calls.find(u => u.includes('employee_portal_invites'));
    expect(accountsCall).not.toContain('or=(');
    expect(invitesCall).not.toContain('or=(');
  });

  it('returns every row for the org when employeeName is omitted (org-wide export use)', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_director', user_id: 'u-sam' }],
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

  // Phase 6.5 hardening (closes independent audit finding 4.3) —
  // employee_portal_invites has zero RLS policies at all, and profiles/
  // case_views are both strictly own-row-only, so an HR user compiling a
  // DSAR about someone ELSE has no client-side query path to any of the
  // three — this endpoint is the only way in, same reasoning as
  // signing_requests/employee_portal_accounts above.
  it('returns portal invites scoped to the org and employee name', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_manager', user_id: 'u-sam', name: 'Sam Employee' }],
      portalInvites: [{ id: 'pi1', employee_name: 'Sam Employee', email: 'sam@example.com' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.portalInvites).toHaveLength(1);
    const invitesCall = calls.find(u => u.includes('employee_portal_invites'));
    expect(invitesCall).toContain('org_id=eq.org-1');
    expect(invitesCall).toContain('employee_name=eq.Sam');
  });

  it('resolves the matching org_members row by name, then returns that user\'s profile and case views', async () => {
    const calls = stubFetch({
      members: [{ role: 'hr_manager', user_id: 'u-sam', name: 'Sam Employee' }],
      profiles: [{ id: 'u-sam', name: 'Sam Employee', role: 'hr_manager' }],
      caseViews: [{ case_id: 'c1', user_id: 'u-sam', last_viewed_at: '2026-01-01' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Sam Employee' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toEqual([{ id: 'u-sam', name: 'Sam Employee', role: 'hr_manager' }]);
    expect(res.body.caseViews).toHaveLength(1);
    const membersCall = calls.find(u => u.includes('org_members') && u.includes('name=eq.Sam'));
    expect(membersCall).toContain('select=user_id');
    const profilesCall = calls.find(u => u.includes('/rest/v1/profiles'));
    expect(profilesCall).toContain('id=in.(u-sam)');
  });

  it('returns no profile/case-view data when the requested name matches no org member (a case-subject-only DSAR)', async () => {
    stubFetch({
      members: [{ role: 'hr_manager' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1', employeeName: 'Not A Member' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toEqual([]);
    expect(res.body.caseViews).toEqual([]);
  });

  it('resolves profiles/case views for every org member when employeeName is omitted (org-wide export use)', async () => {
    stubFetch({
      members: [{ role: 'hr_director', user_id: 'u-sam' }],
      profiles: [{ id: 'u-sam', name: 'Sam Employee', role: 'hr_director' }],
      caseViews: [{ case_id: 'c1', user_id: 'u-sam', last_viewed_at: '2026-01-01' }],
    });
    const res = mockRes();
    await dsarLookup(req({ orgId: 'org-1' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.caseViews).toHaveLength(1);
  });
});
