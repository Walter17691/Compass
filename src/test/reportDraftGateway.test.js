import { describe, it, expect, vi } from 'vitest';
import {
  saveReportDraft, DRAFT_SAVE_RESULT, describeDraftSaveOutcome,
  readSavedVersion, isUncertainOutcome, didNotStore,
  isStale, isRequestReused, isRefused, isHrReasonRequired, isCaseMissing,
  isInvalidArgument, isRpcMissing,
} from '../lib/reportDraftGateway.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — EVERY WAY A SAVE CAN END, AND WHY THEY MUST STAY DISTINCT.
//
// Nine outcomes. Flattening any two loses something the investigator needs:
// "someone else saved while you were writing" and "you are no longer the
// investigator" both arrive as refusals, and guessing between them is how
// work gets lost. These tests assert each one is reachable and classified,
// using the ACTUAL error shapes the applied migration raises — the SQLSTATEs
// and messages were taken from the live rolled-back probes, not invented.
// ─────────────────────────────────────────────────────────────────────────

const RPC = 'save_investigation_report_version';

function client(response) {
  return { rpc: vi.fn().mockResolvedValue(response) };
}
function throwingClient(err) {
  return { rpc: vi.fn().mockRejectedValue(err) };
}

const good = {
  caseId: '18f32633-788d-4163-a893-1ef049acefac',
  body: '## Overall summary\n\nx',
  requestId: 'bbbbbbbb-0000-0000-0000-000000000001',
  expectedBaseVersion: 0,
};

const row = (over = {}) => ({
  id: '30c1c685-0000-0000-0000-000000000001',
  case_id: good.caseId,
  org_id: 'f381bfa6-7b27-497f-9af7-46a82c8f8f4c',
  version_no: 1,
  source: 'edited',
  created_at: '2026-10-10T19:00:00Z',
  created_by: 'fa50f9fe-e666-473e-ae0b-c3b80ec2835e',
  author_kind: 'user',
  request_id: good.requestId,
  adopted_at: null,
  is_current: false,
  ...over,
});

describe('B3.2-1 — a successful save', () => {
  it('returns the stored version and sends no provenance of its own', async () => {
    const c = client({ data: row(), error: null });
    const out = await saveReportDraft({ supabase: c, ...good });
    expect(out.result).toBe(DRAFT_SAVE_RESULT.OK);
    expect(out.version.versionNo).toBe(1);
    expect(out.version.adoptedAt).toBeNull();
    expect(out.version.isCurrent).toBe(false);

    const [name, args] = c.rpc.mock.calls[0];
    expect(name).toBe(RPC);
    expect(Object.keys(args).sort()).toEqual([
      'p_body', 'p_case_id', 'p_expected_base_version', 'p_hr_reason', 'p_request_id', 'p_source',
    ]);
    // version_no, created_by, created_at, author_kind, org_id and every
    // adoption column are the server's to decide.
    for (const forbidden of ['p_version_no', 'p_created_by', 'p_created_at', 'p_org_id', 'p_author_kind', 'p_adopted_at']) {
      expect(args).not.toHaveProperty(forbidden);
    }
  });

  it('sends the request id and base version exactly as given', async () => {
    const c = client({ data: row(), error: null });
    await saveReportDraft({ supabase: c, ...good, expectedBaseVersion: 7 });
    const args = c.rpc.mock.calls[0][1];
    expect(args.p_request_id).toBe(good.requestId);
    expect(args.p_expected_base_version).toBe(7);
    expect(args.p_source).toBe('edited');
  });

  it('trims an HR reason to null rather than sending whitespace, so a retry digests the same', async () => {
    const c = client({ data: row(), error: null });
    await saveReportDraft({ supabase: c, ...good, hrReason: '   ' });
    expect(c.rpc.mock.calls[0][1].p_hr_reason).toBeNull();

    const c2 = client({ data: row(), error: null });
    await saveReportDraft({ supabase: c2, ...good, hrReason: '  Investigator on leave  ' });
    expect(c2.rpc.mock.calls[0][1].p_hr_reason).toBe('Investigator on leave');
  });

  it('accepts a one-element array, the other shape this returns across transports', async () => {
    const out = await saveReportDraft({ supabase: client({ data: [row()], error: null }), ...good });
    expect(out.result).toBe(DRAFT_SAVE_RESULT.OK);
    expect(out.version.versionNo).toBe(1);
  });
});

