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

// Phase 6.5 hardening (Prompt 16 audit, closes finding H10, HIGH) — C1/C2
// closed the RLS/approval bypass, but CaseViewScreen's Copilot "Draft
// outcome letter" action (fires when !hasDiscOutcome, i.e. specifically
// BEFORE any decision exists) never calls OutcomeModal's finalizeOutcome
// — the only code path that sets cases.outcome — so a fully AI-drafted
// dismissal/warning letter could reach this endpoint with letterType
// "outcome" while the case's real outcome was still empty. Empty used to
// fall through the "not approval-gated, nothing to check" branch exactly
// like a genuine "No further action" decision. These tests walk the full
// decision chain the audit brief asks for.
describe('send-letter — the full outcome decision chain (closes H10)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const outcomeBody = { ...body, letterType: 'outcome', caseId: 'case-1' };

  it('No outcome exists: reproduces the Copilot path exactly (case.outcome === "") and confirms it is blocked, not silently allowed', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: '' },
      reviewRows: [],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/no recorded outcome/i);
  });

  it('Outcome exists but approval pending: blocked with the approval-specific message, not the no-outcome one', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      reviewRows: [],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/hasn't been approved yet/i);
  });

  it('Outcome approved: authorised user can issue/send', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      reviewRows: [{ id: 'review-1' }],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(200);
  });

  it('Unauthorized user: a real org member with zero relationship to the case cannot even reach the outcome check', async () => {
    stubFetch({
      members: [{ role: 'line_manager' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: 'Summary dismissal (gross misconduct)' },
      caseAccessRows: [],
      reviewRows: [{ id: 'review-1' }], // even though it's approved, they never get this far
    });
    const res = mockRes();
    await handler(req(outcomeBody), res);
    expect(res.statusCode).toBe(403);
  });

  it('Manipulated client: a direct API call claiming letterType "outcome" with no real approval is blocked regardless of what the client believes', async () => {
    stubFetch({
      members: [{ role: 'notetaker' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-9', owner_id: null, outcome: '' },
      caseAccessRows: [{ role: 'notetaker' }],
    });
    const res = mockRes();
    // A manipulated client could set outcome itself in the request body —
    // the server must ignore it and only trust its own DB read.
    await handler(req({ ...outcomeBody, outcome: 'Summary dismissal (gross misconduct)' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('Stale state: approval that existed at page-load time but has since been revoked/changed is re-checked fresh on every send, not cached', async () => {
    // First call: approved.
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Final written warning' },
      reviewRows: [{ id: 'review-1' }],
    });
    const firstRes = mockRes();
    await handler(req(outcomeBody), firstRes);
    expect(firstRes.statusCode).toBe(200);

    // Second call, same case: approval was revoked/reset in the meantime —
    // simulates a stale client re-sending after the underlying state changed.
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-1', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Final written warning' },
      reviewRows: [],
    });
    const secondRes = mockRes();
    await handler(req(outcomeBody), secondRes);
    expect(secondRes.statusCode).toBe(403);
  });

  it('Multiple cases for the same employee: the approval check is scoped to the exact caseId sent, never bleeds from a sibling case', async () => {
    // case-1 (this employee's disciplinary case) is approved; case-2 (a
    // different case, same employee) is not — sending against case-2's id
    // must not be satisfied by case-1's approval.
    stubFetch({
      members: [{ role: 'hr_director' }],
      caseRow: { id: 'case-2', org_id: 'org-1', created_by: 'user-1', owner_id: null, outcome: 'Dismissal with notice' },
      reviewRows: [], // case-2's own review, not case-1's
    });
    const res = mockRes();
    await handler(req({ ...outcomeBody, caseId: 'case-2' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('Multi-org user: an approved outcome in a different org the caller also belongs to is never visible through this org-scoped lookup', async () => {
    stubFetch({
      members: [{ role: 'hr_director' }], // member of org-1, the claimed orgId
      caseRow: { id: 'case-1', org_id: 'org-2', created_by: 'user-1', owner_id: null, outcome: 'Dismissal with notice' }, // case actually belongs to org-2
      reviewRows: [{ id: 'review-1' }],
    });
    const res = mockRes();
    await handler(req(outcomeBody), res); // orgId in body is still org-1
    expect(res.statusCode).toBe(404); // org mismatch — never reaches the outcome check at all
  });
});

// Human UAT remediation, Batch 2, Part 5/6 — "Share meeting record"
// (App.jsx's shareRecord) sent an `html` field this handler has never
// actually read; every call fell through to the hardcoded outcome-letter
// template built from fields shareRecord never supplied
// (employeeName/meetingType/date/body/managerName), producing a real
// email reading "Dear , Please find attached the outcome letter from
// your recent  on ." with the meeting record itself silently missing —
// while the app showed a false "Record shared" success toast. Fixed by
// giving documentType:"meeting_record" its own accurate template built
// from the fields shareRecord actually sends now.
//
// Batch 2 hardening — the UAT sign-off required a genuine attachment, not
// merely an honest "nothing is attached" disclaimer. shareRecord (App.jsx)
// now always generates a real meeting-record PDF client-side and sends it
// as a Resend attachment; these tests assert that attachment actually
// reaches the outbound Resend payload, and that a request missing it is
// rejected rather than silently sent.
function stubFetchCapturing({ members = [{ role: 'hr_manager' }] } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, options });
    if (u.includes('/auth/v1/user')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) });
    if (u.includes('/rest/v1/org_members')) return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    if (u.includes('/rest/v1/cases')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (u.includes('/rest/v1/case_access')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (u.includes('api.resend.com')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'email-1' }) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

describe('send-letter — meeting record share (Batch 2, Part 5/6)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const shareBody = {
    to: 'sam@acme.com',
    subject: 'Disciplinary Record - Sam Employee',
    orgId: 'org-1',
    documentType: 'meeting_record',
    recipientName: 'Sam Employee',
    personalMessage: 'Thanks for your time today.',
    employeeName: 'Sam Employee',
    meetingType: 'Disciplinary',
    date: '31/08/2026',
    managerName: 'Alex Manager',
    attachments: [{ filename: 'Disciplinary Record - Sam Employee.pdf', content: 'JVBERi0xLjMKdGVzdCBwZGYgYnl0ZXM=' }],
    attachmentNames: ['Disciplinary Record - Sam Employee.pdf'],
  };

  it('sends the meeting record as a real attachment, addressed to the real recipient, with a concise body naming it', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req(shareBody), res);
    expect(res.statusCode).toBe(200);

    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    // The actual attachment payload reaching the mail provider — filename
    // and bytes/content both intact, not just named in the body text.
    expect(payload.attachments).toEqual([
      { filename: 'Disciplinary Record - Sam Employee.pdf', content: 'JVBERi0xLjMKdGVzdCBwZGYgYnl0ZXM=' },
    ]);
    expect(payload.html).toContain('Dear Sam Employee,');
    expect(payload.html).toContain('Disciplinary Record - Sam Employee.pdf');
    expect(payload.html).toContain('Thanks for your time today.');
    // The body is now concise — it must not attempt to re-inline the
    // full record text now that a real attachment carries it, and must
    // not claim "nothing is attached" since something now genuinely is.
    expect(payload.html).not.toMatch(/nothing is attached/i);
    expect(payload.html).not.toContain('outcome letter');
  });

  it('rejects a meeting-record share with no attachment at all — the attachment cannot silently disappear while the UI reports success', async () => {
    stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...shareBody, attachments: [], attachmentNames: [] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/document is missing/i);
  });

  it('rejects a meeting-record share whose attachment entries are all malformed (missing filename/content)', async () => {
    stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...shareBody, attachments: [{ filename: '', content: '' }, null] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/document is missing/i);
  });

  it('rejects a blank/whitespace-only recipient name rather than sending "Dear ,"', async () => {
    stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...shareBody, recipientName: '   ' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/recipient name/i);
  });

  it('escapes HTML in the personal message so a recipient cannot inject markup', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...shareBody, personalMessage: '<script>alert(1)</script>' }), res);
    expect(res.statusCode).toBe(200);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.html).not.toContain('<script>');
  });

  it('still uses the letter template (not the meeting-record one) for ordinary letter sends with no documentType', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req(body), res);
    expect(res.statusCode).toBe(200);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    // No letterType on this fixture — an honest generic label, not a
    // presumed "outcome letter" for a type that was never specified.
    expect(payload.html).toContain('Please find the letter');
    expect(payload.html).toContain('Letter content');
  });

  it('names the letter type accurately for a suspension letter specifically', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...body, letterType: 'suspension' }), res);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.html).toContain('Please find the suspension letter');
  });
});

