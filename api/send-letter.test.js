import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './send-letter.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Phase 6.5 hardening (High, security review) — email relay security
// (Prompt 5, part 3). requireOrgMembership/rate-limit were already fixed;
// this file adds direct regression coverage for unauthorised send
// attempts against this endpoint specifically.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], emailOk = true, caseRow = null, caseAccessRows = [], reviewRows = [] } = {}) {
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
    if (u.includes('api.resend.com')) {
      return Promise.resolve({ ok: emailOk, json: () => Promise.resolve(emailOk ? { id: 'email-1' } : { message: 'send failed' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

const body = { to: 'sam@acme.com', subject: 'Outcome', body: 'Letter content', orgId: 'org-1', employeeName: 'Sam', meetingType: 'Disciplinary', managerName: 'Alex', date: '2026-08-22' };
const req = (b = body) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: b });

describe('send-letter — authorisation', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('rejects an unauthenticated caller', async () => {
    stubFetch({ authOk: false });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a caller who is not a member of the claimed org (cross-tenant send attempt)', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it('sends successfully for a real org member', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a request with no orgId at all', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    const noOrg = { to: body.to, subject: body.subject, body: body.body, employeeName: body.employeeName, meetingType: body.meetingType, managerName: body.managerName, date: body.date };
    await handler(req(noOrg), res);
    expect(res.statusCode).toBe(400);
  });

  // Phase 6.5 hardening (Prompt 14, Section 7 — closes independent audit
  // finding 2.3) — `to` was previously forwarded to Resend with zero
  // validation at all. Deliberately still allows any well-formed
  // external address (solicitors, occupational health, personal email) —
  // only rejects malformed/non-string input, not unfamiliar recipients.
  it('rejects a malformed recipient address', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, to: 'not-an-email' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-string recipient', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, to: ['sam@acme.com', 'attacker@evil.com'] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('still allows a well-formed external recipient the org has no record of', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, to: 'external.solicitor@lawfirm.example.com' }), res);
    expect(res.statusCode).toBe(200);
  });
});

// Phase 6.5 hardening (Prompt 16 audit, closes finding C2, CRITICAL) —
// live-verified during the audit: a "notetaker" case_access grant (no
// decision authority at all) was enough both to set a case's outcome
// directly (finding C1, closed by a DB trigger) and to deliver a
// fabricated dismissal letter through this exact endpoint, with zero HR
// sign-off. These tests reproduce the chain and assert it's now closed.
describe('send-letter — case linkage and outcome-approval gate (closes C2)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const outcomeBody = { ...body, letterType: 'outcome', caseId: 'case-1' };

  it('400s an outcome letter with no caseId at all', async () => {
    stubFetch({ members: [{ role: 'notetaker' }] });
    const res = mockRes();
    await handler(req({ ...body, letterType: 'outcome' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('403s a case_access holder with no decision role from sending a dismissal letter before approval — reproduces the live-verified exploit', async () => {
    stubFetch({
      members: [{ role: 'line_manager' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      caseAccessRows: [{ role: 'notetaker' }],
      reviewRows: [], // no approved hr_review_requests row
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(403);
  });

  it('403s a caller with zero relationship to the case at all', async () => {
    stubFetch({
      members: [{ role: 'line_manager' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      caseAccessRows: [],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(403);
  });

  it('sends once the outcome is genuinely approved', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      reviewRows: [{ id: 'review-1' }],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does not require approval for a non-approval-gated outcome type', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'No further action' },
      reviewRows: [],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(200);
  });

  it('does not require caseId/approval for a non-outcome letter type', async () => {
    stubFetch({ members: [{ role: 'line_manager' }] });
    const res = mockRes();
    await handler(req({ ...body, letterType: 'invite' }), res);
    expect(res.statusCode).toBe(200);
  });
});
