// Process Intelligence (Phase 3, P9) — the spec's own list of actions
// that should require sign-off before they take effect (§17). A fixed
// list, not yet org-configurable — a deliberate narrowing from the
// spec's exact wording: the core value (a real, visible approval gate
// that works) doesn't depend on letting orgs toggle which actions need
// one, and there's no existing org-settings surface to hang that on yet
// (see P2's own note on the same trade-off for stage customization).
export const APPROVAL_ACTIONS = [
  { id: "suspension", label: "Suspension" },
  { id: "final_written_warning", label: "Final written warning" },
  { id: "dismissal", label: "Dismissal" },
  { id: "settlement", label: "Settlement" },
  { id: "redundancy_outcome", label: "Redundancy selection outcome" },
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
