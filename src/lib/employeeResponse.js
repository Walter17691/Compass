// ─────────────────────────────────────────────────────────────────────────
// WHAT THE EMPLOYEE SAID ABOUT THE ACCURACY OF THE RECORD.
//
// ┌─ WHY THIS IS A NEW AXIS AND NOT A NEW STATUS ───────────────────────────┐
// │ Today `status` conflates two different questions. 'disputed' writes NO    │
// │ signature at all (api/signing.js builds `{ status: 'disputed' }` and       │
// │ deliberately omits signature and signed_at, because "nothing was           │
// │ agreed"). So "I confirm I received this AND I think paragraph three is     │
// │ wrong" is NOT REPRESENTABLE: signing and disputing are mutually exclusive. │
// │                                                                         │
// │ That is the defect TRUST-SIG-03 exists to close, and the brief is right    │
// │ that a meeting record must never become a false binary of                 │
// │ SIGNED = AGREED or COMMENT = DISPUTED.                                   │
// │                                                                         │
// │ So `status` keeps meaning ONE thing — what the participant did about       │
// │ SIGNING — and accuracy becomes its own fact:                              │
// │                                                                         │
// │   status        signed | acknowledged | declined | disputed | …           │
// │   response_type accurate | comment | disputed        ← THIS MODULE        │
// │                                                                         │
// │ status='signed' + response_type='disputed' now says exactly what the      │
// │ employee meant. No status value is added, the CHECK is untouched, every   │
// │ existing reader keeps working, and NOT ONE historical row changes meaning: │
// │ response_type NULL means "never classified", which is the truth for all    │
// │ 105 of them.                                                             │
// │                                                                         │
// │ The standalone 'disputed' STATUS also stays valid and unchanged — it is    │
// │ still what a participant who responds WITHOUT signing produces.           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NO INFERENCE FROM TEXT. A historical comment is never reclassified by reading
// it. The Sam Testcase record keeps reading "Signed with comments" because that
// is all its data supports.
// ─────────────────────────────────────────────────────────────────────────

export const RESPONSE_TYPE = Object.freeze({
  /** "Yes, this is an accurate record." */
  ACCURATE: 'accurate',
  /** "Broadly accurate, but I want to add something." Not a dispute. */
  COMMENT: 'comment',
  /** "I believe something is inaccurate or missing." */
  DISPUTED: 'disputed',
});

export const RESPONSE_TYPES = Object.freeze(Object.values(RESPONSE_TYPE));

/** Unclassified — every pre-TRUST-SIG-03 row, and anything we cannot know. */
export function isClassified(row) {
  return RESPONSE_TYPES.includes(row?.response_type ?? row?.responseType);
}

export function responseTypeOf(row) {
  const t = row?.response_type ?? row?.responseType;
  return RESPONSE_TYPES.includes(t) ? t : null;
}

/**
 * Does this response challenge the accuracy of the record?
 *
 * ONLY an explicit classification counts. A free-text comment on an
 * unclassified historical row is NOT a dispute, however it reads.
 */
export function challengesAccuracy(row) {
  return responseTypeOf(row) === RESPONSE_TYPE.DISPUTED;
}

/** Did the employee positively confirm the record reads accurately? */
export function confirmsAccuracy(row) {
  return responseTypeOf(row) === RESPONSE_TYPE.ACCURATE;
}

// ─────────────────────────────────────────────────────────────────────────
// THE EMPLOYER'S RESOLUTION OF A CHALLENGE.
//
// Neither side may make the other disappear. The employee cannot rewrite the
// employer's notes, and the employer cannot delete the employee's response. Both
// are evidential records, so a resolution is a THIRD artefact recorded alongside
// them — never an edit to either.
// ─────────────────────────────────────────────────────────────────────────

export const RESOLUTION = Object.freeze({
  /** The employee was right; the correction is adopted as an addendum. */
  CORRECTION_ACCEPTED: 'correction_accepted',
  /** Some of it is adopted. Requires an explanation of which parts and why. */
  PARTIALLY_ACCEPTED: 'partially_accepted',
  /** The record stands as written. Requires an explanation. */
  ORIGINAL_RETAINED: 'original_retained',
  /** Nothing was wrong, but something is added for clarity. */
  ADDENDUM_ADDED: 'addendum_added',
});

export const RESOLUTIONS = Object.freeze(Object.values(RESOLUTION));

/**
 * Which resolutions must carry a written explanation?
 *
 * ALL OF THEM. TRUST-SIG-03 originally carved out a straightforward full
 * acceptance on the reasoning that agreeing with the employee needs no
 * justification. The UAT brief then asked, under VALIDATION, that a manager
 * rationale be non-empty and trimmed for a RECORDED RESOLUTION — no exception —
 * and the stricter rule is the right one: every resolution changes the
 * authoritative reading of someone's employment record, and "we accepted it"
 * without a sentence saying what was accepted is the one case where the reader a
 * year later has the least to go on.
 *
 * The DB CHECK (signing_requests_resolution_complete) is still laxer here: it
 * exempts correction_accepted. That is deliberate and safe — the constraint is a
 * BACKSTOP, this is the gate, and the API is the only writer. Tightening the
 * constraint to match would need a migration for no behavioural gain; it is
 * noted rather than done.
 */
export function resolutionNeedsReason(resolution) {
  return RESOLUTIONS.includes(resolution);
}

/** Does this resolution produce employer-authored text attached to the record? */
export function resolutionCarriesAddendum(resolution) {
  return resolution === RESOLUTION.CORRECTION_ACCEPTED
      || resolution === RESOLUTION.PARTIALLY_ACCEPTED
      || resolution === RESOLUTION.ADDENDUM_ADDED;
}

