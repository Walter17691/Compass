// ─────────────────────────────────────────────────────────────────────────
// WHAT AN UNAUTHENTICATED LINK-HOLDER MAY SEE. AN ALLOW-LIST, NOT A DENY-LIST.
//
// ┌─ THE DEFECT THIS CLOSES (SIG-SEC-03) ───────────────────────────────────┐
// │ The public response was built by spreading the whole row and deleting two │
// │ keys:                                                                   │
// │                                                                         │
// │   const publicView = { ...existing, superseded: !!existing.superseded_at };│
// │   delete publicView.superseded_by_sign_id;                               │
// │   delete publicView.superseded_by;                                       │
// │                                                                         │
// │ So anyone holding a link received org_id, manager_email, meeting_id, and  │
// │ — worst — proceeded_by (an internal auth.users id) and proceed_reason,    │
// │ the manager's own written reasoning for proceeding WITHOUT the            │
// │ employee's confirmation. Internal deliberation, handed to an external     │
// │ recipient.                                                              │
// │                                                                         │
// │ The deny-list shape is the real fault: EVERY column added to this table   │
// │ in future was public by default. Four were added in the two slices        │
// │ before this one.                                                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So the default inverts: NEW COLUMN = NOT PUBLIC. A field reaches the
// participant only by being named here, and a contract test asserts that the
// live table has no column outside this list that is not explicitly withheld.
//
// THE LIST IS DERIVED FROM WHAT public/sign.html ACTUALLY READS, proven by
// reading the page rather than by guessing: data.document, document_type,
// employee_name, expires_at, manager_name, meeting_date, meeting_type,
// requires_signature, restricted, signature, signed_at, status, superseded.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Columns from signing_requests that the participant's own page needs.
 *
 * Each is here for a stated reason — if a reason cannot be written, the field
 * does not belong in a public response.
 */
export const PUBLIC_FIELDS = Object.freeze([
  'document',            // the record they are being asked to confirm
  'document_type',       // what kind of document it is, for the heading
  'employee_name',       // their own name, so they can see it is for them
  'manager_name',        // who sent it — a name, never the manager's address
  'meeting_type',        // which meeting
  'meeting_date',        // when
  'requires_signature',  // whether to ask for a signature or an acknowledgement
  'status',              // their own response state
  'signed_at',           // when they responded, for their own copy
  'signature',           // their own handwriting, for their own download
  'expires_at',          // how long they have
]);

/**
 * Fields the participant must NEVER receive, each with the reason.
 *
 * Kept as an explicit record rather than as "everything else" so that the
 * contract test can prove the live table is fully accounted for: any column
 * that is neither public nor listed here is a NEW column nobody has classified,
 * and the test fails rather than letting it default either way.
 */
export const WITHHELD_FIELDS = Object.freeze({
  id: 'internal primary key',
  sign_id: 'the participant already holds their own token; echoing it adds nothing',
  org_id: 'tenant identifier',
  meeting_id: 'internal meeting identity — the participant has no use for it',
  employee_email: 'already known to the recipient; no reason to echo an address back',
  manager_email: 'a contact detail belonging to someone else',
  created_at: 'internal request timing',
  opened_at: 'tracking data about the participant themselves',
  declined_at: 'covered by status; the exact instant is internal',
  decline_reason: 'their own words, but not re-served over an unauthenticated link',
  participant_comment: 'their own words, but not re-served over an unauthenticated link',
  participant_comment_at: 'as above',
  proceeded_at: 'an ORGANISATION decision, not a fact about the document they hold',
  proceeded_by: 'an internal auth.users id — SIG-SEC-03',
  proceed_reason: "the manager's internal reasoning for proceeding without them — SIG-SEC-03",
  proceeded_from_status: 'internal provenance of that decision',
  superseded_at: 'exposed only as the derived `superseded` boolean',
  superseded_by: 'an internal actor id',
  superseded_by_sign_id: "the successor's TOKEN",
  send_attempted_at: 'internal communication evidence',
  send_accepted_at: 'internal communication evidence',
  send_error: 'internal provider failure detail',
  provider_message_id: "the email provider's own id",
});

/**
 * Shape the participant-facing response.
 *
 * Builds UP from the allow-list. `superseded` is derived rather than passed
 * through, so the page can say "this was replaced" without learning when, by
 * whom, or with which token.
 */
export function publicSigningView(row) {
  if (!row) return null;
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  out.superseded = !!row.superseded_at;
  return out;
}

/** The reply once a finished request has passed its public viewing window. */
export function restrictedSigningView(row) {
  return { status: row?.status ?? null, restricted: true };
}