describe('B3.2-1 — each refusal is classified from the error the migration actually raises', () => {
  const cases = [
    ['STALE', { code: '40001', message: 'STALE_EDITOR: this case is now at version 2, but this draft was started from version 1. Reload the report before saving, so the other author\'s version is not lost.' }, DRAFT_SAVE_RESULT.STALE],
    ['STALE without a code', { message: 'STALE_EDITOR: this case is now at version 2' }, DRAFT_SAVE_RESULT.STALE],
    ['request reused for different text', { code: '22023', message: 'That save request identifier has already been used for different report text. Start a new save, or reload the report to see what was stored.' }, DRAFT_SAVE_RESULT.REQUEST_REUSED],
    ['request reused for a different case', { code: '22023', message: 'That save request identifier has already been used for a different case. Start a new save.' }, DRAFT_SAVE_RESULT.REQUEST_REUSED],
    ['request reused with a materially different request', { code: '22023', message: 'That save request identifier has already been used for a materially different request. Start a new save.' }, DRAFT_SAVE_RESULT.REQUEST_REUSED],
    ['request issued for another base', { code: '22023', message: 'That save request identifier was issued for a draft started from version 0, not version 1. Reload the report and start a new save.' }, DRAFT_SAVE_RESULT.REQUEST_REUSED],
    ['HR reason required', { code: '23514', message: 'Saving a report draft as HR rather than the assigned investigator requires a written reason, which is recorded in the case audit trail' }, DRAFT_SAVE_RESULT.HR_REASON_REQUIRED],
    ['revoked access / not authorised', { code: '42501', message: "Only this case's assigned investigator, or HR under a documented exception, can save an investigation report draft" }, DRAFT_SAVE_RESULT.REFUSED],
    ['service-role authorship', { code: '42501', message: 'An investigation report draft must be saved by a signed-in user. An automated or service-role process cannot author a report.' }, DRAFT_SAVE_RESULT.REFUSED],
    ['case missing', { code: '23503', message: 'That case does not exist' }, DRAFT_SAVE_RESULT.CASE_MISSING],
    ['blank body', { code: '23514', message: 'An investigation report draft cannot be saved empty' }, DRAFT_SAVE_RESULT.INVALID],
    ['absent request id', { code: '22023', message: 'A save request must carry a request identifier, so that a retry can be told apart from a second edit.' }, DRAFT_SAVE_RESULT.INVALID],
    ['absent base version', { code: '22023', message: 'A save request must state the version it was started from, so that a save made against an out-of-date draft can be refused.' }, DRAFT_SAVE_RESULT.INVALID],
    ['unknown source', { code: '22023', message: 'Unknown report source ai_written' }, DRAFT_SAVE_RESULT.INVALID],
    ['RPC missing (PostgREST)', { code: 'PGRST202', message: 'Could not find the function public.save_investigation_report_version' }, DRAFT_SAVE_RESULT.UNAVAILABLE],
    ['RPC missing (Postgres)', { code: '42883', message: 'function save_investigation_report_version does not exist' }, DRAFT_SAVE_RESULT.UNAVAILABLE],
    ['something else entirely', { code: '08006', message: 'connection failure' }, DRAFT_SAVE_RESULT.ERROR],
  ];

  it.each(cases)('classifies %s', async (_label, error, expected) => {
    const out = await saveReportDraft({ supabase: client({ data: null, error }), ...good });
    expect(out.result).toBe(expected);
  });

  it('does not let the broad authority test swallow a stale save', () => {
    // 'assigned investigator' appears in the STALE message? No — but the
    // ordering is what protects this, so assert the predicates directly.
    const stale = { code: '40001', message: 'STALE_EDITOR: this case is now at version 2' };
    expect(isStale(stale)).toBe(true);
    expect(isRefused(stale)).toBe(false);
  });

  it('does not report a blank body as a missing HR reason, though both are check_violation', () => {
    const blank = { code: '23514', message: 'An investigation report draft cannot be saved empty' };
    expect(isHrReasonRequired(blank)).toBe(false);
    expect(isInvalidArgument(blank)).toBe(true);
  });

  it('does not report a real schema bug as "Compass is finishing an update"', () => {
    const schemaBug = { code: '42703', message: 'column "request_digest" does not exist' };
    expect(isRpcMissing(schemaBug)).toBe(false);
  });

  it('distinguishes a reused request id from an absent one, since recovery differs', () => {
    expect(isRequestReused({ code: '22023', message: 'That save request identifier has already been used for a different case. Start a new save.' })).toBe(true);
    expect(isRequestReused({ code: '22023', message: 'A save request must carry a request identifier' })).toBe(false);
  });

  it('CONTROL — every predicate returns false for a null error', () => {
    for (const p of [isStale, isRequestReused, isRefused, isHrReasonRequired, isCaseMissing, isInvalidArgument, isRpcMissing]) {
      expect(p(null)).toBe(false);
      expect(p(undefined)).toBe(false);
    }
  });
});

