// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — SAVING AN INVESTIGATION REPORT DRAFT.
//
// A SEPARATE MODULE FROM reportVersionGateway.js, DELIBERATELY. That module
// is the read choke point and its own governance test asserts it exports no
// write at all, so that adding one has to be a conscious act. This is that
// conscious act, and putting it here keeps the assertion true and meaningful
// instead of relaxing it the first time it fired.
//
// IT RE-CHECKS NO AUTHORISATION RULE, for the reason caseDecisionWrites.js
// gives: a second client-side copy of an authorisation rule is a rule that
// can drift, and the weaker copy always wins the argument in someone's head.
// Every precondition — authenticated human, assigned investigator or HR with
// a written reason, same organisation, expected base version, request
// identity — lives inside save_investigation_report_version(). The table also
// carries a RESTRICTIVE insert policy denying every direct write, so a client
// that skipped this module entirely would be refused 42501 by Postgres rather
// than succeeding quietly.
//
// IT SUPPLIES NO PROVENANCE. version_no, created_by, created_at, author_kind,
// org_id and every adoption column are derived server-side by the numbering
// trigger and the author guard. Sending them would invite the server to trust
// them, and the author guard overwrites them anyway.
//
// WHAT IT DOES OWN: turning a database error into a state the editor can act
// on. There are nine distinguishable outcomes and flattening any two of them
// loses something the investigator needs. "Someone else saved while you were
// writing" and "you are no longer the investigator on this case" both arrive
// as a refusal; one means reload and merge, the other means stop. Guessing
// between them in the UI is how work gets lost.
// ─────────────────────────────────────────────────────────────────────────

export const DRAFT_SAVE_RESULT = Object.freeze({
  /** Stored. Also the answer to a successful retry of a save that had already
   *  landed — the RPC returns the stored row either way, and the client
   *  genuinely cannot tell the two apart, so this does not pretend to. */
  OK: 'ok',
  /** 40001. Another version was saved from the same base. The local draft is
   *  kept and the investigator decides; nothing is merged automatically. */
  STALE: 'stale',
  /** 22023 on the replay comparison. The request id was issued for a
   *  materially different request. A client defect, surfaced rather than
   *  swallowed, because the alternative is a save that silently did nothing. */
  REQUEST_REUSED: 'request_reused',
  /** 42501. Not the assigned investigator and not HR in this organisation —
   *  including access revoked since the editor was opened, and cross-tenant. */
  REFUSED: 'refused',
  /** check_violation naming the reason requirement. HR is saving on a case
   *  they are not the investigator for and must say why. */
  HR_REASON_REQUIRED: 'hr_reason_required',
  /** The case is gone. */
  CASE_MISSING: 'case_missing',
  /** Arguments the RPC refuses: blank body, absent request id, absent or
   *  negative base version, unrecognised source. Reachable only through a
   *  client defect; named so it reads as one. */
  INVALID: 'invalid',
  /** The RPC is not there. One expected cause: a deploy reaching browsers
   *  before the migration. Named so that window says "wait" rather than
   *  implying the draft failed. */
  UNAVAILABLE: 'unavailable',
  /** The call succeeded and returned something that is not a version row. The
   *  save may or may not have landed, so this is NOT treated as success. */
  MALFORMED: 'malformed',
  /** Transport failed. The save may or may not have landed; the same request
   *  id must be retried, which is exactly what it is for. */
  NETWORK: 'network',
  ERROR: 'error',
});

/** Outcomes where the save definitely did NOT store anything. */
const DEFINITELY_NOT_STORED = new Set([
  DRAFT_SAVE_RESULT.STALE,
  DRAFT_SAVE_RESULT.REQUEST_REUSED,
  DRAFT_SAVE_RESULT.REFUSED,
  DRAFT_SAVE_RESULT.HR_REASON_REQUIRED,
  DRAFT_SAVE_RESULT.CASE_MISSING,
  DRAFT_SAVE_RESULT.INVALID,
  DRAFT_SAVE_RESULT.UNAVAILABLE,
]);

/**
 * Is the outcome one where retrying the SAME request id is the correct move?
 *
 * Only where the result is genuinely unknown. A refusal or a stale base is a
 * known answer, and repeating it changes nothing; a dropped connection or an
 * unreadable response is not, and the request id exists so that repeating it
 * cannot create a second version.
 */
export function isUncertainOutcome(result) {
  return result === DRAFT_SAVE_RESULT.NETWORK
    || result === DRAFT_SAVE_RESULT.MALFORMED
    || result === DRAFT_SAVE_RESULT.ERROR;
}

export function didNotStore(result) {
  return DEFINITELY_NOT_STORED.has(result);
}

const RPC = 'save_investigation_report_version';

