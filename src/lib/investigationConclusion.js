// ─────────────────────────────────────────────────────────────────────────
// THE STRUCTURED INVESTIGATION CONCLUSION.
//
// Compass used to ask one question — "is this allegation substantiated?" — and
// used the answer for two incompatible purposes: deciding whether the matter
// should go to a hearing, and deciding the matter itself. Slice 1 stopped asking
// the disciplinary question during the investigation. This is the question that
// belongs there instead.
//
// IT IS NOT A FINDING. Nothing here means proven, substantiated, upheld or
// guilty, and no copy in this module may imply it. "Case to answer" is a
// statement about whether there is enough to put to the employee at a hearing —
// it is the start of the disciplinary question, not the answer to it.
//
// THE ABSENCE OF A CONCLUSION IS NOT A CONCLUSION. All 949 allegations in
// production predate this field and hold null. `rollup` treats null as
// UNRESOLVED and refuses to let the case progress or close on that basis. It
// never guesses from status, investigator_finding, stage or outcome — the one
// inference this domain must never make.
// ─────────────────────────────────────────────────────────────────────────

export const INVESTIGATION_CONCLUSION = Object.freeze({
  CASE_TO_ANSWER: "case_to_answer",
  NO_CASE_TO_ANSWER: "no_case_to_answer",
  FURTHER_INVESTIGATION_REQUIRED: "further_investigation_required",
});

// The closed vocabulary, mirroring allegations_investigation_conclusion_check.
export const INVESTIGATION_CONCLUSION_VALUES = Object.freeze([
  INVESTIGATION_CONCLUSION.CASE_TO_ANSWER,
  INVESTIGATION_CONCLUSION.NO_CASE_TO_ANSWER,
  INVESTIGATION_CONCLUSION.FURTHER_INVESTIGATION_REQUIRED,
]);

export const isValidConclusion = v => INVESTIGATION_CONCLUSION_VALUES.includes(v);

// Plain explanatory copy. Each `meaning` says what proceeding does or does not
// follow — never whether the matter is made out.
//
// ── "THIS ISSUE", NOT "THIS ALLEGATION" (IR-REPORT-01a follow-up) ─────────
//
// This copy said "this allegation". An investigation may be opened on an
// incident, a concern or a fact-finding exercise before any allegation — or
// any individual — has been identified, and IR-REPORT-01a gave the assigned
// investigator a workspace that deliberately calls those rows "issues under
// investigation". Reaching the conclusion control and being told the decision
// concerns "this allegation" asserted an accusation the record may not
// contain, which is the one thing that workspace exists to avoid.
//
// "This issue" is accurate in BOTH directions: an allegation is an issue under
// investigation, so HR's own view of a genuine allegation reads correctly too.
// COPY ONLY — the three stored values, the CHECK constraint, the rollup states
// and every identifier are untouched, and the word "substantiated" still
// appears nowhere here.
export const INVESTIGATION_CONCLUSION_COPY = Object.freeze({
  [INVESTIGATION_CONCLUSION.CASE_TO_ANSWER]: Object.freeze({
    label: "Case to answer",
    meaning: "There is sufficient information for this issue to be considered at a disciplinary hearing.",
  }),
  [INVESTIGATION_CONCLUSION.NO_CASE_TO_ANSWER]: Object.freeze({
    label: "No case to answer",
    meaning: "The investigation does not identify sufficient grounds for this issue to proceed to a disciplinary hearing.",
  }),
  [INVESTIGATION_CONCLUSION.FURTHER_INVESTIGATION_REQUIRED]: Object.freeze({
    label: "Further investigation required",
    meaning: "More information is needed before deciding whether this issue should proceed.",
  }),
});

export const conclusionLabel = v => INVESTIGATION_CONCLUSION_COPY[v]?.label || null;
export const conclusionMeaning = v => INVESTIGATION_CONCLUSION_COPY[v]?.meaning || null;

// ─────────────────────────────────────────────────────────────────────────
// THE CASE-LEVEL ROLLUP.
//
// There is deliberately NO case-level conclusion field. A second field would be
// a second truth, and the two would drift. The case-level position is always
// computed from the allegations, so it cannot disagree with them.
// ─────────────────────────────────────────────────────────────────────────