describe('B3.2-1 — an unknown outcome is never reported as success', () => {
  it('reports a malformed response as malformed, not OK', async () => {
    for (const data of [null, undefined, {}, { id: 'x' }, { version_no: 1 }, [row(), row()], 'ok', 42, []]) {
      const out = await saveReportDraft({ supabase: client({ data, error: null }), ...good });
      expect(out.result, JSON.stringify(data)).toBe(DRAFT_SAVE_RESULT.MALFORMED);
      expect(out.version).toBeUndefined();
    }
  });

  it('rejects a row whose version number is not a number', async () => {
    const out = await saveReportDraft({ supabase: client({ data: row({ version_no: '1' }), error: null }), ...good });
    expect(out.result).toBe(DRAFT_SAVE_RESULT.MALFORMED);
  });

  it('CONTROL — readSavedVersion accepts the real shape', () => {
    expect(readSavedVersion(row())?.versionNo).toBe(1);
  });

  it('reports a dropped connection as NETWORK, which is retryable with the same id', async () => {
    for (const msg of ['NetworkError when attempting to fetch resource', 'Failed to fetch', 'request timeout', 'The operation was aborted', 'Load failed']) {
      const out = await saveReportDraft({ supabase: throwingClient(new Error(msg)), ...good });
      expect(out.result, msg).toBe(DRAFT_SAVE_RESULT.NETWORK);
    }
  });

  it('reports an unrecognised thrown error as ERROR', async () => {
    const out = await saveReportDraft({ supabase: throwingClient(new Error('something odd')), ...good });
    expect(out.result).toBe(DRAFT_SAVE_RESULT.ERROR);
  });

  it('marks exactly the unknown outcomes as retryable with the same request id', () => {
    expect(isUncertainOutcome(DRAFT_SAVE_RESULT.NETWORK)).toBe(true);
    expect(isUncertainOutcome(DRAFT_SAVE_RESULT.MALFORMED)).toBe(true);
    expect(isUncertainOutcome(DRAFT_SAVE_RESULT.ERROR)).toBe(true);
    for (const r of [DRAFT_SAVE_RESULT.OK, DRAFT_SAVE_RESULT.STALE, DRAFT_SAVE_RESULT.REFUSED,
      DRAFT_SAVE_RESULT.REQUEST_REUSED, DRAFT_SAVE_RESULT.HR_REASON_REQUIRED,
      DRAFT_SAVE_RESULT.CASE_MISSING, DRAFT_SAVE_RESULT.INVALID, DRAFT_SAVE_RESULT.UNAVAILABLE]) {
      expect(isUncertainOutcome(r), r).toBe(false);
    }
  });

  it('knows which outcomes definitely stored nothing', () => {
    expect(didNotStore(DRAFT_SAVE_RESULT.STALE)).toBe(true);
    expect(didNotStore(DRAFT_SAVE_RESULT.REFUSED)).toBe(true);
    expect(didNotStore(DRAFT_SAVE_RESULT.NETWORK)).toBe(false);
    expect(didNotStore(DRAFT_SAVE_RESULT.OK)).toBe(false);
  });
});