/** PostgREST reports a missing RPC as PGRST202; Postgres as 42883. Matched on
 *  the function name too, so that "column … does not exist" — a real schema
 *  bug — is not reported to the user as "Compass is finishing an update". */
export function isRpcMissing(error) {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const msg = error.message || '';
  return new RegExp(RPC).test(msg) && /could not find the function|does not exist/i.test(msg);
}

/** 40001 is serialization_failure, raised only by the staleness check. The
 *  message marker is matched as well because Supabase surfaces codes
 *  inconsistently across transports, and losing this distinction would turn a
 *  recoverable conflict into a generic failure. */
export function isStale(error) {
  if (!error) return false;
  return error.code === '40001' || /STALE_EDITOR/.test(error.message || '');
}

/** The replay comparison refused: this request id was issued for a different
 *  request. Distinguished from the other 22023s, which are malformed
 *  arguments, because the recovery differs — a new id versus a bug report. */
export function isRequestReused(error) {
  if (!error) return false;
  const msg = error.message || '';
  return /save request identifier/i.test(msg)
    && /already been used|was issued for/i.test(msg);
}

/** check_violation naming the HR reason requirement specifically. A blank body
 *  raises the same SQLSTATE and must not be reported as a missing reason. */
export function isHrReasonRequired(error) {
  if (!error) return false;
  return /requires a written reason/i.test(error.message || '');
}

/** 42501 is insufficient_privilege: every authority refusal in the RPC and in
 *  the author guard, including a revoked grant and a cross-tenant attempt. */
export function isRefused(error) {
  if (!error) return false;
  return error.code === '42501'
    || /assigned investigator|signed-in user|cannot author a report/i.test(error.message || '');
}

/** 23503 — the case does not exist (or is not visible as existing). */
export function isCaseMissing(error) {
  if (!error) return false;
  return error.code === '23503' || /case does not exist/i.test(error.message || '');
}

/** The remaining argument refusals. 22023 is invalid_parameter_value; 23514 is
 *  check_violation, which here means a blank body. */
export function isInvalidArgument(error) {
  if (!error) return false;
  if (error.code === '22023') return true;
  if (error.code === '23514' && /cannot be saved empty/i.test(error.message || '')) return true;
  return /must carry a request identifier|must state the version|cannot be negative|Unknown report source|cannot be saved empty/i
    .test(error.message || '');
}

/** A dropped or aborted request, as opposed to a refusal. Checked on thrown
 *  exceptions only, where there is no SQLSTATE to read. */
function looksLikeTransportFailure(err) {
  const msg = (err && (err.message || String(err))) || '';
  return /network|fetch|timeout|aborted|ECONN|socket|Load failed/i.test(msg);
}

/**
 * The returned row, or null if the response is not one.
 *
 * PostgREST returns a composite-returning function as a single object. A
 * one-element array is accepted too, because that is the other shape this has
 * been observed to take across transports, and rejecting it would report a
 * successful save as malformed. Anything without an id and a version number
 * is not a version, and saying so is safer than returning a half object the
 * editor would treat as proof the draft is stored.
 */
export function readSavedVersion(data) {
  const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  if (!row || typeof row !== 'object') return null;
  if (!row.id) return null;
  if (typeof row.version_no !== 'number') return null;
  return {
    id: row.id,
    caseId: row.case_id ?? null,
    orgId: row.org_id ?? null,
    versionNo: row.version_no,
    source: row.source || null,
    createdAt: row.created_at || null,
    createdBy: row.created_by ?? null,
    authorKind: row.author_kind || null,
    requestId: row.request_id ?? null,
    // A draft is never adopted at save time — the author guard forces these
    // null. Carried through so the editor can assert it rather than assume it.
    adoptedAt: row.adopted_at || null,
    isCurrent: !!row.is_current,
  };
}

/**
 * Save one immutable draft version.
 *
 * `requestId` must be a fresh client-generated uuid for each DISTINCT save,
 * and the SAME uuid for an exact retry of a save whose outcome is unknown.
 * The caller owns that lifecycle (see reportDraftSession.js); this function
 * simply passes it through, because a gateway that minted its own id would
 * make every retry a new save and defeat the whole mechanism.
 *
 * `expectedBaseVersion` is required and is not defaulted. A caller that omits
 * it would get last-write-wins, which is the defect the RPC exists to close,
 * so an absent value is refused here rather than being quietly turned into 0.
 */
