// Manager Enablement (Phase 4, MP20, §24) — Manager Performance Insights.
// HR-only aggregated stats over data Track C/D/E already produce — no new
// tracking, same "read what's already computed" discipline as
// caseRisk.js. Explicitly NOT a per-manager score: every number here is a
// single org-wide aggregate, same "advisory, not a judgment" framing as
// caseRisk.js's own disclaimer.
//
// "computeMeetingQualityGaps" (M9) is itself ephemeral — it only ever runs
// live, in memory, during an active meeting, and is never persisted. The
// one place its result IS ever written to durable storage is when a
// manager proceeds past it anyway: attemptEndMeeting's own requestOverride
// call (App.jsx) logs an audit_log entry (action "Ended meeting despite
// quality check gaps") only when a reason was given. That's the real,
// aggregable signal this phase reads — a live per-meeting check can't be
// aggregated after the fact, but a record of "gaps were left unresolved"
// can.
const MEETING_QUALITY_OVERRIDE_ACTION = "Ended meeting despite quality check gaps";
const POLICY_DEVIATION_ACTION = "Policy deviation recorded";

// Average investigation completion time — explicitly defined by the plan
// as case_access.granted_at (MP7's own investigator assignment) through
// MP10's submission timestamp (hr_review_requests.requested_at, step
// "inv_report"), not case creation or closure. A case can be assigned more
// than once (reassignment) and submitted more than once (MP11 "returned"
// then resubmitted) — the earliest grant and the earliest submission are
// used, since a later resubmission after being sent back for rework is
// already counted separately via investigationsReturnedForRework, not a
// second measure of "how long did this take."
function averageInvestigationCompletionDays(delegatedCaseIds, caseAccess, hrReviewRequests) {
  const durations = [];
  delegatedCaseIds.forEach(caseId => {
    const grants = (caseAccess || []).filter(a => a.caseId === caseId && a.role === "investigator" && a.grantedAt);
    const submissions = (hrReviewRequests || []).filter(r => r.case_id === caseId && r.step === "inv_report" && r.requested_at);
    if (!grants.length || !submissions.length) return;
    const assignedAt = new Date(grants.map(a => a.grantedAt).sort()[0]);
    const submittedAt = new Date(submissions.map(r => r.requested_at).sort()[0]);
    if (isNaN(assignedAt) || isNaN(submittedAt) || submittedAt < assignedAt) return;
    durations.push((submittedAt - assignedAt) / (1000 * 60 * 60 * 24));
  });
  if (!durations.length) return { avgDays: null, sampleSize: 0 };
  const avgDays = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
  return { avgDays, sampleSize: durations.length };
}

// dueSoon is the same org-wide computeDueSoon output every other screen
// (HomeScreen's overdue banner, ManagerPortalScreen) already reads —
// passed in rather than recomputed, same reuse caseRisk.js's own dueSoon
// param already established. "Manager actions" is scoped to cases
// delegated to an investigator (MP18's own definition of "delegated
// work"), not every case role — this is the closing aggregate over Track
// C/E's delegation concept specifically, not a blanket count of every
// overdue item org-wide.
export function computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, auditLog, dueSoon = []) {
  const delegatedCaseIds = new Set((caseAccess || []).filter(a => a.role === "investigator").map(a => a.caseId));

  const { avgDays, sampleSize } = averageInvestigationCompletionDays(delegatedCaseIds, caseAccess, hrReviewRequests);

  const investigationsReturnedForRework = (hrReviewRequests || []).filter(r => r.step === "inv_report" && r.status === "returned").length;

  const overdueManagerActions = (dueSoon || []).filter(d => d.overdue && delegatedCaseIds.has(d.caseId)).length;

  const meetingQualityGapsCount = (auditLog || []).filter(e => e.action === MEETING_QUALITY_OVERRIDE_ACTION).length;

  const processDeviationsCount = (auditLog || []).filter(e => e.action === POLICY_DEVIATION_ACTION).length;

  return {
    avgInvestigationCompletionDays: avgDays,
    investigationCompletionSampleSize: sampleSize,
    investigationsReturnedForRework,
    overdueManagerActions,
    meetingQualityGapsCount,
    processDeviationsCount,
    delegatedCaseCount: delegatedCaseIds.size,
  };
}
