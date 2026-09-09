// Defect #12 remediation — which outcome types carry a warning that
// expires after a set period, and therefore require a structured
// warning_duration_months/warning_expires_at pair. One shared list (not
// duplicated between OutcomeModal's field visibility, OutcomeTab's
// "needs completion" check, and letterValidation's duration check) so
// none of them can drift on what counts as "a warning outcome" — same
// pattern as approvals.js's own APPROVAL_ACTIONS/approvalActionForOutcome
// for outcome-type classification.
export const WARNING_OUTCOME_TYPES = ["First written warning", "Final written warning"];

export function isWarningOutcome(outcomeType) {
  return WARNING_OUTCOME_TYPES.includes(outcomeType);
}

// Matches the DB CHECK constraint in
// supabase/warning_duration_outcome_metadata_2026-09-09.sql
// (warning_duration_months is null or (> 0 and <= 60)) — kept as one
// shared predicate so the client-side validation a user sees can never
// silently drift from what the database will actually accept. Rejects
// non-integers (including numeric strings like "6.5"), non-positive
// values, and anything above the safety ceiling; never returns true for
// an empty/missing value, since a warning outcome always requires an
// explicit duration.
export function isValidWarningDurationMonths(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 60;
}
