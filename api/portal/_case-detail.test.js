import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { caseDetail } from './_case-detail.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, authUser = { id: 'user-1' }, account = null, cs = null } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(account ? [account] : []) });
    }
    if (u.includes('/rest/v1/cases')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(cs ? [cs] : []) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = (caseId) => ({ headers: { authorization: 'Bearer good' }, method: 'GET', query: { caseId } });

const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };

describe('portal case-detail', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('401s an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(401);
  });

  it('400s when caseId is missing', async () => {
    stubFetch({ account });
    const res = mockRes();
    await caseDetail(req(undefined), res);
    expect(res.statusCode).toBe(400);
  });

  it('404s when the caller has no portal account', async () => {
    stubFetch({ account: null });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(404);
  });

  it('404s a forged/nonexistent case id', async () => {
    stubFetch({ account, cs: null });
    const res = mockRes();
    await caseDetail(req('does-not-exist'), res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects a forged/mismatched tenant id — case belongs to a different org', async () => {
    const cs = { id: 'c1', org_id: 'org-2', employee_name: 'Sam Employee', employee_email: 'sam@acme.com', case_type: 'misconduct', stage: 'investigation', meetings: [] };
    stubFetch({ account, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a same-org, same-named colleague\'s case (different email)', async () => {
    const cs = { id: 'c1', org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam.other@acme.com', case_type: 'misconduct', stage: 'investigation', meetings: [] };
    stubFetch({ account, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(403);
  });

  it('fails closed when the case has no employee_email on file, even with a matching name (confidential-case leak fix)', async () => {
    const cs = { id: 'c1', org_id: 'org-1', employee_name: 'Sam Employee', employee_email: null, case_type: 'misconduct', stage: 'investigation', confidential: true, meetings: [] };
    stubFetch({ account, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(403);
  });

  it('fails closed when the portal account itself has no email on file', async () => {
    const noEmailAccount = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: '' };
    const cs = { id: 'c1', org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com', case_type: 'misconduct', stage: 'investigation', meetings: [] };
    stubFetch({ account: noEmailAccount, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(403);
  });

  it('grants access to the caller\'s own confidential case (confidentiality does not block the actual subject)', async () => {
    const cs = { id: 'c1', org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com', case_type: 'misconduct', stage: 'investigation', confidential: true, meetings: [] };
    stubFetch({ account, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.caseType).toBe('misconduct');
  });

  it('only ever returns curated fields — never raw meeting record/transcript/riskScore', async () => {
    const cs = {
      id: 'c1', org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com',
      case_type: 'misconduct', stage: 'investigation',
      meetings: [{ type: 'Disciplinary', date: '2026-01-01', letterOutput: 'Dear Sam...', record: 'private HR notes', transcript: 'raw transcript', riskScore: 9 }],
    };
    stubFetch({ account, cs });
    const res = mockRes();
    await caseDetail(req('c1'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meetings).toEqual([{ type: 'Disciplinary', date: '2026-01-01', letterOutput: 'Dear Sam...' }]);
    expect(JSON.stringify(res.body)).not.toContain('private HR notes');
    expect(JSON.stringify(res.body)).not.toContain('raw transcript');
  });
});