// Human UAT remediation, Batch 2, Part 11 — a disciplinary/appeal hearing
// invitation had no way to actually carry the case evidence the employee
// is entitled to see before the hearing. App.jsx's sendLetterCoordinated
// now forwards HR's selection (the case's own existing evidence, never a
// second store) as real Resend attachments; this also closes the same
// false-claim gap Part 6 closed elsewhere — the old hardcoded "Please
// find attached the outcome letter" text claimed an attachment even when
// none existed, and called every letter type an "outcome letter"
// regardless of what it actually was.
describe('send-letter — evidence attachments on invitation/appeal letters (Batch 2, Part 11)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('forwards selected evidence as real Resend attachments and lists them by name in the email', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req({
      ...body,
      letterType: 'invite',
      attachments: [{ filename: 'CCTV still.jpg', content: 'AAAA' }, { filename: 'Witness statement.pdf', content: 'BBBB' }],
      attachmentNames: ['CCTV still.jpg', 'Witness statement.pdf'],
    }), res);
    expect(res.statusCode).toBe(200);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.attachments).toEqual([
      { filename: 'CCTV still.jpg', content: 'AAAA' },
      { filename: 'Witness statement.pdf', content: 'BBBB' },
    ]);
    expect(payload.html).toContain('CCTV still.jpg');
    expect(payload.html).toContain('Witness statement.pdf');
    expect(payload.html).toContain('the invitation letter');
  });

  it('never claims an attachment, and never sends a Resend attachments field, when none was selected', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...body, letterType: 'appeal' }), res);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.attachments).toBeUndefined();
    expect(payload.html).toContain('the appeal outcome letter');
    expect(payload.html).not.toMatch(/<strong>Attached/);
  });

  it('drops a malformed attachment entry rather than forwarding it to Resend', async () => {
    const calls = stubFetchCapturing();
    const res = mockRes();
    await handler(req({ ...body, attachments: [{ filename: 'ok.pdf', content: 'AAAA' }, { filename: '' }, null] }), res);
    const emailCall = calls.find(c => c.url.includes('api.resend.com'));
    const payload = JSON.parse(emailCall.options.body);
    expect(payload.attachments).toEqual([{ filename: 'ok.pdf', content: 'AAAA' }]);
  });
});
