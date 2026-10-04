// ─────────────────────────────────────────────────────────────────────────
// WHAT AN ALLEGATION DISCLOSES IN A SUBJECT ACCESS RESPONSE.
//
// Until now, nothing decided this. `allegations` is classified dsar: included at
// TABLE level and compileSubjectData passed `subjectAllegations` straight into
// the download — the raw in-memory rows, every field, including decidedBy,
// appealDecidedBy and createdBy, which are internal auth.users uuids. cases and
// meetings have had a per-field allow-list since the DSAR work began
// (dsarCaseDisclosure.js); allegations never did.
//
// That mattered the moment Slice 2 added four columns. investigation_conclusion_by
// is an internal actor id stored purely for provenance, and a table-level
// "included" would have published it. So this module exists.
//
// AN ALLOW-LIST, AND FAIL-CLOSED, for the same reason dsarCaseDisclosure is: a
// column added later must not be disclosed by default simply because nobody
// remembered this file. Anything unrecognised is withheld and REPORTED, so the
// next person sees the omission rather than inheriting a silent leak.
//
// ┌─ WHAT THIS SLICE DELIBERATELY DOES NOT CHANGE ──────────────────────────┐
// │ decision_reasoning — the DISCIPLINARY reasoning — keeps its existing     │
// │ treatment, auto-disclosed verbatim, even though cases.outcomeNotes (the  │
// │ same category of content at case level) is review-required and           │
// │ case_decisions.outcomeNotes is suppressed to a boolean. That asymmetry   │
// │ is real and is reported as a finding, not fixed here: the disciplinary   │
// │ side of the allegation is Slice 3, and changing its disclosure now would │
// │ couple this slice to that migration.                                     │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

const isPlainText = v => typeof v === "string" && v.trim() !== "";

// A. The subject's own record of what was alleged, what they said, and what the
//    process concluded procedurally. Disclosed.
//
//    investigationConclusion and investigationConclusionAt are here because the
//    employee is entitled to know whether their case was found to have a case to
//    answer and when that was decided — it is a procedural fact about their own
//    process, and it is the one thing in this field group that is not somebody's
//    private working note.
const ALLEGATION_DISCLOSE = Object.freeze([
  "id", "caseId", "title", "description", "period", "peopleInvolved",
  "status", "employeeResponse", "witnessEvidence",
  "investigationConclusion", "investigationConclusionAt",
  // Pre-existing treatment, unchanged by this slice — see the header note.
  "decisionReasoning", "decidedAt",
  "appealOutcome", "appealReasoning", "appealDecidedAt",
  "createdAt", "updatedAt",
]);

// B. Genuinely arguable. Disclosed by nobody automatically; surfaced to the
//    human reviewer with a reason, exactly as cases.outcomeNotes already is.
const ALLEGATION_REVIEW_REQUIRED = Object.freeze([
  "investigatorFinding",
  "outstandingUncertainty",
  "investigationConclusionReasoning",
]);

const REVIEW_REASONS = Object.freeze({
  investigatorFinding:
    "The investigator's own assessment of this allegation. It is working material rather than a decision communicated to the employee, and it often characterises other people's accounts. Review before disclosing.",
  outstandingUncertainty:
    "What the investigator recorded as still unresolved about this allegation. Internal working material, frequently about other people's evidence. Review before disclosing.",
  investigationConclusionReasoning:
    "The reasoning behind the investigation conclusion. The conclusion itself is included; this is the investigator's own reasoning for it, which is a judgement call in the same way HR's outcome reasoning is.",
});

// C. Internal provenance. Stored so the record can say who did what; of no
//    disclosure value to the subject, and naming internal actors to them is not
//    something any existing DSAR policy in this product requires.
//    case_decisions.decided_by is already suppressed on exactly this reasoning.
const ALLEGATION_WITHHELD_INTERNAL = Object.freeze([
  "orgId", "createdBy", "decidedBy", "appealDecidedBy", "investigationConclusionBy",
]);

export { ALLEGATION_DISCLOSE, ALLEGATION_REVIEW_REQUIRED, ALLEGATION_WITHHELD_INTERNAL };

/**
 * Project one allegation into what may be disclosed, plus the two reports the
 * reviewer needs: what was withheld as internal, and what needs their decision.
 */
export function disclosableAllegation(allegation) {
  if (!allegation || typeof allegation !== "object") return null;

  const out = {};
  ALLEGATION_DISCLOSE.forEach(k => { if (allegation[k] !== undefined) out[k] = allegation[k]; });

  const withheld = [];
  ALLEGATION_WITHHELD_INTERNAL.forEach(k => {
    const v = allegation[k];
    const empty = v === undefined || v === null || v === ""
      || (Array.isArray(v) && v.length === 0);
    if (!empty) withheld.push(k);
  });

  const reviewRequired = [];
  ALLEGATION_REVIEW_REQUIRED.forEach(k => {
    if (isPlainText(allegation[k])) {
      reviewRequired.push({ field: k, reason: REVIEW_REASONS[k] });
    }
  });

  const known = new Set([
    ...ALLEGATION_DISCLOSE, ...ALLEGATION_REVIEW_REQUIRED, ...ALLEGATION_WITHHELD_INTERNAL,
  ]);
  const unrecognised = Object.keys(allegation).filter(k => !known.has(k));

  return {
    ...out,
    withheldAsInternalAnalysis: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: unrecognised,
  };
}

/** Aggregate for the reviewer banner, shaped like summariseCaseDisclosure. */
export function summariseAllegationDisclosure(disclosedAllegations = []) {
  const internal = new Set();
  const unrecognised = new Set();
  const review = [];

  disclosedAllegations.forEach(a => {
    if (!a) return;
    (a.withheldAsInternalAnalysis || []).forEach(f => internal.add(f));
    (a.unrecognisedFieldsWithheld || []).forEach(f => unrecognised.add(f));
    (a.reviewRequired || []).forEach(r => review.push({ caseId: a.caseId, allegationId: a.id, ...r }));
  });

  return {
    internalFieldsWithheld: [...internal].sort(),
    unrecognisedFieldsWithheld: [...unrecognised].sort(),
    reviewRequired: review,
  };
}
