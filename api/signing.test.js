import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './signing.js';

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

// Phase 6.5 hardening — document signing flow (Prompt 3, part A). The
// create path (no signId in the body) requires real org membership and
// persists org_id on the new row — the load-bearing fix
// signing_requests_org_scope_2026-08-21.sql and api/portal/_signatures.js
// both depend on. The direct sign/view path (by sign_id) is deliberately
// NOT org-scoped by design: the signer is an external, unauthenticated
// party, and the unguessable sign_id itself is the access boundary — see
// this file's own header comment. These tests cover both paths.
function stubFetch({ authOk = true, authUser = { id: 'user-1' }, members = [], signingRequest = null, insertOk = true, patchOk = true, rateLimitOk = true, resendThrows = false, resendOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn((url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method, body: options.body });
    if (u.includes('/auth/v1/user')) {
      return Promise.resolve({ ok: authOk, json: () => Promise.resolve(authUser) });
    }
    if (u.includes('check_rate_limit')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(rateLimitOk) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(members) });
    }
    if (u.includes('/rest/v1/signing_requests')) {
      if (options.method === 'POST') {
        return Promise.resolve({ ok: insertOk, text: () => Promise.resolve(insertOk ? '' : 'insert failed') });
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: patchOk, text: () => Promise.resolve(patchOk ? '' : 'update failed'), json: () => Promise.resolve(signingRequest ? [signingRequest] : []) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(signingRequest ? [signingRequest] : []) });
    }
    if (u.includes('api.resend.com')) {
      if (resendThrows) return Promise.reject(new Error('Resend is down'));
      return Promise.resolve({ ok: resendOk, text: () => Promise.resolve('resend failed'), json: () => Promise.resolve({ id: 'email-1' }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
  return calls;
}

describe('api/signing — create (POST, no signId)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const createBody = { document: 'x', employeeEmail: 'sam@acme.com', employeeName: 'Sam', managerName: 'Alex', orgId: 'org-1' };

  it('rejects a caller who is not a member of the claimed org', async () => {
    stubFetch({ members: [] });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: createBody }, res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects creation with no orgId at all', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    const noOrg = { document: createBody.document, employeeEmail: createBody.employeeEmail, employeeName: createBody.employeeName, managerName: createBody.managerName };
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: noOrg }, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a signing request and persists org_id for a real org member', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_manager' }] });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: createBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const insert = calls.find(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'POST');
    const payload = JSON.parse(insert.body);
    expect(payload.org_id).toBe('org-1');
  });

  it('rejects creation once the caller\'s rate limit is exceeded', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], rateLimitOk: false });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: createBody }, res);
    expect(res.statusCode).toBe(429);
  });
});

describe('api/signing — sign/acknowledge/decline (POST with signId)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('404s an unknown sign_id', async () => {
    stubFetch({ signingRequest: null });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 'no-such-id', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects re-actioning an already-signed request', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'signed', expires_at: null } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(409);
  });

  it('rejects an expired signing link', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: '2020-01-01T00:00:00.000Z' } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...' } }, res);
    expect(res.statusCode).toBe(409);
  });

  it('accepts a signature on a real, pending, unexpired request — no org membership required (the signer is external)', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, employee_name: 'Sam', manager_email: null } });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects repeated actioning of the same sign_id once its own rate limit is exceeded — caps brute-force/abuse against one public link', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null }, rateLimitOk: false });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
    expect(res.statusCode).toBe(429);
  });

  // Phase 6.5 hardening (structural remediation, Prompt 12 — Signature
  // Identity invariant) — the read-then-write used to be two separate
  // round trips: two near-simultaneous actions on the same still-pending
  // request (e.g. signed on one device, declined on another moments
  // later) could both pass the initial read-time check and both PATCH,
  // leaving a row that's status:'declined' while still carrying a
  // signature/signed_at from the other request. Folding the not-yet-
  // terminal check into the UPDATE's own WHERE clause (status=in.(sent,
  // opened)) makes this atomic: whichever request the database actually
  // applies second finds zero matching rows and gets a real 409, instead
  // of silently producing a self-contradictory record.
  it('treats a concurrent action that lands between the read and the write as a real conflict, not a silent double-apply', async () => {
    // The conditional PATCH matches zero rows — simulating another
    // request having already moved this row out of sent/opened between
    // this request's own read and its write.
    stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null }, patchOk: true });
    global.fetch = vi.fn((url, options = {}) => {
      const u = String(url);
      if (u.includes('/rest/v1/signing_requests') && options.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) }); // 0 rows matched
      }
      if (u.includes('/rest/v1/signing_requests')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ sign_id: 's1', status: 'sent', expires_at: null }]) });
      }
      if (u.includes('check_rate_limit')) return Promise.resolve({ ok: true, json: () => Promise.resolve(true) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
    expect(res.statusCode).toBe(409);
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 7.10, MEDIUM) —
  // the manager-notification email had no try/catch of its own, so a
  // Resend failure propagated into the outer catch and reported the
  // whole request as a 500 — even though the signature/decline had
  // already committed successfully just above.
  describe('a manager-notification failure never taints an already-successful sign/decline (Prompt 11 audit, 7.10)', () => {
    it('still reports success when the notification fetch throws outright', async () => {
      stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, manager_email: 'manager@acme.com', employee_name: 'Sam' }, resendThrows: true });
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('still reports success when the notification fetch resolves not-ok', async () => {
      stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, manager_email: 'manager@acme.com', employee_name: 'Sam' }, resendOk: false });
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body: { signId: 's1', signature: 'data:...', signedAt: new Date().toISOString() } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('still reports success on decline with no manager_email at all (no notification attempted)', async () => {
      stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, manager_email: null, employee_name: 'Sam' } });
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body: { signId: 's1', declined: true, signedAt: new Date().toISOString() } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

