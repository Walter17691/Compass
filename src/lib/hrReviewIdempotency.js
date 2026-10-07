// ─────────────────────────────────────────────────────────────────────────
// ONE PENDING HR REVIEW PER CASE PER STEP.
//
// ┌─ THE DEFECT THIS CLOSES (IR-0.2a) ──────────────────────────────────────┐
// │ requestHrReview() is a plain INSERT with status 'pending' and no         │
// │ idempotency check, and hr_review_requests carried only PRIMARY KEY (id). │
// │ So regenerating an investigation report on a case that already had a      │
// │ pending submission created a SECOND pending request for the same gate:    │
// │ HR saw the same investigation queued for review twice, with no way to     │
// │ tell which was current.                                                  │
// │                                                                         │
// │ Found during IR-0.2 pre-flight, BEFORE the human replacement UAT ran, on  │
// │ a case already holding inv_report/pending.                               │
// └─────────────────────────────────────────────────────────────────────────┘
//
// TWO LAYERS, AND BOTH ARE NEEDED.
//
//   This module   the check that lands first and shapes what the user sees:
//                 the existing request is REUSED, quietly and successfully.
//   The database  hr_review_requests_one_pending_per_step, a partial unique
//                 index, which is the only thing that can serialise two
//                 simultaneous submissions. Without it, two tabs both read
//                 "no pending request" and both insert.
//
// The index is partial on `status = 'pending'` because that is the only status
// meaning "awaiting HR" — every one of the six investigation review statuses is
// a terminal HR action. A unique index across all statuses would permanently
// block the legitimate cycle submit → pending → returned → revise → resubmit.
// ─────────────────────────────────────────────────────────────────────────

/** The one status that means "this gate is open and awaiting HR". */
export const HR_REVIEW_PENDING = 'pending';

/** PostgreSQL unique_violation. The index turning a race into a refusal. */
const UNIQUE_VIOLATION = '23505';

/** The index name, so a violation can be attributed rather than guessed at. */
export const PENDING_REVIEW_INDEX = 'hr_review_requests_one_pending_per_step';

/**
 * The open request for this gate, or null.
 *
 * Scoped to case + step + pending, deliberately. Not meeting_id: the gate is the
 * case's investigation submission, and a report regenerated from a different
 * meeting context is still the same gate.
 */
export function findPendingReview(requests, caseId, step) {
  if (!caseId || !step) return null;
  return (requests || []).find(r => r
    && r.case_id === caseId
    && r.step === step
    && r.status === HR_REVIEW_PENDING) || null;
}

export const HR_REVIEW_OUTCOME = Object.freeze({
  /** A new pending request was created. */
  CREATED: 'created',
  /** One already existed and was left exactly as it was. */
  REUSED: 'reused',
  /** The insert raced another and the database refused it — same as reused. */
  ALREADY_PENDING: 'already_pending',
  FAILED: 'failed',
});

/**
 * Is this error the database refusing a duplicate pending request?
 *
 * Matched on the SQLSTATE, with the index name as corroboration where the
 * driver supplies it. A unique violation from some OTHER constraint must not be
 * swallowed as "already pending" — that would hide a real failure.
 */
export function isDuplicatePendingViolation(error) {
  if (!error) return false;
  const code = error.code || error.status || '';
  if (String(code) !== UNIQUE_VIOLATION) return false;
  const text = `${error.message || ''} ${error.details || ''} ${error.constraint || ''}`;
  // If the driver names a constraint at all, it must be ours.
  if (/hr_review_requests_|_pending_per_step/.test(text)) return true;
  return !/_pkey|_key\b/.test(text);
}

/**
 * Should a request be inserted at all?
 *
 * Pure, so the decision is testable without a database. Returns the existing
 * request when there is one, which the caller reuses rather than replacing —
 * preserving its id, requester, timestamp and snapshot untouched.
 */
export function planHrReviewRequest({ requests, caseId, step } = {}) {
  const existing = findPendingReview(requests, caseId, step);
  return existing
    ? Object.freeze({ shouldInsert: false, outcome: HR_REVIEW_OUTCOME.REUSED, existing })
    : Object.freeze({ shouldInsert: true, outcome: HR_REVIEW_OUTCOME.CREATED, existing: null });
}
