import { parseFlexDate } from './dateMath.js';

// Insights Phase 5 (Process Quality + HR Review Intelligence) — pure,
// deterministic aggregation over the already-loaded, already-authorised
// hrReviewRequests array (App.jsx's own loadHrReviews — select('*'),
// RLS-scoped exactly like every other array Insights already reads).
// No new query, no new RPC. Scoped to step === "inv_report" throughout —
// hr_review_requests carries a SECOND, unrelated status vocabulary for
// the outcome-approval flow (pending/approved/rejected, see
// src/lib/approvals.js's own header) on the same status column; mixing
// the two would silently misclassify an outcome-approval row as an
// investigation-review one. Never returns record_snapshot, comments, or
// any other review-content field — only case_id/step/status/requested_at
// metadata, matching what OrganisationalIntelligenceOverview.jsx's own
// pre-existing "Returned for further investigation" count already reads.
export const HR_REVIEW_MIN_SAMPLE_SIZE = 3;

function invReportRequests(hrReviewRequests) {
  return (hrReviewRequests || []).filter(r => r?.step === "inv_report" && r?.case_id);
}

// Feature 2 — the current investigation-review queue. A case can have at
// most one pending inv_report request by construction (requestHrReview
// only fires again after the prior one has been resolved), but this
// stays defensive: if malformed/legacy data ever produced more than one
// pending row for the same case, the case is still counted once, and its
// AGE is measured from the OLDEST of its pending rows — the queue never
// under-states how long a case has genuinely been waiting.
export function computePendingHrReview(hrReviewRequests, now = new Date()) {
  const pending = invReportRequests(hrReviewRequests).filter(r => r.status === "pending");
  const oldestByCase = new Map(); // caseId -> oldest valid requested_at Date
  pending.forEach(r => {
    const requested = parseFlexDate(r.requested_at);
    if (!requested) return; // invalid/missing requested_at excluded from age math, case still counted below
    const existing = oldestByCase.get(r.case_id);
    if (!existing || requested.getTime() < existing.getTime()) oldestByCase.set(r.case_id, requested);
  });
  const caseIds = Array.from(new Set(pending.map(r => r.case_id)));
  const validAges = Array.from(oldestByCase.values());
  const oldestPendingDays = validAges.length
    ? Math.max(0, Math.floor((now.getTime() - Math.min(...validAges.map(d => d.getTime()))) / (24 * 60 * 60 * 1000)))
    : null;
  return { count: caseIds.length, caseIds, oldestPendingDays };
}

// Feature 3 — first-pass investigation approval. Unit of analysis is the
// CASE's whole inv_report submission history, not individual request
// rows (a resubmission after a return is a fresh INSERT — see
// App.jsx's requestHrReview/resolveInvestigationReview — never an update
// to the earlier row, so a case's full history is simply every inv_report
// row sharing its case_id).
//
// Classification, deliberately set-based rather than order-walked:
//   REWORK_REQUIRED   — the case has AT LEAST ONE "returned" row, ever.
//   FIRST_PASS_APPROVED — the case has an "approved" row and NO "returned"
//                          row at all.
//   (excluded)         — anything else: pending-only, or a case whose
//                          only resolved rows are "clarification_requested"/
//                          "taken_over"/"closed"/"progressed"/an unknown
//                          status — none of which this metric equates to
//                          either "approved as submitted" or "sent back
//                          for rework."
// This is a deliberate, documented reading of the two decisive statuses
// the metric is actually about — see the Phase 5 pre-commit report for
// the full reasoning. In particular, REWORK_REQUIRED does NOT require an
// eventual approval: a case returned and never resubmitted still
// genuinely required rework, and excluding it would understate how often
// HR sent work back. A case that was returned at least once and later
// approved is classified as REWORK_REQUIRED, not FIRST_PASS_APPROVED —
// it manifestly wasn't approved on the first pass.
export function computeFirstPassApprovalRate(hrReviewRequests) {
  const byCase = new Map(); // caseId -> { hasApproved, hasReturned }
  invReportRequests(hrReviewRequests).forEach(r => {
    const entry = byCase.get(r.case_id) || { hasApproved: false, hasReturned: false };
    if (r.status === "approved") entry.hasApproved = true;
    if (r.status === "returned") entry.hasReturned = true;
    byCase.set(r.case_id, entry);
  });

  const firstPassCaseIds = [];
  const reworkCaseIds = [];
  byCase.forEach((entry, caseId) => {
    if (entry.hasReturned) reworkCaseIds.push(caseId);
    else if (entry.hasApproved) firstPassCaseIds.push(caseId);
    // else: excluded — pending-only or an unresolved/ambiguous-only history
  });

  const denominator = firstPassCaseIds.length + reworkCaseIds.length;
  const applicable = denominator >= HR_REVIEW_MIN_SAMPLE_SIZE;
  return {
    applicable,
    denominator,
    numerator: firstPassCaseIds.length,
    rate: applicable ? Math.round((firstPassCaseIds.length / denominator) * 100) : null,
    reworkCaseIds,
  };
}