export async function saveReportDraft({
  supabase, caseId, body, requestId, expectedBaseVersion,
  source = 'edited', hrReason = null,
} = {}) {
  if (!supabase) return { result: DRAFT_SAVE_RESULT.INVALID, reason: 'no_client' };
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    return { result: DRAFT_SAVE_RESULT.INVALID, reason: 'no_case' };
  }
  if (typeof requestId !== 'string' || requestId.trim() === '') {
    return { result: DRAFT_SAVE_RESULT.INVALID, reason: 'no_request_id' };
  }
  if (!Number.isInteger(expectedBaseVersion) || expectedBaseVersion < 0) {
    return { result: DRAFT_SAVE_RESULT.INVALID, reason: 'no_base_version' };
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return { result: DRAFT_SAVE_RESULT.INVALID, reason: 'empty_body' };
  }

  try {
    const { data, error } = await supabase.rpc(RPC, {
      p_case_id: caseId,
      p_body: body,
      p_request_id: requestId,
      p_expected_base_version: expectedBaseVersion,
      p_source: source,
      // Trimmed to null rather than sent as whitespace: the RPC treats blank
      // as absent, and sending '   ' would make the digest of a retry differ
      // from the digest of the save it is retrying.
      p_hr_reason: typeof hrReason === 'string' && hrReason.trim() !== '' ? hrReason.trim() : null,
    });

    if (error) {
      // Order matters. Stale and request-reuse are specific refusals that
      // would otherwise be swallowed by the broader authority test, and the
      // missing-RPC check runs before the generic error so a cutover window
      // is legible rather than looking like a failed save.
      if (isStale(error)) return { result: DRAFT_SAVE_RESULT.STALE, error };
      if (isRequestReused(error)) return { result: DRAFT_SAVE_RESULT.REQUEST_REUSED, error };
      if (isHrReasonRequired(error)) return { result: DRAFT_SAVE_RESULT.HR_REASON_REQUIRED, error };
      if (isCaseMissing(error)) return { result: DRAFT_SAVE_RESULT.CASE_MISSING, error };
      if (isRefused(error)) return { result: DRAFT_SAVE_RESULT.REFUSED, error };
      if (isInvalidArgument(error)) return { result: DRAFT_SAVE_RESULT.INVALID, error };
      if (isRpcMissing(error)) return { result: DRAFT_SAVE_RESULT.UNAVAILABLE, error };
      return { result: DRAFT_SAVE_RESULT.ERROR, error };
    }

    const version = readSavedVersion(data);
    if (!version) return { result: DRAFT_SAVE_RESULT.MALFORMED, data: data ?? null };
    return { result: DRAFT_SAVE_RESULT.OK, version };
  } catch (err) {
    if (looksLikeTransportFailure(err)) return { result: DRAFT_SAVE_RESULT.NETWORK, error: err };
    return { result: DRAFT_SAVE_RESULT.ERROR, error: err };
  }
}

/**
 * What to tell the investigator. Kept beside the result codes so a new code
 * cannot be added without someone deciding what it says.
 *
 * None of these messages tells anyone their work is gone, because in every
 * one of these states it is still in the editor.
 */
export function describeDraftSaveOutcome(result) {
  switch (result) {
    case DRAFT_SAVE_RESULT.OK:
      return null;
    case DRAFT_SAVE_RESULT.STALE:
      return 'Someone else saved a version of this report while you were writing. Your text is still here and has not been changed. Compare it with the latest version before saving again.';
    case DRAFT_SAVE_RESULT.REQUEST_REUSED:
      return 'Compass could not confirm this save because the request no longer matches the one it was started for. Your text is still here — save again to create a fresh attempt.';
    case DRAFT_SAVE_RESULT.REFUSED:
      return 'You do not have authority to save a report draft on this case. Your text is still here, but Compass cannot store it. Copy anything you need before leaving this page.';
    case DRAFT_SAVE_RESULT.HR_REASON_REQUIRED:
      return 'You are not the assigned investigator on this case, so saving requires a written reason. It is recorded in the case audit trail.';
    case DRAFT_SAVE_RESULT.CASE_MISSING:
      return 'This case is no longer available. Your text is still here — copy anything you need before leaving this page.';
    case DRAFT_SAVE_RESULT.INVALID:
      return 'Compass could not send this draft. Your text is still here. Please report this, as it indicates a fault rather than a problem with the report.';
    case DRAFT_SAVE_RESULT.UNAVAILABLE:
      return 'Compass is finishing an update and cannot save report drafts for a moment. Your text is still here — try again shortly.';
    case DRAFT_SAVE_RESULT.MALFORMED:
      return 'Compass could not confirm whether this draft saved. Your text is still here. Reload the report history to check before saving again.';
    case DRAFT_SAVE_RESULT.NETWORK:
      return 'Compass could not reach the server. Your text is still here, and trying again will not create a duplicate version.';
    default:
      return 'Compass could not save this draft. Your text is still here, and trying again will not create a duplicate version.';
  }
}
