import { isResumableMeeting, isScheduledMeeting, declaredStatus, scheduleInstant, MEETING_STATUS } from './meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE A — the ONE primary action on an Employee File.
//
// Before this, the primary action was static: "New case" whenever the viewer
// could create one. So the most consequential thing a manager could do to a
// person was the default thing the screen offered, and the everyday thing —
// having a conversation — had no entry point in the header or on Overview at all.
// A product that keeps conversations informal for as long as they should be must
// not open with formal escalation.
//
// ┌─ WHAT THIS MODULE IS ───────────────────────────────────────────────────┐
// │ A pure function over data the viewer is ALREADY authorised to see.       │
// │ It performs no authorisation of its own and must never become a          │
// │ permission boundary: `file` is built from RLS-filtered collections, so a │
// │ confidential case the viewer cannot read is not in `processes` at all,   │
// │ and therefore cannot reach an action label. That is what stops the       │
// │ primary button disclosing the existence of a case.                       │
// │                                                                         │
// │ It is also deterministic. No AI, no scoring, no "Compass recommends      │
// │ starting a disciplinary". Compass may know the process; it must not make  │
// │ the employment decision.                                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE PRIORITY RULE: the most immediate ACTIONABLE WORK wins — not the most
// serious historical object. A live meeting outranks everything because someone
// is in a room right now. A closed case and a live warning are context, not work,
// and never become the primary action.
// ─────────────────────────────────────────────────────────────────────────

export const EMPLOYEE_FILE_ACTION = Object.freeze({
  RESUME_MEETING: "resume_meeting",
  COMPLETE_REVIEW: "complete_review",
  START_MEETING: "start_meeting",
  PREPARE_MEETING: "prepare_meeting",
  CHASE_SIGNATURE: "chase_signature",
  RECORD_FOLLOW_UP: "record_follow_up",
  SEND_DOCUMENTATION: "send_documentation",
  PROCESS_NEXT_STEP: "process_next_step",
  CONTINUE_CONCERN: "continue_concern",
  START_CONVERSATION: "start_conversation",
});

// Highest priority first. This array IS the documented order — the resolver walks
// it, so the order cannot drift from the documentation by accident.
export const ACTION_PRIORITY = Object.freeze([
  EMPLOYEE_FILE_ACTION.RESUME_MEETING,
  EMPLOYEE_FILE_ACTION.COMPLETE_REVIEW,
  EMPLOYEE_FILE_ACTION.START_MEETING,
  EMPLOYEE_FILE_ACTION.PREPARE_MEETING,
  EMPLOYEE_FILE_ACTION.CHASE_SIGNATURE,
  EMPLOYEE_FILE_ACTION.RECORD_FOLLOW_UP,
  EMPLOYEE_FILE_ACTION.SEND_DOCUMENTATION,
  EMPLOYEE_FILE_ACTION.PROCESS_NEXT_STEP,
  EMPLOYEE_FILE_ACTION.CONTINUE_CONCERN,
  EMPLOYEE_FILE_ACTION.START_CONVERSATION,
]);

const SIGNATURE_OUTSTANDING = new Set(["pending", "sent"]);

const dayStart = d => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return NaN;
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
};

// Every meeting on the employee's AUTHORISED cases, carrying its case so an
// action can open the right one. Meetings on a case the viewer cannot read are
// absent because the case itself is absent.
function authorisedCaseMeetings(file) {
  const out = [];
  (file?.context?.cases || []).forEach(cs => {
    (cs?.meetings || []).forEach(m => { if (m && m.id) out.push({ meeting: m, caseObj: cs }); });
  });
  return out;
}

