import { HEALTH_RELEVANT_PROCESS_TYPES } from './caseRisk.js';

// ─────────────────────────────────────────────────────────────────────────
// Which key dates actually belong to THIS case?
//
// Wave B.2 — moved verbatim out of OverviewTab so key dates can live under
// "Case information" without the predicate being duplicated or re-derived. Not
// one character of the relevance rules changed.
// ─────────────────────────────────────────────────────────────────────────

export const KEY_DATE_FIELDS = [
  { field:"fitNoteEndDate", label:"Fit note expires" },
  { field:"probationReviewDate", label:"Probation review" },
  { field:"ohReferralDate", label:"OH referral" },
  { field:"suspensionReviewDate", label:"Suspension review" },
];

// Each predicate mirrors the one authoritative signal that field is
// actually about — never "any employee case might need this."
//
// Re-audit — fit note/OH referral relevance previously only recognised
// long_term_sickness/attendance case types, narrower than the health-
// relevance judgement this codebase already makes elsewhere: caseRisk.js's
// own missing_medical_info check (the literal source of the UAT
// complaint's "missing medical information" item) already treats
// attendance/long_term_sickness/capability as HEALTH_RELEVANT_PROCESS_TYPES,
// and separately treats real wellbeing notes recorded for this specific
// employee (not just this case) as its own genuine signal, independent of
// case type — e.g. a misconduct case where the employee has a real,
// separately-logged wellbeing concern. Both reused here rather than
// re-deriving a narrower, drifting definition.
export function keyDateRelevance(cs, caseCtx, wellbeingNotes, processTypeId) {
  const probationEndDate = caseCtx.empRecord?.probationEndDate ? new Date(caseCtx.empRecord.probationEndDate) : null;
  const healthRelevant = HEALTH_RELEVANT_PROCESS_TYPES.includes(processTypeId)
    || (cs.employeeId ? (wellbeingNotes || []).some(n => n.employeeId === cs.employeeId) : false);
  return {
    fitNoteEndDate: !!cs.fitNoteEndDate || healthRelevant,
    probationReviewDate: !!cs.probationReviewDate || processTypeId === "probation" || (!!probationEndDate && probationEndDate > new Date()),
    ohReferralDate: !!cs.ohReferralDate || !!cs.ohProcess?.currentStep || healthRelevant,
    // Re-audit — no authoritative "this case involves a suspension"
    // signal exists anywhere else in the data model: no meeting type, no
    // case-stage heuristic, and drafting/sending the Suspension letter
    // (LetterScreen) persists nothing back to the case today. Confirmed
    // by inspection, not assumed — see the report accompanying this
    // change for the full trail. Because this genuinely is a real,
    // ACAS-recognised action with no other way to reach it, it keeps its
    // own single, narrowly-scoped reveal (rendered below, not a generic
    // "show everything" toggle) rather than being made unreachable.
    suspensionReviewDate: !!cs.suspensionReviewDate,
  };
}