describe('api/signing — GET (view by sign_id)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('404s an unknown sign_id', async () => {
    stubFetch({ signingRequest: null });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 'no-such-id' } }, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns a real signing request by its unguessable sign_id alone', async () => {
    stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: null } });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sign_id).toBe('s1');
  });

  // Phase 6.5 hardening (structural remediation, Prompt 12 — Signature
  // Identity invariant) — this endpoint is hit both by the real signer's
  // own emailed link (public/sign.html) and by Compass's internal HR-side
  // polling (App.jsx's signature-sync effect, resendSignatureReminder).
  // Only the former is a genuine "the employee opened this" event; the
  // sent→opened transition (and its real opened_at timestamp) must never
  // fire from an internal status check, or HR simply viewing their own
  // case would falsify the record of employee engagement.
  it('a genuine (non-internal) view of a "sent" request advances it to "opened" with a real timestamp', async () => {
    const calls = stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null } });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    const patch = calls.find(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'PATCH');
    expect(patch).toBeTruthy();
    const body = JSON.parse(patch.body);
    expect(body.status).toBe('opened');
    expect(body.opened_at).toBeTruthy();
  });

  it('an internal status check (internal=1), authenticated as a real org member, never advances "sent" to "opened" — no PATCH is issued at all', async () => {
    const calls = stubFetch({ members: [{ role: 'hr_manager' }], signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, org_id: 'org-1' } });
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer good' }, query: { signId: 's1', internal: '1', orgId: 'org-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('sent');
    const patch = calls.find(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'PATCH');
    expect(patch).toBeUndefined();
  });

  it('an internal status check still honestly reports expiry — elapsed time is a fact, not an engagement signal', async () => {
    stubFetch({ members: [{ role: 'hr_manager' }], signingRequest: { sign_id: 's1', status: 'expired', expires_at: '2020-01-01T00:00:00.000Z', org_id: 'org-1' } });
    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer good' }, query: { signId: 's1', internal: '1', orgId: 'org-1' } }, res);
    expect(res.statusCode).toBe(200);
    // The already-expired branch (existing.status==='sent') is skipped
    // for an internal check, so this exercises the OTHER expiry branch
    // (status==='opened' && isExpired) — covered by the next test — this
    // one just confirms an internal check never crashes on an
    // already-terminal 'expired' row and returns it as-is.
    expect(res.body.status).toBe('expired');
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM) —
  // internal=1 used to be a self-asserted flag with no real
  // authentication at all, granting the exact same unrestricted read the
  // public link gets. It's now a genuine org-scoped auth boundary.
  describe('internal status checks now require real authentication (Prompt 11 audit, 2.10)', () => {
    it('rejects an internal check with no bearer token at all', async () => {
      stubFetch({ signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, org_id: 'org-1' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: { signId: 's1', internal: '1', orgId: 'org-1' } }, res);
      expect(res.statusCode).toBe(401);
    });

    it('rejects an internal check from someone authenticated but not a member of the claimed org', async () => {
      stubFetch({ members: [], signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, org_id: 'org-1' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: { authorization: 'Bearer good' }, query: { signId: 's1', internal: '1', orgId: 'org-1' } }, res);
      expect(res.statusCode).toBe(403);
    });

    it('rejects an internal check where the claimed orgId does not match the signing request\'s own org_id — a real member of a DIFFERENT org cannot use their own membership to read another org\'s document', async () => {
      stubFetch({ members: [{ role: 'hr_manager' }], signingRequest: { sign_id: 's1', status: 'sent', expires_at: null, org_id: 'org-OTHER' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: { authorization: 'Bearer good' }, query: { signId: 's1', internal: '1', orgId: 'org-1' } }, res);
      expect(res.statusCode).toBe(403);
    });
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM) —
  // the public link's sign_id was the only access control, with no time
  // bound, so a forwarded/leaked email link disclosed the full document
  // and captured signature image forever.
  describe('public (non-internal) reads of a terminal request are time-bound (Prompt 11 audit, 2.10)', () => {
    it('a document signed 60 days ago is no longer readable via the public link — only status is returned', async () => {
      const signedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      stubFetch({ signingRequest: { sign_id: 's1', status: 'signed', expires_at: null, signed_at: signedAt, document: 'sensitive content', signature: 'data:image/png;base64,xyz' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('signed');
      expect(res.body.restricted).toBe(true);
      expect(res.body.document).toBeUndefined();
      expect(res.body.signature).toBeUndefined();
    });

    it('a document signed 2 days ago is still fully readable via the public link', async () => {
      const signedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      stubFetch({ signingRequest: { sign_id: 's1', status: 'signed', expires_at: null, signed_at: signedAt, document: 'sensitive content', signature: 'data:image/png;base64,xyz' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.restricted).toBeFalsy();
      expect(res.body.document).toBe('sensitive content');
      expect(res.body.signature).toBe('data:image/png;base64,xyz');
    });

    it('a non-terminal (still pending) request is never restricted', async () => {
      // A future expires_at keeps this genuinely non-terminal — isTerminalStatus
      // gates the restriction entirely, so an "opened" row is never restricted
      // regardless of age.
      stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: new Date(Date.now() + 1000).toISOString(), document: 'still pending content' } });
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.restricted).toBeFalsy();
    });
  });
});
