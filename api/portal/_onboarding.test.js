import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onboarding } from './_onboarding.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function stubFetch({ authOk = true, authUser = { id: 'user-1' }, account = null, starters = [] } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('/rest/v1/employee_portal_accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(account ? [account] : []) });
    }
    if (u.includes('/rest/v1/starter_instances')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(starters) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const req = () => ({ headers: { authorization: 'Bearer good' }, method: 'GET' });

// Phase 6.5 hardening — same-org name collision (Prompt 3 review, not
// explicitly named in the prompt but the same bug class as _case-list.js/
// _case-detail.js: an onboarding checklist is per-employee data too).
describe('portal onboarding', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('401s an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await onboarding(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('404s when the caller has no portal account', async () => {
    stubFetch({ account: null });
    const res = mockRes();
    await onboarding(req(), res);
    expect(res.statusCode).toBe(404);
  });

  it('fails closed to a null starter when the portal account has no email on file', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: '' };
    stubFetch({ account, starters: [{ id: 'st-1', tasks: [], email: 'sam@acme.com' }] });
    const res = mockRes();
    await onboarding(req(), res);
    expect(res.body.starter).toBeNull();
  });

  it('excludes a same-named colleague\'s onboarding checklist with a different email', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    stubFetch({ account, starters: [{ id: 'st-1', tasks: [{ id: 't1', task: 'Set up laptop', owner: 'IT', dueDate: null, done: false }], email: 'sam.other@acme.com' }] });
    const res = mockRes();
    await onboarding(req(), res);
    expect(res.body.starter).toBeNull();
  });

  it('returns the caller\'s own onboarding checklist, curated fields only', async () => {
    const account = { org_id: 'org-1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' };
    stubFetch({ account, starters: [{ id: 'st-1', tasks: [{ id: 't1', task: 'Set up laptop', owner: 'IT', dueDate: '2026-09-01', done: false, note: 'HR-internal note' }], email: 'sam@acme.com' }] });
    const res = mockRes();
    await onboarding(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.starter.id).toBe('st-1');
    expect(res.body.starter.tasks).toEqual([{ id: 't1', task: 'Set up laptop', owner: 'IT', dueDate: '2026-09-01', done: false }]);
    expect(JSON.stringify(res.body)).not.toContain('HR-internal note');
  });
});
