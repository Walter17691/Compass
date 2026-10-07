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

// ═══════════════════════════════════════════════════════════════════════════
// RECORDING AN EMPLOYER RESOLUTION (TRUST-SIG-03).
//
// ┌─ THE PRODUCTION FAILURE THESE TESTS REPRODUCE ──────────────────────────┐
// │ Human UAT, case 065d5a28. The employee disputed an Investigation record, │
// │ the manager chose "Partially accepted", entered a rationale and an        │
// │ addendum, clicked Record this conclusion, and the browser showed:         │
// │                                                                         │
// │   Cannot read properties of undefined (reading 'id')                     │
// │                                                                         │
// │ The handler read `resolveAuth.user.id`. requireOrgMembership returns      │
// │ { caller, role } — there is NO `user` property — so the expression threw   │
// │ a TypeError inside the handler's try, which the catch turned into a 500   │
// │ carrying the raw message, which the client toasted verbatim.             │
// │                                                                         │
// │ WHY THE TRUST-SIG-03 SUITE MISSED IT: its only assertion about the actor  │
// │ was a SOURCE-TEXT match, /actorId: resolveAuth\.user\.id/. It pinned the   │
// │ bug in place. The contract belongs to _auth.js, so the only test that     │
// │ could ever have caught this is one that RUNS the handler against the real │
// │ requireOrgMembership — which this harness already did for every other     │
// │ authenticated action. These tests use it.                                │
// └─────────────────────────────────────────────────────────────────────────┘

