// ─────────────────────────────────────────────────────────────────────────
// WHAT COMPASS ACTUALLY KNOWS ABOUT HAVING COMMUNICATED A RECORD.
//
// ┌─ THE DEFECT THIS CLOSES (TRUST-SIG-02) ─────────────────────────────────┐
// │ `status` was written as 'sent' at INSERT time, before any email. The     │
// │ email was a separate call that persisted nothing. So a request that was   │
// │ never emailed was indistinguishable from one that was, and the UI said    │
// │ "Sent for confirmation — no response yet" either way.                    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// A SEPARATE AXIS, NOT A STATUS VALUE. Communication is not a stage of the
// participant's response — a request can be issued, provider-accepted, opened,
// disputed and later superseded all at once. Forcing those through one enum
// destroys the ability to say so. So `status` keeps its existing nine values and
// means only "where the participant's response stands", and this module is the
// ONLY reader of whether anything was actually communicated.
//
// THE CEILING ON WHAT MAY BE CLAIMED. Resend accepting a message says nothing
// about the recipient's mail server, so ACCEPTED is the strongest claim
// available. There is deliberately no DELIVERED and no RECEIVED here, and no
// column to put them in — a column invites someone to fill it from something
// weaker.
// ─────────────────────────────────────────────────────────────────────────

export const COMMUNICATION = Object.freeze({
  /** Historical rows: the fact was never recorded. NOT the same as "not sent". */
  UNKNOWN: 'unknown',
  /** A request exists and no send has been attempted. */
  NOT_ATTEMPTED: 'not_attempted',
  /** Compass called the provider and has not yet recorded an outcome. */
  ATTEMPTED: 'attempted',
  /** The provider took the message. The strongest claim Compass may make. */
  ACCEPTED: 'accepted',
  /** The provider or transport refused it. */
  FAILED: 'failed',
});

// Rows created before the 2026-10-06 migration carry no evidence columns at all.
// Their silence is UNKNOWN, not "not attempted": 62 of them were signed, so most
// plainly did arrive — Compass simply never wrote it down. Distinguishing the
// two is the whole point, and it is why nothing was backfilled.
// Read from EITHER shape. The signing_requests row is snake_case; the mirrored
// copy on cases.meetings[] is camelCase, the convention that jsonb has used
// since Release 1. One reader for both, so a renderer cannot accidentally get
// UNKNOWN just because it was handed the meeting rather than the request.
const field = (r, snake, camel) => (r[snake] !== undefined ? r[snake] : r[camel]);
const KEYS = [['send_attempted_at', 'sendAttemptedAt'], ['send_accepted_at', 'sendAcceptedAt'], ['send_error', 'sendError']];

const hasEvidenceColumns = r => !!r && KEYS.some(([sn, cm]) => sn in r || cm in r);

export function communicationEvidence(request) {
  if (!request) return COMMUNICATION.UNKNOWN;
  if (!hasEvidenceColumns(request)) return COMMUNICATION.UNKNOWN;
  if (field(request, 'send_accepted_at', 'sendAcceptedAt')) return COMMUNICATION.ACCEPTED;
  if (field(request, 'send_error', 'sendError')) return COMMUNICATION.FAILED;
  if (field(request, 'send_attempted_at', 'sendAttemptedAt')) return COMMUNICATION.ATTEMPTED;
  return COMMUNICATION.NOT_ATTEMPTED;
}

/**
 * May a surface say this record reached the participant?
 *
 * ONLY on provider acceptance. UNKNOWN is deliberately false: a historical row
 * that probably arrived still has no evidence, and "probably" is not something
 * an ER record should assert.
 */
export function mayClaimSent(request) {
  return communicationEvidence(request) === COMMUNICATION.ACCEPTED;
}

/** Does this request need the manager to do something about the SEND itself? */
export function needsSendAttention(request) {
  const e = communicationEvidence(request);
  return e === COMMUNICATION.FAILED || e === COMMUNICATION.NOT_ATTEMPTED;
}

// What a manager is told. Phrased as what Compass knows, never as what it hopes.
const COMMUNICATION_LINE = Object.freeze({
  [COMMUNICATION.UNKNOWN]: 'Compass has no record of whether this was emailed',
  [COMMUNICATION.NOT_ATTEMPTED]: 'Prepared — not yet emailed',
  [COMMUNICATION.ATTEMPTED]: 'Email attempted — no confirmation yet',
  [COMMUNICATION.ACCEPTED]: 'Email accepted by the provider',
  [COMMUNICATION.FAILED]: "Email could not be sent",
});

export function communicationLine(request) {
  const e = communicationEvidence(request);
  const base = COMMUNICATION_LINE[e] || COMMUNICATION_LINE[COMMUNICATION.UNKNOWN];
  const err = request && field(request, 'send_error', 'sendError');
  if (e === COMMUNICATION.FAILED && err) return `${base} — ${err}`;
  return base;
}

/** The patch recording a send attempt. Server-timed; never from a request body. */
export function sendAttemptPatch({ now = new Date() } = {}) {
  return { send_attempted_at: now.toISOString(), send_accepted_at: null, send_error: null, provider_message_id: null };
}

/**
 * The patch recording the outcome of that attempt.
 *
 * On acceptance the error is CLEARED, so a retry that succeeds leaves one
 * coherent current state rather than claiming both at once — which the
 * signing_requests_send_evidence_complete CHECK also refuses.
 */
export function sendOutcomePatch({ accepted, error = null, providerMessageId = null, now = new Date() } = {}) {
  if (accepted) {
    return { send_accepted_at: now.toISOString(), send_error: null, provider_message_id: providerMessageId || null };
  }
  return { send_accepted_at: null, send_error: String(error || 'Unknown send failure').slice(0, 500), provider_message_id: null };
}
