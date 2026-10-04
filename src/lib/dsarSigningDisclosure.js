// ─────────────────────────────────────────────────────────────────────────
// WHAT A SIGNATURE REQUEST DISCLOSES, AND TO WHICH SUBJECT.
//
// signing_requests rows reach a DSAR when the subject is EITHER the signer
// (employee_name) OR the person who sent it (manager_name). Those two subjects
// are entitled to very different things from the same row, and until now both
// got the whole row:
//
//   · the SIGNER is entitled to their own copy of the document, their own
//     signature, their own decline reason and their own comments. All of it is
//     their personal data and they should have it.
//
//   · the MANAGER is entitled to the procedural facts — that they sent this
//     document, when, and what happened to it. They are NOT entitled, by virtue
//     of a DSAR about themselves, to the other person's signature image, the
//     other person's words, or a record that is substantively about the other
//     person. Receiving it is third-party disclosure.
//
// ┌─ PRE-EXISTING LEAK CLOSED HERE ─────────────────────────────────────────┐
// │ The manager-matched branch already disclosed `document`, `signature` and  │
// │ `decline_reason` — the employee's record, the employee's handwriting and  │
// │ the employee's stated reason — into a DSAR response about the MANAGER.    │
// │ That predates this slice. It is fixed here rather than left alone because │
// │ this module is the mechanism that decides it, and adding the new          │
// │ participant_comment field to a leaking projection would have widened a    │
// │ known leak.                                                             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// FAIL-CLOSED, like dsarCaseDisclosure and dsarAllegationDisclosure: an
// unrecognised column is withheld AND reported, so a column added later cannot
// be disclosed to anybody by default.
// ─────────────────────────────────────────────────────────────────────────

const isPlainText = v => typeof v === "string" && v.trim() !== "";

// A. Procedural facts about the document itself. Both subjects get these: they
//    describe an exchange both people took part in.
const SHARED_DISCLOSE = Object.freeze([
  "sign_id", "meeting_type", "meeting_date", "document_type", "status",
  "created_at", "opened_at", "expires_at", "signed_at", "declined_at",
  // Pre-V1 Trust Slice. That the organisation proceeded without confirmation,
  // and when, and from what state, is a procedural fact about the subject's own
  // process — arguably the single most important one for them to know.
  "proceeded_at", "proceeded_from_status",
]);

// B. Role names both already know. Names only, never the matching email.
const SHARED_DISCLOSE_ROLE_NAMES = Object.freeze(["manager_name"]);

// C. The signer's own personal data. Disclosed to the SIGNER only.
const SIGNER_ONLY_DISCLOSE = Object.freeze([
  "document",            // the exact text they were given
  "signature",           // their own handwriting
  "decline_reason",      // their own stated reason
  "participant_comment", // their own words about the record
  "participant_comment_at",
  "employee_name", "employee_email",
]);

// D. Genuinely arguable: HR's own reasoning. Surfaced to the human reviewer with
//    a reason, exactly as cases.outcomeNotes and the Slice 2 conclusion
//    reasoning already are. Never auto-disclosed to anybody.
const REVIEW_REQUIRED = Object.freeze(["proceed_reason"]);

const REVIEW_REASONS = Object.freeze({
  proceed_reason:
    "The organisation's stated reason for continuing without this person's confirmation. The fact that it proceeded, and when, is included; this is the reasoning behind that decision, which is a judgement call in the same way HR's outcome reasoning is.",
});

// E. Internal provenance and third-party contact details. Never disclosed.
const WITHHELD_INTERNAL = Object.freeze([
  "id", "org_id",
  "manager_email",   // a contact detail, not a fact about the subject
  "proceeded_by",    // an internal actor id, as case_decisions.decided_by already is
  "requires_signature",
]);

export { SHARED_DISCLOSE, SHARED_DISCLOSE_ROLE_NAMES, SIGNER_ONLY_DISCLOSE, REVIEW_REQUIRED, WITHHELD_INTERNAL };

/**
 * Project one signing request for one subject.
 *
 * @param {object} row
 * @param {object} opts
 * @param {boolean} opts.subjectIsSigner  true when the DSAR subject is the
 *        person who was asked to sign. When false the subject reached this row
 *        only as the sender, and the signer's own material is withheld.
 */
export function disclosableSigningRequest(row, { subjectIsSigner = false } = {}) {
  if (!row || typeof row !== "object") return null;

  const out = {};
  SHARED_DISCLOSE.forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });
  SHARED_DISCLOSE_ROLE_NAMES.forEach(k => { if (isPlainText(row[k])) out[k] = row[k]; });

  const withheld = [];
  const addWithheld = k => {
    const v = row[k];
    const empty = v === undefined || v === null || v === "";
    if (!empty) withheld.push(k);
  };
  WITHHELD_INTERNAL.forEach(addWithheld);

  if (subjectIsSigner) {
    SIGNER_ONLY_DISCLOSE.forEach(k => { if (row[k] !== undefined && row[k] !== null) out[k] = row[k]; });
  } else {
    // Withheld AND reported, so the reviewer can see that the row carried the
    // other person's material and that Compass did not send it.
    SIGNER_ONLY_DISCLOSE.forEach(addWithheld);
  }

  const reviewRequired = [];
  REVIEW_REQUIRED.forEach(k => {
    if (isPlainText(row[k])) reviewRequired.push({ field: k, reason: REVIEW_REASONS[k] });
  });

  const known = new Set([
    ...SHARED_DISCLOSE, ...SHARED_DISCLOSE_ROLE_NAMES, ...SIGNER_ONLY_DISCLOSE,
    ...REVIEW_REQUIRED, ...WITHHELD_INTERNAL,
  ]);
  const unrecognised = Object.keys(row).filter(k => !known.has(k));

  return {
    ...out,
    subjectRole: subjectIsSigner ? "signer" : "sender",
    withheldAsThirdPartyOrInternal: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: unrecognised,
  };
}

/** Aggregate for the reviewer banner, same shape as the sibling summarisers. */
export function summariseSigningDisclosure(disclosed = []) {
  const withheld = new Set();
  const unrecognised = new Set();
  const review = [];
  disclosed.forEach(d => {
    if (!d) return;
    (d.withheldAsThirdPartyOrInternal || []).forEach(f => withheld.add(f));
    (d.unrecognisedFieldsWithheld || []).forEach(f => unrecognised.add(f));
    (d.reviewRequired || []).forEach(r => review.push({ signId: d.sign_id, ...r }));
  });
  return {
    withheldFields: [...withheld].sort(),
    unrecognisedFieldsWithheld: [...unrecognised].sort(),
    reviewRequired: review,
  };
}