export function isResolved(row) {
  return RESOLUTIONS.includes(row?.response_resolution ?? row?.responseResolution);
}

/**
 * Is a challenge outstanding — raised and not yet reviewed?
 *
 * This is the one question process guidance needs, and it is deliberately
 * narrow: an unclassified comment is not outstanding work, and a resolved
 * challenge is not either.
 */
export function awaitsEmployerReview(row) {
  return challengesAccuracy(row) && !isResolved(row);
}

export const RESOLUTION_LABEL = Object.freeze({
  [RESOLUTION.CORRECTION_ACCEPTED]: 'Correction accepted',
  [RESOLUTION.PARTIALLY_ACCEPTED]: 'Partially accepted',
  [RESOLUTION.ORIGINAL_RETAINED]: 'Original record retained',
  [RESOLUTION.ADDENDUM_ADDED]: 'Clarification added',
});

export function resolutionLabel(resolution) {
  return RESOLUTION_LABEL[resolution] || null;
}

/**
 * The manager-facing ROW badge once a challenge has been reviewed.
 *
 * ┌─ WHY THE WORD "DISPUTED" STAYS ─────────────────────────────────────────┐
 * │ The row previously kept saying "Signed — notes disputed" after review,   │
 * │ which was wrong — it implied outstanding work. The obvious correction,    │
 * │ "Reviewed — partially accepted", is also wrong: it drops the historical   │
 * │ fact that the employee challenged this record, and a manager scanning the │
 * │ Meetings tab would see no sign it was ever contested.                    │
 * │                                                                         │
 * │ So the badge keeps BOTH. The resolution value entails that review        │
 * │ happened — nothing can be partially accepted without being reviewed — so  │
 * │ one line carries three facts with no redundant word:                     │
 * │                                                                         │
 * │   it was challenged · review is complete · what was concluded            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * An EXPLICIT map, not `Disputed — ${label.toLowerCase()}`. Lowercasing a
 * display string is the kind of derivation that breaks silently the first time a
 * label contains a proper noun. A test asserts every RESOLUTION has an entry, so
 * a fifth resolution cannot ship without a badge.
 */
export const RESOLVED_DISPUTE_BADGE = Object.freeze({
  [RESOLUTION.CORRECTION_ACCEPTED]: 'Disputed — correction accepted',
  [RESOLUTION.PARTIALLY_ACCEPTED]: 'Disputed — partially accepted',
  [RESOLUTION.ORIGINAL_RETAINED]: 'Disputed — original record retained',
  [RESOLUTION.ADDENDUM_ADDED]: 'Disputed — clarification added',
});

/**
 * The badge for a reviewed challenge, or null if there is no recorded resolution.
 *
 * Reads the stored token and never renames it. An unrecognised value returns null
 * so the caller falls back to the unresolved wording rather than inventing a
 * label for a state Compass does not understand.
 */
export function resolvedDisputeBadge(row) {
  const resolution = row?.response_resolution ?? row?.responseResolution;
  return RESOLVED_DISPUTE_BADGE[resolution] || null;
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDATION — one definition, used by the API and by the tests.
// ─────────────────────────────────────────────────────────────────────────

const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Is this a well-formed employee response?
 *
 * B and C both REQUIRE words: a classification with nothing behind it tells the
 * employer less than no classification at all. C additionally requires a
 * proposed correction, because "something is wrong" that does not say what it
 * should say cannot be reviewed.
 */
export function validateEmployeeResponse({ responseType, comment, proposedCorrection } = {}) {
  if (responseType === undefined || responseType === null || responseType === '') {
    // Unclassified is permitted: the public page may be an older cached build,
    // and a signature must never be lost because a new field was missing.
    return { ok: true, responseType: null };
  }
  if (!RESPONSE_TYPES.includes(responseType)) {
    return { ok: false, error: 'Unrecognised response.' };
  }
  if (responseType === RESPONSE_TYPE.ACCURATE) return { ok: true, responseType };
  if (!trimmed(comment)) {
    return {
      ok: false,
      error: responseType === RESPONSE_TYPE.DISPUTED
        ? 'Please say what you believe is inaccurate or missing.'
        : 'Please say what you would like to add.',
    };
  }
  if (responseType === RESPONSE_TYPE.DISPUTED && !trimmed(proposedCorrection)) {
    return { ok: false, error: 'Please say what the record should say instead.' };
  }
  return { ok: true, responseType };
}

/** Is this a well-formed employer resolution? */
export function validateResolution({ resolution, reason, addendum } = {}) {
  if (!RESOLUTIONS.includes(resolution)) return { ok: false, error: 'Choose how this response is resolved.' };
  if (resolutionNeedsReason(resolution) && !trimmed(reason)) {
    return { ok: false, error: 'Record why you have reached this conclusion.' };
  }
  if (resolution === RESOLUTION.ADDENDUM_ADDED && !trimmed(addendum)) {
    return { ok: false, error: 'Write the clarification to add to the record.' };
  }
  return { ok: true };
}

/**
 * The patch recording a resolution.
 *
 * Actor and time are passed in from the SERVER's verified session and clock —
 * never from a request body, the same rule proceed-without-confirmation follows.
 *
 * It writes NO change to `document`, `participant_comment` or
 * `proposed_correction`. The original record and the employee's words are
 * untouchable here by construction, not by convention.
 */
export function resolutionPatch({ resolution, reason = '', addendum = '', actorId, now = new Date() } = {}) {
  return {
    response_resolution: resolution,
    response_resolution_reason: trimmed(reason) || null,
    response_addendum: resolutionCarriesAddendum(resolution) ? (trimmed(addendum) || null) : null,
    response_resolved_by: actorId,
    response_resolved_at: now.toISOString(),
  };
}
