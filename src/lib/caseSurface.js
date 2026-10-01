// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 — what earns a place on the default case surface.
//
// B.1 removed the duplicate next-step label and its duplicate button. What was
// left behind was a full-width pale-purple strip holding only supporting text —
// an explanation with nothing to explain, occupying the space between the header
// and the first useful content.
//
// This module decides two things, both presentation-only:
//
//   1. Which next-step REASONS are worth a manager's attention, and which are
//      the engine explaining itself.
//   2. Whether the context strip has anything substantive to hold at all.
//
// ┌─ WHAT THIS MODULE IS NOT ───────────────────────────────────────────────┐
// │ It is not a process engine and it does not change one. getNextStep       │
// │ remains the single authority on what happens next; every reason string   │
// │ it produces is preserved untouched in the data. This only decides where  │
// │ — and whether — a reason is rendered.                                    │
// │                                                                          │
// │ It invents nothing. No AI, no scoring, no new advisory vocabulary.       │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

// The three classes the Wave B.2 brief asked for.
export const REASON_CLASS = Object.freeze({
  // A — essential state context. A fact about where the case IS that the action
  //     label does not already carry. Belongs in "What is happening".
  STATE: "state",
  // B — exceptional warning or clarification. Resolves a real ambiguity the
  //     manager would otherwise get wrong. Belongs next to the action.
  EXCEPTION: "exception",
  // C — rationale: why this step is the right one (ACAS citations, policy
  //     justification) or the engine restating its own label. Genuinely useful,
  //     but not on the default surface.
  RATIONALE: "rationale",
});

// withExistingMeeting() in nextStep.js rewrites a step when a meeting for it
// already exists, and attaches a reason explaining that. Those are the only
// reasons that exist to prevent a specific WRONG ACTION (starting a second
// meeting), so they are the only candidates for class B.
const EXISTING_MEETING_ACTIONS = new Set([
  "resume_meeting", "review_meeting_record", "start_scheduled_meeting",
]);

// A scheduled meeting's reason carries the date and time — information that
// appears nowhere else on the surface. That is state, not rationale.
const SCHEDULED_WHEN = /already arranged for (.+?)\. /;

export function scheduledMeetingWhen(nextStep) {
  if (!nextStep || nextStep.action !== "start_scheduled_meeting") return null;
  const m = SCHEDULED_WHEN.exec(nextStep.reason || "");
  return m ? m[1] : null;
}

// Does this reason describe a situation the manager could genuinely misread?
//
// Only one does: more than one meeting on the case is marked in progress, so
// "Resume meeting" is ambiguous about WHICH meeting it opens. That is a real
// fork in the road and it stays visible.
//
// The others ("it does not need starting or resuming again", "resuming opens the
// same meeting rather than starting another") describe an ambiguity the surface
// no longer has: since B.1 there is exactly ONE action on the case, its label
// says what it does, and the status chip says what state the record is in.
// Nothing offers to start a second meeting, so nothing needs warning against it.
const AMBIGUITY_MARKERS = [
  /\bmeetings on this case are marked in progress\b/i,
];

export function classifyNextStepReason(nextStep) {
  const reason = nextStep?.reason;
  if (!reason || typeof reason !== "string" || !reason.trim()) return null;

  if (AMBIGUITY_MARKERS.some(re => re.test(reason))) return REASON_CLASS.EXCEPTION;

  // A scheduled meeting's date/time is a fact about the case, surfaced through
  // "What is happening" rather than repeated as a second explanation.
  if (scheduledMeetingWhen(nextStep)) return REASON_CLASS.STATE;

  // Everything else from withExistingMeeting restates the action label.
  if (EXISTING_MEETING_ACTIONS.has(nextStep.action)) return REASON_CLASS.RATIONALE;

  // The remaining reasons are the process recipes' own justification — ACAS
  // citations and policy rationale. Valuable, and deliberately NOT deleted:
  // they stay on the nextStep object for anywhere that wants to explain itself.
  // They simply do not earn permanent space above the case record.
  return REASON_CLASS.RATIONALE;
}

// Only a class B reason appears on the default surface, and then beside the
// action it qualifies rather than in a strip of its own.
export function reasonForDefaultSurface(nextStep) {
  return classifyNextStepReason(nextStep) === REASON_CLASS.EXCEPTION
    ? nextStep.reason
    : null;
}

// ── Does the context strip have anything substantive to hold? ───────────────
//
// The strip is a real container for real things: the appeal hearing-arrangements
// form, an inline letter draft, a persisted next-action signal the user can
// accept or dismiss, a live investigation's progress, a secondary choice that
// differs from the primary action, and a class B warning.
//
// It is NOT a home for an explanation of the button above it. With none of the
// below present it does not render — which is the whole of finding one.
export function hasSubstantiveContext({
  exceptionReason = null,
  hasSecondaryAction = false,
  hasInvestigatorProgress = false,
  hasNextActionSignal = false,
  showAppealInviteLogistics = false,
  showInlineDraft = false,
  hasOpenChecklist = false,
} = {}) {
  return Boolean(
    exceptionReason ||
    hasSecondaryAction ||
    hasInvestigatorProgress ||
    hasNextActionSignal ||
    showAppealInviteLogistics ||
    showInlineDraft ||
    // Undone per-meeting next steps live behind this strip's "Details" toggle,
    // and so does the toggle. Hiding the container would stand them both down
    // together and leave real outstanding work unreachable.
    hasOpenChecklist
  );
}

// ── Case information ────────────────────────────────────────────────────────
//
// Description, who referred the case, and whether this employee has been here
// before are basic case facts. They were reachable only by opening a section
// called "Checks and analysis", which is neither a check nor an analysis.
//
// Owner is deliberately absent: it is already in the case header, and one
// authoritative placement is enough.
export function caseInformationItems(cs, { repeatCount = 0 } = {}) {
  if (!cs) return [];
  const items = [];
  if (cs.description) items.push({ id: "description", label: "Description", value: cs.description });
  if (cs.referredBy) items.push({ id: "referredBy", label: "Referred by", value: cs.referredBy });
  if (repeatCount > 1) {
    items.push({
      id: "repeat",
      label: "Previous cases",
      value: `This is case ${repeatCount} for ${cs.employeeName}.`,
    });
  }
  return items;
}

// A blank description is not news. It earns a restrained empty state only where
// someone is actually looking at case information — never a prominent
// "No description recorded." on the default surface.
export function hasCaseInformation(cs, opts) {
  return caseInformationItems(cs, opts).length > 0;
}
