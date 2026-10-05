// ─────────────────────────────────────────────────────────────────────────
// WHICH MEETING IS THIS NEXT STEP ABOUT?
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ Human UAT: the case CTA "Send investigation record for signature" did    │
// │ NOTHING. No navigation, no error, no toast.                             │
// │                                                                         │
// │ The engine and the handler disagreed about which meeting the step was    │
// │ about. nextStep.js reasons over lastGenuineMeeting(invMeetings) — the     │
// │ LAST genuine meeting — and then handed the handler only a meetingType.    │
// │ CaseViewScreen re-derived the meeting itself:                            │
// │                                                                         │
// │   const relevantMeeting = () =>                                         │
// │     meetings.filter(m => (m.type||"").toLowerCase().includes(searchTerm))│
// │       [0] || meetings[meetings.length-1];                                │
// │                                                                         │
// │ FIRST type match, by array position. The UAT case has THREE meetings all │
// │ of type "Investigation", so [0] was the oldest — a review_draft whose    │
// │ `record` is empty — while the step had reasoned about the newest, which  │
// │ carries the saved record. The handler then read                          │
// │                                                                         │
// │   if(m?.record){ … }        // no else                                  │
// │                                                                         │
// │ and returned silently. Two faults compounding: resolution by type and    │
// │ position rather than identity, and a guard with no failure path.         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So a step that is ABOUT a meeting must NAME that meeting, and the handler must
// use the name. Every other action already does this — resumeMeetingId,
// reviewMeetingId, scheduledMeetingId — and the signature step was the one that
// did not.
//
// Resolution is BY ID ONLY. Never by type, date, array position, "latest", or
// "first awaiting review". And it never fails silently: every outcome is
// explicit so the caller must say something to the manager.
// ─────────────────────────────────────────────────────────────────────────

export const NEXT_STEP_TARGET = Object.freeze({
  RESOLVED: 'resolved',
  /** The step named no meeting — a legacy step shape, or an engine bug. */
  NO_ID: 'no_id',
  /** It named one, but the case does not have it. */
  NOT_FOUND: 'not_found',
  /** Found, but it has no saved record to review. */
  NO_RECORD: 'no_record',
});

/**
 * Resolve the meeting a next step refers to, from the step's own id.
 *
 * FAILS CLOSED and LOUDLY. There is deliberately no fallback to "the newest
 * meeting of that type": guessing is what produced the defect, and on a case
 * with several meetings of one type a guess is a coin toss about which record a
 * manager is about to issue to an employee.
 */
export function resolveNextStepMeeting(caseRecord, nextStep, { requireRecord = true } = {}) {
  const id = nextStep && nextStep.reviewMeetingId;
  if (!id || typeof id !== 'string') return { kind: NEXT_STEP_TARGET.NO_ID };
  const meetings = Array.isArray(caseRecord?.meetings) ? caseRecord.meetings : [];
  const meeting = meetings.find(m => m && m.id === id);
  if (!meeting) return { kind: NEXT_STEP_TARGET.NOT_FOUND, meetingId: id };
  if (requireRecord && !(typeof meeting.record === 'string' && meeting.record.trim())) {
    return { kind: NEXT_STEP_TARGET.NO_RECORD, meetingId: id, meeting };
  }
  return { kind: NEXT_STEP_TARGET.RESOLVED, meetingId: id, meeting };
}

/**
 * What to tell the manager when the step cannot be acted on.
 *
 * Exists so that no branch can quietly do nothing — the original defect was a
 * missing `else`, and a message is the thing that was missing.
 */
export function describeUnresolvedNextStep(kind) {
  switch (kind) {
    case NEXT_STEP_TARGET.NO_RECORD:
      return "That meeting's record hasn't been saved yet. Open it from the Meetings tab to finish the review.";
    case NEXT_STEP_TARGET.NOT_FOUND:
      return "We couldn't find that meeting on this case. Open it from the Meetings tab.";
    case NEXT_STEP_TARGET.NO_ID:
    default:
      return "We couldn't identify which meeting record this refers to. Open it from the Meetings tab.";
  }
}
