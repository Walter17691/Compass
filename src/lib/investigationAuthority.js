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
// THE UI IS NOT THE BOUNDARY. Both triggers and both RLS policies stay exactly
// as they are; nothing here weakens or replaces them. These functions only stop
// Compass offering a control whose write cannot succeed.
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
 * HR, the disciplinary officer, or the case's assigned investigator. This is
 * the existing `canRecordInvestigation` rule, unchanged in behaviour and only
 * moved somewhere it can be tested. The database matches by omission: these
 * columns are deliberately excluded from
 * protect_allegations_finding_columns (destructive_decision_authorization
 * 2026-09-13.sql:128-131) because they are "ordinary investigation material an
 * Investigator legitimately edits", so the enforcement there is case-scoped RLS.
 */
export function mayRecordInvestigationNarrative({ isHR = false, caseRole = null } = {}) {
  return !!isHR
    || caseRole === CASE_ROLE.INVESTIGATOR
    || caseRole === CASE_ROLE.DISCIPLINARY_OFFICER;
}

/**
 * May this user record or amend the structured investigation CONCLUSION?
 *
 * HR or the case's assigned investigator — and nobody else. A literal mirror of
 * the database trigger, including its deliberate exclusion of the disciplinary
 * officer. Narrower than `mayRecordInvestigationNarrative` on purpose: the
 * conclusion is the one field whose authority the database itself polices.
 */
export function mayRecordInvestigationConclusion({ isHR = false, caseRole = null } = {}) {
  return !!isHR || caseRole === CASE_ROLE.INVESTIGATOR;
}

/**
 * The two authorities for one viewer, as a frozen pair.
 *
 * Returned together because the invariant that matters is the RELATIONSHIP
 * between them — conclusion authority must never exceed narrative authority,
 * and the disciplinary officer must hold the first without the second.
 */
export function investigationAuthority({ isHR = false, caseRole = null } = {}) {
  return Object.freeze({
    mayRecordNarrative: mayRecordInvestigationNarrative({ isHR, caseRole }),
    mayRecordConclusion: mayRecordInvestigationConclusion({ isHR, caseRole }),
  });
}
