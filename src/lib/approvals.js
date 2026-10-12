// Process Intelligence (Phase 3, P9) — the spec's own list of actions
// that should require sign-off before they take effect (§17). A fixed
// list, not yet org-configurable — a deliberate narrowing from the
// spec's exact wording: the core value (a real, visible approval gate
// that works) doesn't depend on letting orgs toggle which actions need
// one, and there's no existing org-settings surface to hang that on yet
// (see P2's own note on the same trade-off for stage customization).
// Phase 6.5 hardening (closes independent audit finding 5.4) — was five
// declared actions, but only two (final_written_warning, dismissal — via
// approvalActionForOutcome below) and now suspension (via
// sendLetterCoordinated/sendLetterForAcknowledgement in App.jsx, when
// the Suspension letter is actually sent) ever had a real trigger point
// anywhere in the app. "settlement" and "redundancy_outcome" had no
// reachable UI path at all — no screen, button, or letter flow ever set
// either as an outcome — so declaring them here implied an approval gate
// that silently never fired, worse than not declaring one. Removed
// rather than fabricated a trigger for a workflow that doesn't exist
// yet; add them back if/when a real settlement or redundancy-outcome
// recording flow is built, wired at the same time.
export const APPROVAL_ACTIONS = [
  { id: "suspension", label: "Suspension" },
  { id: "final_written_warning", label: "Final written warning" },
  { id: "dismissal", label: "Dismissal" },
];

export function requiresApproval(actionId) {
  return APPROVAL_ACTIONS.some(a => a.id === actionId);
}

export function approvalActionLabel(actionId) {
  return APPROVAL_ACTIONS.find(a => a.id === actionId)?.label || actionId;
}

// Maps hr_review_requests.status (this app's existing vocabulary —
// requestHrReview always inserts 'pending', respondToReview writes
// 'approved'/'rejected') onto the spec's own display wording: "Decision
// prepared, Awaiting approval, Approved, Rejected / returned".
export function approvalStatusLabel(status) {
  if (status === "pending") return "Awaiting approval";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected / returned";
  return "Decision prepared";
}

// Which disciplinary outcome types map onto which approval action —
// OutcomeModal.jsx's own existing option list, not duplicated there.
export function approvalActionForOutcome(outcomeType) {
  if (outcomeType === "Final written warning") return "final_written_warning";
  if (outcomeType === "Dismissal with notice" || outcomeType === "Summary dismissal (gross misconduct)") return "dismissal";
  return null;
}

// Manager Enablement (Phase 4, MP11, §17) — a second, richer status
// vocabulary on the SAME hr_review_requests.status column, specific to
// investigation submissions (step:"inv_report", MP10's own
// finalizeInvestigationSubmission) rather than the simple approve/reject
// sign-off the outcome-approval flow above still uses unchanged.
// "Approved" is deliberately the one status shared between both
// vocabularies — "yes, this is fine" means the same thing either way.
// No migration needed: hr_review_requests.status has never had a CHECK
// constraint (baseline_schema_2026-08-06.sql), so it already accepts any
// text value.
export const INVESTIGATION_REVIEW_STATUSES = [
  { id: "approved", actionLabel: "Approve", statusLabel: "Approved" },
  { id: "returned", actionLabel: "Return for further investigation", statusLabel: "Returned for further investigation" },
  { id: "clarification_requested", actionLabel: "Request clarification", statusLabel: "Clarification requested" },
  { id: "taken_over", actionLabel: "Take over case", statusLabel: "Taken over by HR" },
  { id: "closed", actionLabel: "Close", statusLabel: "Closed" },
  { id: "progressed", actionLabel: "Progress to next stage", statusLabel: "Progressed to next stage" },
];

export function investigationReviewStatusLabel(status) {
  return INVESTIGATION_REVIEW_STATUSES.find(s => s.id === status)?.statusLabel || "Awaiting HR review";
}

// ── Phase 0 stabilisation: which decisions need a written note ──
//
// B3 A3c (hr_review_lifecycle_mutex_2026-10-12.sql, applied to production
// 2026-10-12) added this to hr_review_report_integrity_guard:
//
//     if new.status = 'clarification_requested' then
//       if coalesce(btrim(new.comments), '') = '' then
//         raise exception 'Requesting clarification needs a written question,
//                          which is recorded on the case.'
//
// The guard's status branch has NO report_regime condition, so it governs
// every case today, legacy included. The textarea meanwhile said "Comments
// (optional)" for all six actions, so "Request clarification" with an empty
// box went from working to failing with a database error. This states the
// same rule where the user can act on it BEFORE the request is sent. It does
// not replace the guard: the database stays the authority, and a caller that
// skips this check is still refused there.
//
// DELIBERATELY STRICTER THAN THE DATABASE. Postgres btrim() with no second
// argument strips SPACES ONLY — verified against production: btrim(E'\t') is
// not '', so a tab-only or newline-only question SATISFIES the guard. JS
// .trim() strips all whitespace, so this refuses inputs the database would
// accept. Stricter is the safe direction (the user is asked for a real
// question; nothing that would have been stored is now rejected by the
// server), and it is the opposite of the mistranslation that caused the
// adoption-predicate defect, where the SQL was LOOSER than the JS it was
// copied from. The residual gap is the database's, not this module's, and is
// recorded in docs/assessment-hr-review-decision-atomicity-2026-10-12.md
// rather than patched here — closing it needs btrim(new.comments, E' \t\n\r')
// in a migration, which this phase is not authorised to make.
export const STATUSES_REQUIRING_A_WRITTEN_NOTE = Object.freeze(["clarification_requested"]);

export function requiresWrittenNote(statusId) {
  return STATUSES_REQUIRING_A_WRITTEN_NOTE.includes(statusId);
}

// The single predicate both the panel and the handler ask, so the disabled
// button and the refusal can never disagree about what counts as empty.
export function decisionNoteMissing(statusId, note) {
  return requiresWrittenNote(statusId) && String(note ?? "").trim() === "";
}

// Why the button is disabled, in words, or null when it is not. Returned from
// here rather than written into the component so the test asserts the rule and
// the copy together.
export function decisionNoteRequirement(statusId) {
  if (!requiresWrittenNote(statusId)) return null;
  return "Requesting clarification needs a written question — it is recorded on the case and sent to the investigator.";
}