describe('api/signing — resolveResponse (employer review of a disputed record)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  // The exact production shape: signed AND disputed, not yet resolved.
  const disputedRow = (over = {}) => ({
    sign_id: 's1', org_id: 'org-1', status: 'signed',
    document: 'ORIGINAL ISSUED RECORD',
    signature: 'data:image/png;base64,AAA', signed_at: '2026-10-07T07:51:49.570Z',
    employee_name: 'ZZ Test', manager_email: 'manager@acme.com',
    response_type: 'disputed',
    participant_comment: 'Responsibility for the stock count was not established.',
    proposed_correction: 'It should record that responsibility was not established.',
    response_resolution: null, response_resolved_by: null, response_resolved_at: null,
    response_addendum: null, superseded_at: null, expires_at: null,
    ...over,
  });

  const WALTERS_INPUT = {
    resolveResponse: true, signId: 's1', orgId: 'org-1',
    resolution: 'partially_accepted',
    resolutionReason: 'Sam is correct that responsibility was not established during this meeting. However the record accurately reflects their account.',
    resolutionAddendum: 'It is recorded that responsibility for the stock count was not established during this meeting.',
  };

  const asMember = (over = {}) => stubFetch({
    authUser: { id: 'manager-uuid' }, members: [{ role: 'hr_manager' }],
    signingRequest: disputedRow(), ...over,
  });

  function patchBody(calls) {
    const patch = calls.find(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'PATCH');
    return patch ? { url: patch.url, body: JSON.parse(patch.body) } : null;
  }

  it('records the resolution Walter entered, instead of 500ing on an undefined actor', async () => {
    const calls = asMember();
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    // The regression itself: no TypeError surfacing as a 500.
    expect(res.statusCode).toBe(200);
    expect(String(res.body?.error || '')).not.toMatch(/reading 'id'/);
    expect(res.body.success).toBe(true);
    // And it genuinely wrote, once, with the actor present.
    const writes = calls.filter(c => c.url.includes('/rest/v1/signing_requests') && c.method === 'PATCH');
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0].body).response_resolved_by).toBe('manager-uuid');
  });

  it('derives the resolving actor from the verified session, not the request body', async () => {
    const calls = asMember();
    const res = mockRes();
    await handler({
      method: 'POST', headers: { authorization: 'Bearer good' },
      // A forged actor in the body must be ignored entirely.
      body: { ...WALTERS_INPUT, responseResolvedBy: 'someone-else', actorId: 'someone-else' },
    }, res);
    const { body } = patchBody(calls);
    expect(body.response_resolved_by).toBe('manager-uuid');
    expect(JSON.stringify(body)).not.toMatch(/someone-else/);
  });

  it('timestamps the resolution from the server clock', async () => {
    const calls = asMember();
    const before = Date.now();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { ...WALTERS_INPUT, responseResolvedAt: '1999-01-01T00:00:00.000Z' } }, mockRes());
    const { body } = patchBody(calls);
    const at = new Date(body.response_resolved_at).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(body.response_resolved_at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('writes the rationale and the addendum as SEPARATE fields', async () => {
    const calls = asMember();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, mockRes());
    const { body } = patchBody(calls);
    expect(body.response_resolution).toBe('partially_accepted');
    expect(body.response_resolution_reason).toBe(WALTERS_INPUT.resolutionReason);
    expect(body.response_addendum).toBe(WALTERS_INPUT.resolutionAddendum);
    // Why-the-conclusion and what-is-adopted are distinguishable.
    expect(body.response_resolution_reason).not.toBe(body.response_addendum);
  });

  it('touches NOTHING that belongs to the record or to the employee', async () => {
    const calls = asMember();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, mockRes());
    const { body } = patchBody(calls);
    for (const immutable of ['document', 'participant_comment', 'participant_comment_at',
      'proposed_correction', 'response_type', 'signature', 'signed_at', 'status']) {
      expect(body).not.toHaveProperty(immutable);
    }
    // "Partially accepted" must not promote the employee's wording to fact.
    expect(body.response_addendum).not.toBe(disputedRow().proposed_correction);
    expect(JSON.stringify(body)).not.toContain('ORIGINAL ISSUED RECORD');
  });

  it('NEVER substitutes the employee\'s proposed wording for a blank addendum', async () => {
    // The brief's rule for this exact UAT path: "Partially accepted" must not
    // convert the employee's entire proposed wording into established fact. The
    // dangerous shape is a manager who leaves the addendum blank — a server-side
    // `resolutionAddendum || row.proposed_correction` fallback would silently
    // promote their words to employer-authored record text.
    for (const resolution of ['correction_accepted', 'partially_accepted']) {
      const calls = asMember();
      const res = mockRes();
      // BOTH shapes matter. '' is what ResponseReviewForm actually sends (it
      // trims before submitting) and is the only one a `||` fallback would
      // catch; '   ' and omitted-entirely cover a hand-rolled or older caller.
      // An earlier version of this test used only '   ', which is truthy, so a
      // deliberately-introduced `|| row.proposed_correction` survived it.
      for (const resolutionAddendum of ['', '   ', undefined]) {
        await handler({ method: 'POST', headers: { authorization: 'Bearer good' },
          body: { ...WALTERS_INPUT, resolution, resolutionAddendum } }, res);
        expect(res.statusCode).toBe(200);
        const { body } = patchBody(calls);
        expect(body.response_addendum).toBeNull();
        expect(body.response_addendum).not.toBe(disputedRow().proposed_correction);
        expect(JSON.stringify(body)).not.toContain('It should record that responsibility');
      }
    }
  });

  it('applies the write only while the response is still unresolved', async () => {
    const calls = asMember();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, mockRes());
    expect(patchBody(calls).url).toContain('response_resolution=is.null');
  });

  it('a replay finds it already resolved and does not write again', async () => {
    const calls = asMember({ signingRequest: disputedRow({
      response_resolution: 'original_retained', response_resolved_by: 'manager-uuid',
      response_resolved_at: '2026-10-07T08:00:00.000Z',
    }) });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.alreadyResolved).toBe(true);
    expect(patchBody(calls)).toBeNull();
  });

  it('a lost race — the conditional update matching nothing — is a conflict, not a silent success', async () => {
    // The row read as unresolved, then another reviewer won. PostgREST returns
    // an empty representation; that must never be reported as recorded.
    stubFetch({
      authUser: { id: 'manager-uuid' }, members: [{ role: 'hr_manager' }],
      signingRequest: disputedRow(),
    });
    // Make the PATCH representation empty while the preceding GET still returns the row.
    const realFetch = global.fetch;
    const patches = [];
    global.fetch = vi.fn((url, options = {}) => {
      if (String(url).includes('/rest/v1/signing_requests') && options.method === 'PATCH') {
        // Recorded here, not delegated: the point of this test is that the write
        // WAS attempted and matched no row, which is different from never trying.
        patches.push({ url: String(url), body: options.body });
        return Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve([]) });
      }
      return realFetch(url, options);
    });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.alreadyResolved).toBe(true);
    expect(patches.length).toBe(1);
    expect(patches[0].url).toContain('response_resolution=is.null');
  });

  it('refuses a caller with no session', async () => {
    const calls = stubFetch({ authOk: false, signingRequest: disputedRow() });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(401);
    expect(patchBody(calls)).toBeNull();
  });

  it('refuses a caller who is not a member of the claimed org', async () => {
    const calls = stubFetch({ authUser: { id: 'outsider' }, members: [], signingRequest: disputedRow() });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(403);
    expect(patchBody(calls)).toBeNull();
  });

  it('refuses CROSS-TENANT resolution — a member of org-2 cannot resolve org-1\'s record', async () => {
    const calls = stubFetch({
      authUser: { id: 'other-tenant-manager' }, members: [{ role: 'hr_manager' }],
      signingRequest: disputedRow({ org_id: 'org-1' }),
    });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { ...WALTERS_INPUT, orgId: 'org-2' } }, res);
    expect(res.statusCode).toBe(403);
    expect(patchBody(calls)).toBeNull();
  });

  it('refuses to resolve a response that never challenged accuracy', async () => {
    const calls = asMember({ signingRequest: disputedRow({ response_type: 'comment', proposed_correction: null }) });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(409);
    expect(patchBody(calls)).toBeNull();
  });

  it('404s an unknown signing request', async () => {
    const calls = asMember({ signingRequest: null });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(404);
    expect(patchBody(calls)).toBeNull();
  });

  it('rejects every resolution with no rationale, and writes nothing', async () => {
    for (const resolution of ['correction_accepted', 'partially_accepted', 'original_retained', 'addendum_added']) {
      const calls = asMember();
      const res = mockRes();
      await handler({ method: 'POST', headers: { authorization: 'Bearer good' },
        body: { ...WALTERS_INPUT, resolution, resolutionReason: '   ' } }, res);
      expect(res.statusCode).toBe(400);
      expect(patchBody(calls)).toBeNull();
    }
  });

  it('accepts all four resolutions with a rationale, and trims it', async () => {
    for (const resolution of ['correction_accepted', 'partially_accepted', 'original_retained', 'addendum_added']) {
      const calls = asMember();
      const res = mockRes();
      await handler({ method: 'POST', headers: { authorization: 'Bearer good' },
        body: { ...WALTERS_INPUT, resolution, resolutionReason: '  a considered reason  ' } }, res);
      expect(res.statusCode).toBe(200);
      const { body } = patchBody(calls);
      expect(body.response_resolution).toBe(resolution);
      expect(body.response_resolution_reason).toBe('a considered reason');
      expect(body.response_resolved_by).toBe('manager-uuid');
    }
  });

  it('rejects an unrecognised resolution', async () => {
    const calls = asMember();
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { ...WALTERS_INPUT, resolution: 'made_it_go_away' } }, res);
    expect(res.statusCode).toBe(400);
    expect(patchBody(calls)).toBeNull();
  });

  it('a failed write reports failure rather than claiming the conclusion was recorded', async () => {
    const calls = asMember({ patchOk: false });
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: WALTERS_INPUT }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBeUndefined();
    // NO PARTIAL STATE. One attempted write, no retry, and nothing else touched:
    // the resolution is a single PATCH, so a failure leaves the row exactly as
    // it was — which is what production showed after the UAT failure.
    const writes = calls.filter(c => c.method === 'PATCH' || c.method === 'POST');
    expect(writes.length).toBe(1);
    expect(writes[0].method).toBe('PATCH');
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
    stubFetch({ signingRequest: { sign_id: 's1', status: 'opened', expires_at: null,
                                  document: 'THE ISSUED RECORD', employee_name: 'Sam',
                                  org_id: 'org-1', manager_email: 'chair@acme.com',
                                  proceed_reason: 'internal reasoning', proceeded_by: 'user-uuid' } });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { signId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    // The participant gets the record and their own context...
    expect(res.body.document).toBe('THE ISSUED RECORD');
    expect(res.body.employee_name).toBe('Sam');
    // ...and NONE of the internal fields that used to ride along.
    for (const k of ['org_id', 'manager_email', 'proceed_reason', 'proceeded_by']) {
      expect(res.body, k).not.toHaveProperty(k);
    }
    // SIG-SEC-03 — the response is an ALLOW-LIST now. sign_id is withheld:
    // the participant already holds it in their own URL, and echoing internal
    // identifiers back over an unauthenticated link is what leaked
    // proceeded_by and proceed_reason. The document still arrives.
    expect(res.body.sign_id).toBeUndefined();
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
