import { MEETING_STATUS, declaredStatus } from './meetingLifecycle';

// ─────────────────────────────────────────────────────────────────────────
// WHICH PERSISTED MEETING AM I ACTING ON?
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ A meeting had TWO identities. Where it is DISPLAYED it is (case.id,      │
// │ meeting.id), read straight from persisted data. Where it is ACTED ON it   │
// │ was caseInfo.caseId / caseInfo.meetingId — transient navigation state    │
// │ that only the in-session meeting flow ever populated.                    │
// │                                                                         │
// │ So opening a saved record from the case view left both undefined, and:   │
// │   · signatureEligibleIn returned false for a genuinely eligible record,  │
// │     and ReviewScreen offered the NEW-record variant instead;             │
// │   · that variant called saveMeetingToCase first, where                   │
// │     `caseId = existing ? existing.id : crypto.randomUUID()` would have   │
// │     created a DUPLICATE CASE.                                           │
// │                                                                         │
// │ The failure mode is the giveaway: a missing identity fell through to a    │
// │ CREATE rather than to an error. Hence RECORD_SOURCE below, and a resolver │
// │ whose unresolvable answer is a refusal rather than a new row.            │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NO NEW STATE STORE. caseInfo remains the single navigation object; this adds
// one declared field to it and one place that reads it. The persisted case and
// meeting stay authoritative — nothing here caches or mirrors them.
// ─────────────────────────────────────────────────────────────────────────

export const RECORD_SOURCE = Object.freeze({
  // Opened from a case: a row that already exists in cases.meetings. Actions on
  // it must target THAT row or refuse.
  PERSISTED: 'persisted',
  // A record being produced in this session, which may not have been saved yet.
  // The create path is legitimate here and only here.
  DRAFT: 'draft',
});

export const RESOLUTION = Object.freeze({
  RESOLVED: 'resolved',
  NOT_PERSISTED: 'not_persisted',
  UNRESOLVABLE: 'unresolvable',
});

export const UNRESOLVABLE_REASON = Object.freeze({
  MISSING_IDS: 'missing_ids',
  CASE_NOT_FOUND: 'case_not_found',
  MEETING_NOT_FOUND: 'meeting_not_found',
});

/**
 * The identity to carry when opening an EXISTING persisted meeting.
 *
 * Derived from the meeting itself wherever possible: meetings have carried
 * `caseId` since Release 1 Phase 2.1, and the caller usually also knows the case.
 * An explicit caseId wins, because a legacy meeting (the 884 that predate the
 * stamp) may carry none.
 */
export function persistedMeetingContext(meeting, { caseId = null } = {}) {
  const resolvedCaseId = caseId || meeting?.caseId || null;
  const meetingId = meeting?.id || null;
  return {
    recordSource: RECORD_SOURCE.PERSISTED,
    caseId: resolvedCaseId,
    meetingId,
  };
}

/**
 * The identity to carry when presenting record TEXT that is not a persisted
 * meeting — evidence, a witness statement, a pasted record.
 *
 * Explicitly CLEARS the ids. Without this, viewing a piece of evidence after
 * opening a meeting would inherit that meeting's identity, and a later action
 * would target an unrelated record — the same split-identity bug in reverse.
 */
export function detachedRecordContext() {
  return { recordSource: RECORD_SOURCE.DRAFT, caseId: null, meetingId: null };
}

/**
 * Resolve what a caseInfo actually refers to, against persisted state.
 *
 * FAILS CLOSED. An unresolvable persisted record is never reported as "fine to
 * create" — callers must refuse.
 */
export function resolvePersistedMeeting(cases, caseInfo) {
  if (caseInfo?.recordSource !== RECORD_SOURCE.PERSISTED) {
    return { kind: RESOLUTION.NOT_PERSISTED };
  }
  const caseId = caseInfo.caseId;
  const meetingId = caseInfo.meetingId;
  if (!caseId || !meetingId) {
    return { kind: RESOLUTION.UNRESOLVABLE, reason: UNRESOLVABLE_REASON.MISSING_IDS };
  }
  const cs = (Array.isArray(cases) ? cases : []).find(c => c && c.id === caseId);
  if (!cs) {
    return { kind: RESOLUTION.UNRESOLVABLE, reason: UNRESOLVABLE_REASON.CASE_NOT_FOUND };
  }
  const meeting = (cs.meetings || []).find(m => m && m.id === meetingId);
  if (!meeting) {
    return { kind: RESOLUTION.UNRESOLVABLE, reason: UNRESOLVABLE_REASON.MEETING_NOT_FOUND };
  }
  return { kind: RESOLUTION.RESOLVED, caseRecord: cs, meeting };
}

/** True when a persisted record is being reviewed but cannot be identified. */
export function isPersistedIdentityMissing(cases, caseInfo) {
  return resolvePersistedMeeting(cases, caseInfo).kind === RESOLUTION.UNRESOLVABLE;
}

/**
 * May this completed meeting be issued to the participant for confirmation for
 * the FIRST time?
 *
 * Deliberately NOT stage-dependent. A record the participant has never been
 * given should remain issuable even once the case has moved on — giving someone
 * the record of their own hearing is not made wrong by the hearing being over.
 * Whether it is the PRIMARY next step is a separate question, and nextStep.js
 * already answers it.
 *
 * Re-issue is excluded here: once a request exists, Slice 1b's supersession
 * rules govern, and the row offers reminder / proceed instead.
 */
export function canIssueFirstConfirmation(meeting) {
  if (!meeting) return false;
  if (declaredStatus(meeting) !== MEETING_STATUS.COMPLETED) return false;
  if (typeof meeting.record !== 'string' || !meeting.record.trim()) return false;
  return !meeting.signId;
}

/** The one user-facing sentence for an unidentifiable persisted record. */
export function describeUnresolvedPersistedRecord() {
  return "We couldn't identify the saved meeting record. Return to the case and open it again.";
}

/**
 * Build the next caseInfo when a record is presented for review.
 *
 * Exists as a pure function because the ORIGINAL defect lived exactly here: the
 * route knew the identity and the state did not receive it. An inline spread at
 * the call site is not testable, and mutation testing proved it — removing the
 * spread left every other test passing.
 *
 * Identity is applied LAST so a caller's display fields (employee, manager, date)
 * can never overwrite it, and so a stale id cannot survive a text view.
 */
export function applyRecordIdentity(previousCaseInfo, callerFields, source) {
  const isMeetingObject = !!source && typeof source === "object";
  const identity = isMeetingObject
    ? persistedMeetingContext(source, { caseId: callerFields?.caseId || null })
    : detachedRecordContext();
  return { ...(previousCaseInfo || {}), ...(callerFields || {}), ...identity };
}