// ── The resolver ───────────────────────────────────────────────────────────
//
// Returns null when there is genuinely nothing to offer — a former employee with
// no outstanding work. A null primary action is a real answer, and better than
// inventing "Start conversation" for someone who has left.
export function resolvePrimaryAction(file, { now = new Date() } = {}) {
  if (!file?.employee) return null;

  const meetings = authorisedCaseMeetings(file);
  const today = dayStart(now);

  // 1. A meeting is LIVE. Someone is in a room; nothing outranks that.
  const live = meetings.find(({ meeting }) => isResumableMeeting(meeting));
  if (live) {
    return {
      kind: EMPLOYEE_FILE_ACTION.RESUME_MEETING,
      label: "Resume meeting",
      caseId: live.caseObj.id,
      meetingId: live.meeting.id,
    };
  }

  // 2. A meeting has ended and its record is unfinished. The evidential value of
  //    a record decays with memory, so this outranks arranging anything new.
  const inReview = meetings.find(({ meeting }) => declaredStatus(meeting) === MEETING_STATUS.REVIEW_DRAFT);
  if (inReview) {
    return {
      kind: EMPLOYEE_FILE_ACTION.COMPLETE_REVIEW,
      label: "Complete review",
      caseId: inReview.caseObj.id,
      meetingId: inReview.meeting.id,
    };
  }

  // 3/4. A scheduled meeting. Due today or overdue → start it; still ahead →
  //      prepare. Declared-status only, so none of the 884 legacy production
  //      rows can be mistaken for an arrangement.
  const scheduled = meetings
    .filter(({ meeting }) => isScheduledMeeting(meeting))
    .map(entry => ({ ...entry, at: scheduleInstant(entry.meeting) }))
    .sort((a, b) => (Number.isNaN(a.at) ? Infinity : a.at) - (Number.isNaN(b.at) ? Infinity : b.at));
  const dueNow = scheduled.find(s => !Number.isNaN(s.at) && dayStart(s.at) <= today);
  if (dueNow) {
    return {
      kind: EMPLOYEE_FILE_ACTION.START_MEETING,
      label: "Start meeting",
      caseId: dueNow.caseObj.id,
      meetingId: dueNow.meeting.id,
    };
  }
  if (scheduled.length > 0) {
    return {
      kind: EMPLOYEE_FILE_ACTION.PREPARE_MEETING,
      label: "Prepare for meeting",
      caseId: scheduled[0].caseObj.id,
      meetingId: scheduled[0].meeting.id,
    };
  }

  // 5. A document is out for signature and has not come back.
  const unsigned = meetings.find(({ meeting }) => SIGNATURE_OUTSTANDING.has(meeting?.signStatus));
  if (unsigned) {
    return {
      kind: EMPLOYEE_FILE_ACTION.CHASE_SIGNATURE,
      label: "Chase signature",
      caseId: unsigned.caseObj.id,
      meetingId: unsigned.meeting.id,
    };
  }

  // 6. A follow-up the manager committed to. Taken from the SAME attention list
  //    the Overview renders, so the button and the section cannot disagree.
  //
  // Matched on the id PREFIX, not on a `kind` field: only buildAttention's own
  // items carry `kind`, while activityAttention and employmentAttention identify
  // themselves by prefix. The prefix is the one discriminator present on every
  // item, so keying on it is the only way this cannot silently match nothing.
  const attention = file.attention || [];
  const byPrefix = p => attention.find(a => typeof a?.id === "string" && a.id.startsWith(p));

  const followUp = byPrefix("followup:");
  if (followUp) {
    return {
      kind: EMPLOYEE_FILE_ACTION.RECORD_FOLLOW_UP,
      label: "Record follow-up",
      activityId: followUp.activityId || null,
    };
  }

  // 7. An employment change whose paperwork was never sent.
  const doc = byPrefix("doc:");
  if (doc) {
    return {
      kind: EMPLOYEE_FILE_ACTION.SEND_DOCUMENTATION,
      label: "Send documentation",
      employmentEventId: doc.employmentEventId || null,
    };
  }

  // 8. The validated process recipe's own next step. Deliberately NOT relabelled
  //    here: "Record outcome", "Appoint appeal manager" and the rest already come
  //    from the deterministic engine the Case View uses, so Employee File cannot
  //    disagree with Case View about what happens next — and nothing is invented
  //    for a process Compass has no recipe for.
  const next = byPrefix("next:");
  if (next) {
    return {
      kind: EMPLOYEE_FILE_ACTION.PROCESS_NEXT_STEP,
      label: next.label,
      caseId: next.caseId || null,
    };
  }

  // 9. An open management concern with nothing yet due on it.
  const concern = (file.openConcerns || [])[0];
  if (concern) {
    return {
      kind: EMPLOYEE_FILE_ACTION.CONTINUE_CONCERN,
      label: "Continue concern",
      activityId: concern.id,
    };
  }

  // 10. The default — and the point of Wave A.
  //
  // NOT offered to a former employee: there is no conversation to have with
  // someone who has left, and offering one would be the same category of wrong as
  // offering "New case" to everybody. Their file stays fully readable; it simply
  // proposes nothing.
  // Gated on being a CURRENT employee only. There is deliberately no capability
  // check invented here: recording a conversation is not an HR-only act, the
  // Activity panel already offers it to every authorised viewer, and inventing a
  // `canRecordActivity` flag would be a permission change dressed as a UX one.
  if (!file.isCurrentEmployee) return null;
  return { kind: EMPLOYEE_FILE_ACTION.START_CONVERSATION, label: "Start conversation" };
}

// ── The intent chooser ─────────────────────────────────────────────────────
//
// What "Start conversation" opens. Derived from the activity types Compass
// actually supports, so the chooser cannot offer something the domain will
// refuse — and it says nothing about activities, records or parentage.
export function conversationIntents(activityTypes = []) {
  return activityTypes
    .filter(t => t && t.id)
    .map(t => ({ id: t.id, label: t.label, description: t.blurb || null }));
}