describe('B3.2-1 — the gateway refuses to send an unsafe request', () => {
  it('will not send without a client, case, request id, base version or body', async () => {
    const bad = [
      [{ ...good, supabase: null }, 'no_client'],
      [{ supabase: client({}), ...good, caseId: '' }, 'no_case'],
      [{ supabase: client({}), ...good, caseId: null }, 'no_case'],
      [{ supabase: client({}), ...good, requestId: '' }, 'no_request_id'],
      [{ supabase: client({}), ...good, requestId: null }, 'no_request_id'],
      [{ supabase: client({}), ...good, expectedBaseVersion: null }, 'no_base_version'],
      [{ supabase: client({}), ...good, expectedBaseVersion: -1 }, 'no_base_version'],
      [{ supabase: client({}), ...good, expectedBaseVersion: 1.5 }, 'no_base_version'],
      [{ supabase: client({}), ...good, body: '   ' }, 'empty_body'],
      [{ supabase: client({}), ...good, body: null }, 'empty_body'],
    ];
    for (const [args, reason] of bad) {
      const out = await saveReportDraft(args);
      expect(out.result, reason).toBe(DRAFT_SAVE_RESULT.INVALID);
      expect(out.reason, reason).toBe(reason);
    }
  });

  it('never defaults a missing base version to 0, which would be last-write-wins', async () => {
    const c = client({ data: row(), error: null });
    await saveReportDraft({ supabase: c, ...good, expectedBaseVersion: undefined });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('accepts base version 0, which is a real base meaning "no versions yet"', async () => {
    const c = client({ data: row(), error: null });
    const out = await saveReportDraft({ supabase: c, ...good, expectedBaseVersion: 0 });
    expect(out.result).toBe(DRAFT_SAVE_RESULT.OK);
    expect(c.rpc.mock.calls[0][1].p_expected_base_version).toBe(0);
  });

  it('never throws, whatever the client does', async () => {
    const hostile = { rpc: () => { throw new TypeError('boom'); } };
    await expect(saveReportDraft({ supabase: hostile, ...good })).resolves.toBeTruthy();
  });
});

describe('B3.2-1 — no message tells the investigator their work is gone', () => {
  it('has a message for every non-OK outcome', () => {
    for (const r of Object.values(DRAFT_SAVE_RESULT)) {
      const m = describeDraftSaveOutcome(r);
      if (r === DRAFT_SAVE_RESULT.OK) { expect(m).toBeNull(); continue; }
      expect(typeof m, r).toBe('string');
      expect(m.length, r).toBeGreaterThan(20);
    }
  });

  it('says the text is still there on every recoverable failure', () => {
    for (const r of [DRAFT_SAVE_RESULT.STALE, DRAFT_SAVE_RESULT.REQUEST_REUSED, DRAFT_SAVE_RESULT.REFUSED,
      DRAFT_SAVE_RESULT.CASE_MISSING, DRAFT_SAVE_RESULT.INVALID, DRAFT_SAVE_RESULT.UNAVAILABLE,
      DRAFT_SAVE_RESULT.MALFORMED, DRAFT_SAVE_RESULT.NETWORK, DRAFT_SAVE_RESULT.ERROR]) {
      expect(describeDraftSaveOutcome(r), r).toMatch(/still here/i);
    }
  });

  it('promises a retry cannot duplicate, only where that is true', () => {
    expect(describeDraftSaveOutcome(DRAFT_SAVE_RESULT.NETWORK)).toMatch(/will not create a duplicate/i);
    expect(describeDraftSaveOutcome(DRAFT_SAVE_RESULT.STALE)).not.toMatch(/duplicate/i);
  });

  it('does not claim a stale save overwrote anything', () => {
    expect(describeDraftSaveOutcome(DRAFT_SAVE_RESULT.STALE)).toMatch(/has not been changed/i);
  });
});
