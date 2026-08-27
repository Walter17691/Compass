import { getNextStep } from './nextStep.js';
import { caseRoleLabel } from './caseRoles.js';

// Manager Enablement (Phase 4, MP16, §1) — "My People Actions". Pure
// aggregation only, no new data source: every section here reads from
// something an earlier phase in this track already produces (case_access
// from MP1/MP7, case_tasks from the pre-existing caseTasks.js,
// notetaker submissions from MP2, hr_review_requests from MP11/MP12,
// concern_referrals from MP4/5). This module is deliberately just a
// manager-appropriate front door onto data that already exists, not a
// second copy of it.

// "Assigned to me" — any case_access row for this user, across every
// role (investigator, disciplinary_officer/"Hearing Manager", appeal_manager,
// notetaker, employee_manager, approver, case_owner), not just one.
export function myAssignedCases(cases, caseAccess, userId) {
  if (!userId) return [];
  const myAccessRows = (caseAccess || []).filter(a => a.userId === userId);
  const myCaseIds = new Set(myAccessRows.map(a => a.caseId));
  return (cases || []).filter(cs => myCaseIds.has(cs.id)).map(cs => ({
    ...cs,
    myRoles: myAccessRows.filter(a => a.caseId === cs.id).map(a => caseRoleLabel(a.role)),
  }));
}

// Which of my own assigned cases currently need a meeting held —
// getNextStep's own "start_*" actions, reused rather than re-derived.
export function myMeetingsToConduct(myCases) {
  return (myCases || []).filter(cs => (getNextStep(cs)?.action || "").startsWith("start_"));
}

// case_tasks stores owner as a free-text name (matching how cs.manager/
// meetings already store people, not a user id), so this matches by name
// rather than id, same convention the rest of this app already uses for
// task ownership.
export function myTasksDue(caseTasks, userName) {
  const name = (userName || "").trim().toLowerCase();
  if (!name) return [];
  return (caseTasks || [])
    .filter(t => t.status !== "done" && (t.owner || "").trim().toLowerCase() === name)
    .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
}

// Notetaker submissions (MP2) awaiting review specifically from ME as
// the case owner (cs.manager) — the notetaker's counterpart doesn't
// reach this screen at all (isAssignedNotetaker's own restricted view).
export function myDocumentsToReview(myCases, userName) {
  const name = (userName || "").trim().toLowerCase();
  if (!name) return [];
  const items = [];
  (myCases || []).forEach(cs => {
    if ((cs.manager || "").trim().toLowerCase() !== name) return;
    (cs.meetings || []).forEach(m => {
      if (m.notetakerNotesStatus === "submitted") {
        items.push({ caseId: cs.id, employeeName: cs.employeeName, meetingType: m.type, meetingId: m.id });
      }
    });
  });
  return items;
}

// What HR has come back with on something I submitted (an investigation,
// an escalation) — the resolved half of MP10/MP11/MP12's own review
// pipeline, not a new notification channel.
export function myHrResponses(hrReviewRequests, userId) {
  if (!userId) return [];
  return (hrReviewRequests || [])
    .filter(r => r.requested_by === userId && r.status !== "pending")
    .sort((a, b) => new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0));
}

export function myConcernsSubmitted(concernReferrals, userId) {
  if (!userId) return [];
  return (concernReferrals || [])
    .filter(r => r.submittedBy === userId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

// dueSoon (App.jsx's computeDueSoon output) is already derived from the
// same RLS-scoped `cases` array everything else in this app reads —
// this narrows it further, from "every deadline I can see" to
// specifically "deadlines on cases I'm assigned to", matching this
// screen's own "My People Actions" framing rather than reusing the
// org-wide list unfiltered.
export function myUpcomingDeadlines(dueSoon, myCaseIds) {
  const idSet = new Set(myCaseIds || []);
  return (dueSoon || []).filter(d => d.caseId && idSet.has(d.caseId));
}
