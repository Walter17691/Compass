// ─────────────────────────────────────────────────────────────────────────
// WAVE D2 — the record the decision is actually about.
//
// The outcome was recorded in a 480px modal containing a dropdown, an optional
// duration and a notes box. Nothing on screen said what the employee was
// alleged to have done, what the hearing established, or whether they were
// already under a live warning. The decision surface was not cluttered — it was
// empty, and the manager had to carry the case in their head.
//
// ┌─ NO NEW RETRIEVAL. NONE. ───────────────────────────────────────────────┐
// │ Every value here is derived from data the caller was ALREADY given and  │
// │ already authorised to hold: the case object it is rendering, the        │
// │ allegations already loaded under RLS, the meetings already on that      │
// │ case. This module performs no query, no fetch and no permission logic,  │
// │ so a case, allegation or meeting the viewer cannot see never arrives —  │
// │ exactly the rule employeeFile.js states for its own authorised slice.   │
// │                                                                          │
// │ Nothing is fetched and hidden client-side. There is nothing to hide.     │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ COMPASS DOES NOT DECIDE ───────────────────────────────────────────────┐
// │ No recommendation, no severity, no score, no "suggested outcome", and   │
// │ no ranking of the material. This assembles facts for a human and stops. │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

import { deriveCurrentWarnings } from './employeeFile';
import { isGenuineMeetingRecord } from './caseStage';
import { isDisciplinaryMeeting, isGrievanceMeeting } from './meetingTypeMatch';

// An allegation is what is alleged. Compass has no authoritative "finding"
// object, so this never implies one: the status is reported exactly as stored,
// and the absence of a finding is shown as absence, not inferred from the
// outcome the manager is about to choose.
export function decisionAllegations(allegations = [], caseId) {
  if (!caseId) return [];
  return (Array.isArray(allegations) ? allegations : [])
    .filter(a => a && a.caseId === caseId)
    .map(a => ({ id: a.id, title: a.title, status: a.status || null }));
}

// The hearing this decision follows. The same two matchers the rest of the
// product uses, and only a GENUINE record — a letter-only meeting is a
// communication artefact, not a hearing, and offering it here would show the
// decision-maker a letter where they expected the record of the meeting.
export function decisionMeeting(caseObj) {
  const meetings = Array.isArray(caseObj?.meetings) ? caseObj.meetings : [];
  const relevant = meetings.filter(m =>
    isGenuineMeetingRecord(m) && (isDisciplinaryMeeting(m.type) || isGrievanceMeeting(m.type)));
  return relevant[relevant.length - 1] || null;
}

// Live formal warnings, from the ONE authoritative derivation Employee File
// uses. Not recreated here, so Letter of Concern, management concerns, ordinary
// conversations, expired warnings and overturned warnings are excluded by that
// function's own rules rather than by a second set that could drift from them.
//
// `cases` must already be the authorised slice for this employee. The case
// being decided is excluded: its own outcome is the decision in progress, not
// prior history.
// ┌─ THE SLICE MUST BE THIS EMPLOYEE'S, AND I GOT THIS WRONG ───────────────┐
// │ deriveCurrentWarnings states plainly that `cases` "must already be the   │
// │ AUTHORISED, employee_id-linked slice — this function performs no         │
// │ permission logic and no name matching". D2 handed it the component's     │
// │ whole org-wide `cases` prop, so a fresh case with no outcome of its own  │
// │ displayed two live warnings belonging to two DIFFERENT employees. Found  │
// │ in human UAT on AT - Phase 3A Final UAT.                                 │
// │                                                                          │
// │ Scoped the way getEmployeeContext scopes everything else: strict         │
// │ employeeId equality, never a name. A case whose employee identity is not │
// │ established yields NOTHING — Compass cannot show "this person's prior    │
// │ warnings" when it cannot establish who this person is, and guessing by   │
// │ name is exactly how two people who share one get merged.                  │
// └─────────────────────────────────────────────────────────────────────────┘
// WAVE D4.3 — `caseDecisions` must be threaded through, because
// deriveCurrentWarnings now reads the authoritative decision head rather than
// the cases.* projection. Omitting it would make this panel silently empty,
// which is the worst possible failure for a surface whose whole job is to show
// a decision-maker what warnings the person already has.
export function priorLiveWarnings({ cases = [], allegations = [], currentCase = null, now = new Date(), caseDecisions = [] } = {}) {
  const employeeId = currentCase?.employeeId || null;
  if (!employeeId) return [];
  const sameEmployee = (Array.isArray(cases) ? cases : [])
    .filter(c => c && c.employeeId === employeeId);
  // Narrow the decisions to that authorised slice too, so a decision belonging
  // to a case this viewer never received cannot reach the derivation.
  const sameEmployeeIds = new Set(sameEmployee.map(c => c.id));
  const theirDecisions = (Array.isArray(caseDecisions) ? caseDecisions : [])
    .filter(d => d && sameEmployeeIds.has(d.caseId));
  return deriveCurrentWarnings(sameEmployee, allegations, now, theirDecisions)
    .filter(w => w.caseId !== currentCase?.id);
}

export function outcomeDecisionContext({ caseObj = null, cases = [], allegations = [], now = new Date(), caseDecisions = [] } = {}) {
  const caseId = caseObj?.id || null;
  const allegationList = decisionAllegations(allegations, caseId);
  const meeting = decisionMeeting(caseObj);
  const warnings = priorLiveWarnings({ cases, allegations, currentCase: caseObj, now, caseDecisions });
  return {
    allegations: allegationList,
    meeting,
    warnings,
    // True when there is genuinely nothing to show, so the surface can say so
    // rather than rendering three empty headings.
    isEmpty: allegationList.length === 0 && !meeting && warnings.length === 0,
  };
}
