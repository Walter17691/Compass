// ─────────────────────────────────────────────────────────────────────────
// WHO MAY RECORD WHAT DURING AN INVESTIGATION.
//
// Two authorities, deliberately different, each mirroring a specific database
// rule. They are pure functions rather than expressions inside a screen so the
// rule can be executed in a test instead of asserted as source text — the
// recurring failure in this codebase has been a permission test that matched
// the shape of the code rather than the behaviour of the decision.
//
// ┌─ THE DEFECT THIS CLOSES (IR-REPORT-01a) ────────────────────────────────┐
// │ CaseViewScreen derived ONE gate for both:                                │
// │                                                                         │
// │   const canDecide = isHR || (myAccess?.role==="disciplinary_officer");   │
// │   const canRecordInvestigation = canDecide || isAssignedInvestigator;    │
// │                                                                         │
// │ and handed it to InvestigationConclusionField. But the database rule for │
// │ the conclusion (protect_allegations_investigation_conclusion_columns,    │
// │ investigation_conclusion_2026-10-04.sql:184-196) is NARROWER — HR or the │
// │ case's assigned investigator, and deliberately NOT the disciplinary      │
// │ officer:                                                                 │
// │                                                                         │
// │   "They are the person who will hear the case. Letting them also decide  │
// │    whether there is a case to answer collapses the separation this slice │
// │    exists to create."                                                    │
// │                                                                         │
// │ So a disciplinary officer was offered "Record investigation conclusion",  │
// │ typed a conclusion and mandatory reasoning, pressed Save, and got a       │
// │ 42501 refusal. The UI promised an authority the database correctly        │
// │ refused.                                                                │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE UI IS NOT THE BOUNDARY. Nothing here weakens or replaces a trigger or a
// policy; these functions only stop Compass offering a control whose write
// cannot succeed.
//
// That claim was HALF TRUE when it was written, and the B2 review found the
// other half. For the CONCLUSION the database genuinely was the boundary. For
// the NARRATIVE there was no column-level rule at all, so the predicate below
// was the only thing standing between a disciplinary officer and the
// investigator's assessment — measured, not inferred: a disciplinary officer
// successfully wrote witness_evidence on an isolated branch (probe M-03b).
// supabase/investigator_narrative_authority_2026-10-08.sql closes that, so both
// predicates in this file now mirror a real trigger.
// ─────────────────────────────────────────────────────────────────────────

/** The `case_access.role` values these two rules care about. */
export const CASE_ROLE = Object.freeze({
  INVESTIGATOR: 'investigator',
  DISCIPLINARY_OFFICER: 'disciplinary_officer',
});

/**
 * May this user write the investigation NARRATIVE — the investigator's
 * assessment, the outstanding uncertainty, and the witness evidence summary?
 *
 * HR, or the case's assigned investigator. NOT the disciplinary officer.
 *
 * ┌─ THIS RULE CHANGED, AND WHY (IR-REPORT-01b/B2 review) ──────────────────┐
 * │ It previously also admitted CASE_ROLE.DISCIPLINARY_OFFICER, inherited    │
 * │ verbatim from the pre-IR-REPORT-01a expression                           │
 * │   canRecordInvestigation = canDecide || isAssignedInvestigator           │
 * │ where `canDecide` is itself `isHR || disciplinary_officer`. So the        │
 * │ disciplinary officer held narrative authority by ACCIDENT OF ORIGIN —     │
 * │ it was never a decision about the investigation workflow, it was the      │
 * │ decision gate being reused.                                              │
 * │                                                                          │
 * │ The product rule is that investigator findings belong to the             │
 * │ INVESTIGATION workflow. A disciplinary officer works FROM the adopted    │
 * │ investigation report and the disclosed evidence, and records their own    │
 * │ disciplinary reasoning separately (status, decision_reasoning,           │
 * │ decided_by/at, the case outcome, outcome_notes and case_decisions — all  │
 * │ gated on `canDecide` and all independently enforced in the database).    │
 * │ Those capabilities are untouched: the narrative is INPUT to the          │
 * │ disciplinary officer, not output from them.                              │
 * │                                                                          │
 * │ The old comment here claimed "the database matches by omission… the      │
 * │ enforcement there is case-scoped RLS". That was true and was the         │
 * │ problem: case-scoped RLS admits every role that can write to the case,   │
 * │ which is strictly WIDER than this predicate ever was, so the UI was the  │
 * │ only boundary. B2 closes that —                                          │
 * │ protect_allegations_investigator_narrative_columns()                      │
 * │ (supabase/investigator_narrative_authority_2026-10-08.sql) now enforces  │
 * │ exactly this predicate in the database, so the two agree and the         │
 * │ database is authoritative.                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function mayRecordInvestigationNarrative({ isHR = false, caseRole = null } = {}) {
  return !!isHR
    || caseRole === CASE_ROLE.INVESTIGATOR;
}

/**
 * May this user record or amend the structured investigation CONCLUSION?
 *
 * HR or the case's assigned investigator — and nobody else. A literal mirror of
 * protect_allegations_investigation_conclusion_columns, including its deliberate
 * exclusion of the disciplinary officer.
 *
 * Since the B2 review this is the SAME set as
 * `mayRecordInvestigationNarrative`, and that is the intended end state rather
 * than a redundancy: narrative and conclusion are both investigation work, and
 * both are now policed by the database. The two predicates are kept separate
 * because they mirror two different triggers, which can diverge again.
 */
export function mayRecordInvestigationConclusion({ isHR = false, caseRole = null } = {}) {
  return !!isHR || caseRole === CASE_ROLE.INVESTIGATOR;
}

/**
 * The two authorities for one viewer, as a frozen pair.
 *
 * Returned together because the invariant that matters is the RELATIONSHIP
 * between them: conclusion authority must never exceed narrative authority.
 * Someone offered "record the conclusion" who cannot write the assessment it
 * concludes would be a UI promising a half-finished action.
 *
 * (The earlier note here — "the disciplinary officer must hold the first
 * without the second" — described the accident this review corrected, and is
 * no longer the rule. See mayRecordInvestigationNarrative.)
 */
export function investigationAuthority({ isHR = false, caseRole = null } = {}) {
  return Object.freeze({
    mayRecordNarrative: mayRecordInvestigationNarrative({ isHR, caseRole }),
    mayRecordConclusion: mayRecordInvestigationConclusion({ isHR, caseRole }),
  });
}
