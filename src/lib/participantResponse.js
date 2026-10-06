import { isTerminalStatus, isParticipantResponse, isExpired } from './eSignature.js';

// ─────────────────────────────────────────────────────────────────────────
// ONE AUTHORITY FOR "MAY THIS PARTICIPANT STILL RESPOND?"
//
// ┌─ THE DEFECT THIS CLOSES (SIG-SEC-01, HIGH; SIG-SEC-02) ─────────────────┐
// │ Compass had TWO participant-response implementations with different      │
// │ safety semantics:                                                       │
// │                                                                         │
// │   api/signing.js          the emailed-link path. Rejects terminal        │
// │                           statuses, rejects superseded requests, checks   │
// │                           expiry, and folds the not-yet-answered test     │
// │                           INTO the UPDATE's own WHERE clause so the       │
// │                           read-check-write is atomic under row locking.   │
// │                                                                         │
// │   api/portal/_signatures.js  the employee-portal path. Rejected only      │
// │                           signed | acknowledged | declined — so a         │
// │                           SUPERSEDED request was still signable, and so   │
// │                           were `disputed` and `proceeded`. And it read    │
// │                           then wrote, with no conditional update, so two  │
// │                           competing responses could both succeed and      │
// │                           leave a self-contradictory row.                │
// │                                                                         │
// │ Slice 1b closed the superseded-link hole — "an older request stayed live  │
// │ and SIGNABLE, and because the client polls only meeting.signId that       │
// │ signature would never appear in Compass" — and never generalised it to    │
// │ the portal. A real participant response, invisible to the case, through   │
// │ the second door.                                                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So the rule lives here once, and both paths ask it. Two subtly different
// implementations of one safety question is the defect, not the symptom.
// ─────────────────────────────────────────────────────────────────────────

export const RESPONSE_REFUSAL = Object.freeze({
  NOT_FOUND: 'not_found',
  /** A newer request replaced this one. Slice 1b's invariant. */
  SUPERSEDED: 'superseded',
  /** Already signed / acknowledged / declined / disputed / expired / proceeded. */
  ALREADY_ACTIONED: 'already_actioned',
  /** The link's lifetime has elapsed. */
  EXPIRED: 'expired',
});

/**
 * The only statuses from which a participant may still respond.
 *
 * `pending` is EXCLUDED deliberately. It predates this vocabulary (27 production
 * rows) and the emailed-link path has never accepted a response from it — its
 * UPDATE has always been `status=in.(sent,opened)`. Including it here to be
 * generous would silently widen the main path, which is the opposite of parity.
 */
export const ACTIONABLE_STATUSES = Object.freeze(['sent', 'opened']);

/** The PostgREST filter both paths must use, so the check cannot be bypassed. */
export const ACTIONABLE_FILTER = `status=in.(${ACTIONABLE_STATUSES.join(',')})&superseded_at=is.null`;

/**
 * May this stored request still receive a participant response?
 *
 * Returns { ok: true } or { ok: false, refusal, httpStatus, error }.
 *
 * ORDER MATTERS. Supersession is reported before "already actioned" because it
 * is the more accurate thing to tell someone holding an old link: the document
 * was replaced, not already answered. Expiry is checked last so a terminal
 * request reports what the participant actually did rather than that time ran
 * out on it.
 */
export function assessParticipantResponse(existing, { now = new Date() } = {}) {
  if (!existing) {
    return { ok: false, refusal: RESPONSE_REFUSAL.NOT_FOUND, httpStatus: 404, error: 'Signing request not found' };
  }
  if (existing.superseded_at) {
    return {
      ok: false, refusal: RESPONSE_REFUSAL.SUPERSEDED, httpStatus: 409,
      error: 'This document has been replaced by a newer version. Please use the most recent link you were sent.',
    };
  }
  if (isTerminalStatus(existing.status) || isParticipantResponse(existing.status)) {
    return { ok: false, refusal: RESPONSE_REFUSAL.ALREADY_ACTIONED, httpStatus: 409, error: 'This document has already been actioned' };
  }
  if (!ACTIONABLE_STATUSES.includes(existing.status)) {
    return { ok: false, refusal: RESPONSE_REFUSAL.ALREADY_ACTIONED, httpStatus: 409, error: 'This document is not awaiting a response' };
  }
  if (isExpired(existing.expires_at, now)) {
    // 409, matching the emailed-link path's long-standing behaviour. The portal
    // used 400; standardising on the PUBLIC page's code keeps sign.html's
    // handling untouched, and a lapsed link is a conflict with the current state
    // rather than a malformed request.
    return { ok: false, refusal: RESPONSE_REFUSAL.EXPIRED, httpStatus: 409, error: 'This signing link has expired' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// PARTICIPANT TIMESTAMPS ARE SERVER-DERIVED (SIG-SEC-05)
//
// `signedAt` arrived in the anonymous POST body, so the holder of a link chose
// the evidential timestamp on their own signature. Nothing stopped a backdated
// or forward-dated value, and the audit trail inherited it.
//
// For NEW responses the server times them. Historical values are untouched and
// are NOT retroactively re-attested — 62 production signatures carry
// client-supplied times and must keep saying so.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the patch for a participant response. Pure, so both API paths produce
 * byte-identical shapes and a test can compare them.
 *
 * `outcome` is one of signed | acknowledged | declined | disputed.
 */
export function participantResponsePatch(outcome, { signature = null, declineReason = '', comment = '', responseType = null, proposedCorrection = '', now = new Date() } = {}) {
  const at = now.toISOString();
  const patch = outcome === 'declined'
    ? { status: 'declined', declined_at: at, decline_reason: declineReason || '' }
    // A dispute carries no signature and no signed_at: nothing was agreed. The
    // only thing that happened is the comment, and it is timed below.
    : outcome === 'disputed'
      ? { status: 'disputed' }
      : { status: outcome, signature: signature || null, signed_at: at };
  const text = typeof comment === 'string' ? comment.trim() : '';
  if (text) {
    patch.participant_comment = text;
    patch.participant_comment_at = at;
  }
  // TRUST-SIG-03 — what the employee said about ACCURACY, a separate axis from
  // what they did about signing. Written only when the page actually classified
  // it: an older cached build sends nothing, and a signature must never be lost
  // because a new field was missing, so NULL stays a valid answer.
  if (responseType) {
    patch.response_type = responseType;
    const correction = typeof proposedCorrection === 'string' ? proposedCorrection.trim() : '';
    // Scoped by signing_requests_proposed_correction_scope as well as here: a
    // correction only means anything against a challenge.
    if (correction && responseType === 'disputed') patch.proposed_correction = correction;
  }
  return patch;
}