export const ROLLUP = Object.freeze({
  // No allegations recorded at all. The conclusion model has nothing to say, so
  // the pre-Slice-2 behaviour stands unchanged. This is the non-regression path
  // for the great majority of historical cases.
  NO_ALLEGATIONS: "no_allegations",
  // At least one allegation has no conclusion. Unknown, therefore not complete.
  UNRESOLVED: "unresolved",
  // Every allegation is concluded and at least one needs more investigation.
  FURTHER_REQUIRED: "further_required",
  // Every allegation is concluded, none needs more investigation, at least one
  // has a case to answer.
  PROCEED_TO_DISCIPLINARY: "proceed_to_disciplinary",
  // Every allegation is concluded and every one has no case to answer.
  CLOSE_NO_CASE: "close_no_case",
});

/**
 * Derive the case-level position from this case's allegations.
 *
 * Precedence is fixed and ordered, because the states are not mutually
 * exclusive in the data and the safest reading must win:
 *
 *   1. any missing conclusion        -> UNRESOLVED        (blocks progression)
 *   2. any further_investigation     -> FURTHER_REQUIRED  (blocks progression)
 *   3. any case_to_answer            -> PROCEED
 *   4. all no_case_to_answer         -> CLOSE_NO_CASE
 *
 * Rule 1 before rule 3 is the fail-safe: a case with one "case to answer" and
 * one allegation nobody has concluded on must not progress on the strength of
 * the one that was answered.
 */
export function rollupInvestigationConclusions(allegations = []) {
  const list = Array.isArray(allegations) ? allegations : [];
  const total = list.length;

  if (total === 0) {
    return Object.freeze({
      state: ROLLUP.NO_ALLEGATIONS, total: 0, concluded: 0, unresolved: 0,
      counts: Object.freeze({}), canProceedToDisciplinary: false, canCloseNoCase: false,
      investigationComplete: false,
    });
  }

  const counts = {};
  let unresolved = 0;
  list.forEach(a => {
    const c = a?.investigationConclusion;
    if (isValidConclusion(c)) counts[c] = (counts[c] || 0) + 1;
    // An unrecognised stored value counts as unresolved rather than being
    // coerced into a known one. Fail safe, not fail convenient.
    else unresolved += 1;
  });

  const state =
    unresolved > 0 ? ROLLUP.UNRESOLVED
    : counts[INVESTIGATION_CONCLUSION.FURTHER_INVESTIGATION_REQUIRED] ? ROLLUP.FURTHER_REQUIRED
    : counts[INVESTIGATION_CONCLUSION.CASE_TO_ANSWER] ? ROLLUP.PROCEED_TO_DISCIPLINARY
    : ROLLUP.CLOSE_NO_CASE;

  return Object.freeze({
    state,
    total,
    concluded: total - unresolved,
    unresolved,
    counts: Object.freeze({ ...counts }),
    canProceedToDisciplinary: state === ROLLUP.PROCEED_TO_DISCIPLINARY,
    canCloseNoCase: state === ROLLUP.CLOSE_NO_CASE,
    // "The investigation has reached a position on every allegation." Used to
    // stop the product describing an investigation as finished when it is not.
    investigationComplete: unresolved === 0,
  });
}

/**
 * One short sentence for the adviser explaining what the case is waiting for.
 * Returns null when there is nothing to say, so callers can omit the line
 * entirely rather than render an empty one.
 */
export function describeRollup(roll) {
  if (!roll || roll.state === ROLLUP.NO_ALLEGATIONS) return null;
  switch (roll.state) {
    case ROLLUP.UNRESOLVED:
      return roll.unresolved === 1
        ? "1 allegation still needs an investigation conclusion."
        : `${roll.unresolved} allegations still need an investigation conclusion.`;
    case ROLLUP.FURTHER_REQUIRED:
      return "At least one allegation needs further investigation before this case can move on.";
    case ROLLUP.PROCEED_TO_DISCIPLINARY:
      return "Every allegation has a conclusion, and at least one has a case to answer.";
    case ROLLUP.CLOSE_NO_CASE:
      return "No allegation has a case to answer.";
    default:
      return null;
  }
}
