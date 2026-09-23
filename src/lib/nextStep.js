import { getCaseStage, isGrievanceCase, hasLetterType } from './caseStage.js';
import { isInvestigationMeeting, isDisciplinaryMeeting, isAppealMeeting, isGrievanceMeeting } from './meetingTypeMatch.js';
import { isMeetingComplete, lastGenuineMeeting, scheduledMeetingsFor } from './meetingLifecycle.js';

// Case Copilot's recommended next action — pure function of a case's
// current stage, type, and meeting history, no I/O. Drives the "Next
// action" banner on Home, Cases, the case view, and Reports.
//
// Every branch carries a `meetingType` (matching MEETING_TYPES ids) —
// the meeting most relevant to that step, whether that means starting a
// new one or finding the existing one to chase a signature or draft a
// letter for. Consumers (App.jsx's Copilot banner) key off this field
// directly instead of re-deriving a meeting type from the action name via
// a disciplinary-shaped ternary, which is what made this function
// disciplinary-only before — a grievance case's "hearing" stage has no
// equivalent in "investigation"/"disciplinary"/"appeal-disciplinary".
//
// The disciplinary "post_outcome" and appeal's final "close_case"
// branches below used to be effectively unreachable: getCaseStage()
// auto-classified a case as "closed" the moment any meeting was signed
// and any meeting carried a letter output, checked across the whole
// meetings array — exactly the combination a signed hearing + its saved
// outcome letter produces — before the appeal window had necessarily
// run. Fixed in caseStage.js by making an explicitly-tracked cs.stage
// win over that heuristic, so these branches are now reachable.
function normalizedCaseType(cs) {
  return (cs?.caseType||"").trim().toLowerCase();
}

// Appeal Independence P1 (2026-09-18) — ctx is optional and additive
// (every existing caller that omits it, e.g. App.jsx's generateNextBestAction
// AI-prompt floor check, keeps its exact prior behaviour: ctx.hasAppealManager
// is undefined/falsy, same as "no officer" would be, which only ever changes
// the *label* offered, never blocks anything). ctx.isHR gates the new
// "Appoint appeal officer" suggestion specifically — a non-HR viewer sees the
// unchanged "Start appeal hearing" suggestion, matching the existing isHR-only
// gating on the manual "Appoint appeal officer" button in the same bar
// (CaseViewScreen.jsx), so this doesn't introduce an inconsistent UX where one
// entry point is hidden from non-HR users and the other isn't.
export function getNextStep(cs, ctx = {}) {
  return withScheduledMeeting(cs, baseNextStep(cs, ctx));
}

function baseNextStep(cs, ctx = {}) {
  const stage = getCaseStage(cs);
  if(stage==="closed") return null;
  const type = normalizedCaseType(cs);
  if(type==="probation") return probationNextStep(stage);
  if(type==="flexible working"||type==="flexible_working") return flexibleWorkingNextStep(stage, ctx);
  if(type==="long-term sickness"||type==="long term sickness"||type==="long_term_sickness") return longTermSicknessNextStep(stage);
  return isGrievanceCase(cs) ? grievanceNextStep(cs, stage, ctx) : disciplinaryNextStep(cs, stage, ctx);
}

// Release 1 Phase 2.3 — one shared lifecycle rule, applied after the recipe
// rather than inside it.
//
// A recipe asks "has this meeting happened?" and, if not, says hold it. That
// was complete while a meeting could not exist before it happened. Now that a
// meeting can be ARRANGED first, a recipe would keep telling the user to
// schedule a meeting that is already in the diary.
//
// Rather than teach five recipes bespoke scheduled logic, the "hold a meeting"
// steps are rewritten once, here, when a matching meeting is already
// scheduled. Recipes, labels, ordering and supported case types are untouched,
// and a case with no scheduled meeting — which is every legacy case, and every
// case in the production parity fixture — gets its exact prior answer back.
const SCHEDULABLE_ACTIONS = new Set(["start_investigation", "start_disciplinary", "start_appeal_meeting", "start_hearing"]);

// Maps a step's meetingType id onto the same type matcher the recipes use, so
// "which scheduled meeting does this step mean" is never re-derived
// differently. Types with no matcher (formal, return) simply never match,
// which leaves their steps untouched rather than guessing.
function matcherForMeetingType(meetingType) {
  const id = meetingType || "";
  if(id.startsWith("appeal-")) return isAppealMeeting;
  if(id==="investigation") return isInvestigationMeeting;
  if(id==="disciplinary") return isDisciplinaryMeeting;
  if(id==="grievance") return isGrievanceMeeting;
  return null;
}

export function withScheduledMeeting(cs, step) {
  if(!step || !SCHEDULABLE_ACTIONS.has(step.action)) return step;
  const matcher = matcherForMeetingType(step.meetingType);
  if(!matcher) return step;
  const scheduled = scheduledMeetingsFor(cs).find(m => matcher(m.type));
  if(!scheduled) return step;
  const when = [scheduled.schedule?.date, scheduled.schedule?.time].filter(Boolean).join(" at ");
  return {
    ...step,
    label: "Start scheduled meeting",
    action: "start_scheduled_meeting",
    // The id is carried so the caller starts THIS meeting rather than
    // re-deriving which one the step meant.
    scheduledMeetingId: scheduled.id,
    reason: when
      ? `This meeting is already arranged for ${when}. Starting it opens the same meeting that was scheduled.`
      : "This meeting is already arranged. Starting it opens the same meeting that was scheduled.",
  };
}

// Shared by disciplinaryNextStep/grievanceNextStep/flexibleWorkingNextStep's
// own "appeal" branches — one appointment-sequencing rule, not three
// independently-maintained copies. Reads only ctx (never a second source of
// truth for appeal-manager state — callers derive ctx.hasAppealManager from
// the same case_access array CaseViewScreen already reads for appealManagerName).
function appointOfficerStepIfNeeded(ctx) {
  if(ctx.hasAppealManager || !ctx.isHR) return null;
  return {label:"Appoint appeal officer", action:"appoint_appeal_officer", meetingType:null, primary:true, reason:"An appeal has been raised — ACAS guidance expects an impartial appeal officer to be appointed before the hearing is arranged."};
}

function disciplinaryNextStep(cs, stage, ctx = {}) {
  const meetings = cs.meetings||[];
  const invMeetings = meetings.filter(m=>isInvestigationMeeting(m.type));
  const discMeetings = meetings.filter(m=>isDisciplinaryMeeting(m.type));
  const appealMeetings = meetings.filter(m=>isAppealMeeting(m.type));
  // Release 1 Phase 1 — "which genuine meeting happened last?" now excludes
  // letter-shaped artefacts (lastGenuineMeeting). The type-filtered
  // collections above are deliberately NOT filtered, because hasLetterType
  // below asks a different question — "was a letter of type X ever saved?" —
  // and a saved invitation is a real fact about the case. Filtering letters
  // out of those collections made Compass offer to draft an appeal
  // invitation that already existed (proven against production data, Phase 0
  // parity harness, 2026-09-22).
  const lastInv = lastGenuineMeeting(invMeetings);
  const lastDisc = lastGenuineMeeting(discMeetings);
  const lastAppeal = lastGenuineMeeting(appealMeetings);
  // Human UAT remediation, Batch 2 hardening — these used to check
  // "some meeting of this type has any letterOutput at all", which a
  // disciplinary/appeal hearing INVITATION satisfies just as well as the
  // real outcome letter — drafting and saving an invitation could make
  // the Copilot banner skip straight to "Outcome issued — close or
  // appeal" without any decision ever having been made. hasLetterType
  // checks the letter's actual recorded type when known (see
  // caseStage.js).
  const hasDiscOutcome = hasLetterType(discMeetings, "outcome");
  const hasAppealOutcome = hasLetterType(appealMeetings, "appeal");
  // Appeal Hearing Control Remediation (2026-09-18) — mirrors hasDiscOutcome/
  // hasAppealOutcome's own hasLetterType usage exactly: this only proves an
  // invitation letter was drafted AND saved onto an appeal-type meeting
  // record (m.letterOutput + m.letterType==="invite"), never that it was
  // actually sent to the employee — Compass has no reliable "sent" signal
  // for this (letterTracking is keyed by letterId, populated only once a
  // real send happens via /api/send-letter, and isn't consulted by any
  // other next-step check either). The suggested-step label below is
  // worded as "Draft appeal hearing invitation" specifically to stay
  // truthful about what this actually proves.
  const hasAppealInvitation = hasLetterType(appealMeetings, "invite");

  switch(stage) {
    case "intake":
      return {label:"Schedule investigation meeting", action:"start_investigation", meetingType:"investigation", primary:true, reason:"No fact-finding has started yet — ACAS recommends investigating without unreasonable delay."};
    case "investigation":
      // Release 1 Phase 1 — workflow completion is a lifecycle question, not
      // "did an AI record get generated". For a legacy meeting
      // isMeetingComplete still falls back to record presence, preserving
      // this branch's exact historical behaviour; for a Phase 2 meeting the
      // declared status is authoritative. m.record stays meaningful as
      // CONTENT everywhere else — only its use as workflow state moves here.
      if(!isMeetingComplete(lastInv)) return {label:"Start investigation meeting", action:"start_investigation", meetingType:"investigation", primary:true, reason:"No investigation meeting recorded yet."};
      if(lastInv?.signStatus!=="signed") return {label:"Send investigation record for signature", action:"send_signature", meetingType:"investigation", primary:true, reason:"The employee should confirm the record is accurate before it's relied on."};
      return {label:"Generate investigation report", action:"inv_report", meetingType:"investigation", primary:true, reason:"Investigation meetings are complete — summarise findings before deciding next steps."};
    case "inv_report":
      return {label:"Proceed to disciplinary — send invitation", action:"disciplinary_invite", meetingType:"disciplinary", primary:true, reason:"ACAS Code: give the employee written notice of the allegations and evidence in good time before any hearing.", secondary:{label:"No case to answer — close", action:"close_no_case"}};
    case "disciplinary":
      if(!isMeetingComplete(lastDisc)) return {label:"Start disciplinary hearing", action:"start_disciplinary", meetingType:"disciplinary", primary:true, reason:"Invitation sent — the hearing hasn't been held yet."};
      if(lastDisc?.signStatus!=="signed") return {label:"Send hearing record for signature", action:"send_signature", meetingType:"disciplinary", primary:true, reason:"The employee should confirm the hearing record is accurate."};
      if(!hasDiscOutcome) return {label:"Draft outcome letter", action:"outcome_letter", meetingType:"disciplinary", primary:true, reason:"ACAS Code: confirm the decision in writing, normally within 5 working days of the hearing."};
      return {label:"Outcome issued — close or appeal", action:"post_outcome", meetingType:"disciplinary", primary:true, reason:"Outcome letter sent — wait out the appeal window or close the case."};
    case "outcome":
      // Defect #17 remediation — "outcome" stage is now reached as soon as
      // cs.outcome is decided (caseStage.js's inferDisciplinaryStage), which
      // can happen before its formal letter has ever been drafted or saved
      // (OutcomeModal's finalizeOutcome sets cs.outcome and opens a letter
      // draft, but nothing requires that draft to be saved before HR moves
      // on). Previously this branch assumed "outcome" stage could only ever
      // mean a saved letter already existed (the only way to reach it used
      // to be a saved letter itself, via hasLetterType) and went straight to
      // "Close case" unconditionally — which, combined with "disciplinary"
      // stage checking hearing-signature before its own outcome-letter
      // check, left no reachable next-step suggestion at all for a decided-
      // but-undocumented outcome. hasDiscOutcome (defined above from the
      // same discMeetings/hasLetterType check "disciplinary" stage already
      // used) now gates the same way here: draft the letter first if it's
      // missing, only offer to close once it's actually been saved.
      if(!hasDiscOutcome) return {label:"Draft outcome letter", action:"outcome_letter", meetingType:"disciplinary", primary:true, reason:"ACAS Code: confirm the decision in writing, normally within 5 working days of the hearing."};
      return {label:"Close case", action:"close_case", meetingType:"disciplinary", primary:true, reason:"Outcome has been issued and no appeal is in progress."};
    case "appeal": {
      const appointStep = appointOfficerStepIfNeeded(ctx);
      if(appointStep) return appointStep;
      // Appeal Hearing Control Remediation (2026-09-18) — an officer being
      // appointed is not the same as an invitation existing; this closes
      // the gap the disciplinary pathway already closed for itself
      // (inv_report's own "Proceed to disciplinary — send invitation"
      // step) but the appeal pathway never had. Only offered once an
      // appeal_manager exists (ctx.hasAppealManager) — otherwise appeal_
      // invite would have no authoritative officer identity to ground the
      // letter in.
      if(ctx.hasAppealManager && !hasAppealInvitation) return {label:"Draft appeal hearing invitation", action:"appeal_invite", meetingType:"appeal-disciplinary", primary:true, reason:"An appeal officer has been appointed — ACAS guidance expects the hearing invitation to confirm the grounds and the right to be accompanied before the hearing itself."};
      if(!isMeetingComplete(lastAppeal)) return {label:"Start appeal hearing", action:"start_appeal_meeting", meetingType:"appeal-disciplinary", primary:true, reason:"An appeal has been raised but not yet heard."};
      if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", meetingType:"appeal-disciplinary", primary:true, reason:"The employee should confirm the appeal hearing record is accurate."};
      if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", meetingType:"appeal-disciplinary", primary:true, reason:"ACAS Code: confirm the appeal decision in writing — this is the final stage of the internal process."};
      return {label:"Appeal outcome issued — close case", action:"close_case", meetingType:"appeal-disciplinary", primary:true, reason:"The appeal is the final stage — nothing further to issue."};
    }
    default:
      return null;
  }
}

// Grievance (ACAS S6) has no investigation-vs-hearing split the way
// disciplinary does — one meeting type ("grievance") covers the hearing
// itself, so this collapses to a single "hearing" stage instead of
// disciplinary's investigation -> inv_report -> disciplinary chain.
function grievanceNextStep(cs, stage, ctx = {}) {
  const meetings = cs.meetings||[];
  const hearingMeetings = meetings.filter(m=>isGrievanceMeeting(m.type));
  const appealMeetings = meetings.filter(m=>isAppealMeeting(m.type));
  // See disciplinaryNextStep's own comment — same distinction, same reason.
  const lastHearing = lastGenuineMeeting(hearingMeetings);
  const lastAppeal = lastGenuineMeeting(appealMeetings);
  const hasHearingOutcome = hasLetterType(hearingMeetings, "outcome");
  const hasAppealOutcome = hasLetterType(appealMeetings, "appeal");
  // Appeal Hearing Control Remediation (2026-09-18) — see disciplinaryNextStep's
  // own identical comment; same truthful "drafted, not provably sent" caveat.
  const hasAppealInvitation = hasLetterType(appealMeetings, "invite");

  switch(stage) {
    case "intake":
      return {label:"Schedule grievance meeting", action:"start_hearing", meetingType:"grievance", primary:true, reason:"No grievance meeting has been held yet — ACAS recommends dealing with grievances promptly."};
    case "hearing":
      if(!isMeetingComplete(lastHearing)) return {label:"Start grievance meeting", action:"start_hearing", meetingType:"grievance", primary:true, reason:"No grievance meeting recorded yet."};
      if(lastHearing?.signStatus!=="signed") return {label:"Send grievance record for signature", action:"send_signature", meetingType:"grievance", primary:true, reason:"The employee should confirm the record is accurate before it's relied on."};
      if(!hasHearingOutcome) return {label:"Draft grievance outcome letter", action:"outcome_letter", meetingType:"grievance", primary:true, reason:"ACAS Code: confirm the outcome in writing without unreasonable delay."};
      return {label:"Outcome issued — close or appeal", action:"post_outcome", meetingType:"grievance", primary:true, reason:"Outcome letter sent — wait out the appeal window or close the case."};
    case "outcome":
      // Defect #17 remediation — same fix as disciplinaryNextStep's own
      // "outcome" branch above, for the same reason (a grievance decision
      // can now reach "outcome" stage via cs.outcome alone, before its
      // letter has been saved).
      if(!hasHearingOutcome) return {label:"Draft grievance outcome letter", action:"outcome_letter", meetingType:"grievance", primary:true, reason:"ACAS Code: confirm the outcome in writing without unreasonable delay."};
      return {label:"Close case", action:"close_case", meetingType:"grievance", primary:true, reason:"Outcome has been issued and no appeal is in progress."};
    case "appeal": {
      const appointStep = appointOfficerStepIfNeeded(ctx);
      if(appointStep) return appointStep;
      if(ctx.hasAppealManager && !hasAppealInvitation) return {label:"Draft appeal hearing invitation", action:"appeal_invite", meetingType:"appeal-grievance", primary:true, reason:"An appeal officer has been appointed — ACAS guidance expects the hearing invitation to confirm the grounds and the right to be accompanied before the hearing itself."};
      if(!isMeetingComplete(lastAppeal)) return {label:"Start appeal hearing", action:"start_appeal_meeting", meetingType:"appeal-grievance", primary:true, reason:"An appeal has been raised but not yet heard."};
      if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", meetingType:"appeal-grievance", primary:true, reason:"The employee should confirm the appeal hearing record is accurate."};
      if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", meetingType:"appeal-grievance", primary:true, reason:"ACAS Code: confirm the appeal decision in writing — this is the final stage of the internal process."};
      return {label:"Appeal outcome issued — close case", action:"close_case", meetingType:"appeal-grievance", primary:true, reason:"The appeal is the final stage — nothing further to issue."};
    }
    default:
      return null;
  }
}

// P2 — regular-case-flow probation (deliberately separate from
// DevelopScreen's own dedicated probation/appraisal/PDP flow, which has
// its own outcome options and letter templates already). "formal"
// (Formal Meeting, ERA 1996) is the closest existing "er"-group meeting
// type — the dedicated "Probation Review" meeting type is reserved for
// DevelopScreen's dev-group flow and shouldn't be reused here.
function probationNextStep(stage) {
  switch(stage) {
    case "probation_started":
      return {label:"Schedule a check-in", action:"check_in", meetingType:"formal", primary:true, reason:"Regular check-ins during probation help identify concerns early, while there's still time to address them."};
    case "check_in":
      return {label:"Note any concerns raised", action:"concerns_raised", meetingType:"formal", primary:true, reason:"Document specific concerns as they arise so they can be fairly addressed before any decision."};
    case "concerns_raised":
      return {label:"Decide: extend probation or move to review", action:"extension_or_review", meetingType:"formal", primary:true, reason:"Concerns raised during probation should lead to a clear decision on extension or confirmation, not drift."};
    case "extension_or_review":
      return {label:"Record the outcome", action:"outcome", meetingType:"formal", primary:true, reason:"Confirm whether probation is passed, extended, or employment ends."};
    case "outcome":
      return {label:"Close case", action:"close_case", meetingType:"formal", primary:true, reason:"Outcome has been recorded."};
    default:
      return null;
  }
}

// P2 — statutory flexible working request, regular case flow.
function flexibleWorkingNextStep(stage, ctx = {}) {
  switch(stage) {
    case "request_received":
      return {label:"Assess the request", action:"assessment", meetingType:"formal", primary:true, reason:"A statutory flexible working request must be considered in a reasonable manner."};
    case "assessment":
      return {label:"Hold a decision meeting", action:"decision_meeting", meetingType:"formal", primary:true, reason:"Discuss the request with the employee before deciding."};
    case "decision_meeting":
      return {label:"Confirm the decision in writing", action:"decision", meetingType:"formal", primary:true, reason:"The decision, and any business reason for refusal, should be confirmed in writing within the statutory timeframe."};
    case "decision":
      return {label:"Close case", action:"close_case", meetingType:"formal", primary:true, reason:"Decision has been issued and no appeal is in progress."};
    case "appeal": {
      const appointStep = appointOfficerStepIfNeeded(ctx);
      if(appointStep) return appointStep;
      return {label:"Hear the appeal", action:"start_appeal_meeting", meetingType:"formal", primary:true, reason:"An appeal has been raised against the flexible working decision."};
    }
    default:
      return null;
  }
}

// P2 — "return" (Return to Work, EqA 2010) is the closest existing
// meeting type for the earlier welfare-contact stages; later stages
// shift toward a formal capability conversation, so "formal" from there.
function longTermSicknessNextStep(stage) {
  switch(stage) {
    case "absence_identified":
      return {label:"Make contact with the employee", action:"contact_employee", meetingType:"return", primary:true, reason:"Regular, supportive contact during long-term sickness absence is expected under most attendance policies."};
    case "contact_welfare":
      return {label:"Request medical evidence", action:"request_medical_evidence", meetingType:"return", primary:true, reason:"A fit note or GP evidence should confirm the nature and expected duration of the absence."};
    case "medical_evidence":
      return {label:"Consider an Occupational Health referral", action:"oh_referral", meetingType:"return", primary:true, reason:"OH input helps identify whether reasonable adjustments could support a return to work."};
    case "occupational_health":
      return {label:"Consider reasonable adjustments", action:"adjustments", meetingType:"return", primary:true, reason:"The Equality Act may require reasonable adjustments to be considered before any capability step."};
    case "adjustments_considered":
      return {label:"Hold a review meeting", action:"review_meeting", meetingType:"return", primary:true, reason:"A review meeting checks whether adjustments are working, or whether the absence is ongoing."};
    case "review":
      return {label:"Consider capability process if absence continues", action:"capability_consideration", meetingType:"formal", primary:true, reason:"With no clear return-to-work date, this may need to move to a formal capability process."};
    case "capability_consideration":
      return {label:"Prepare a decision", action:"decision", meetingType:"formal", primary:true, reason:"A decision should be reasoned, documented, and follow a fair process."};
    case "decision":
      return {label:"Close case", action:"close_case", meetingType:"formal", primary:true, reason:"A decision has been reached."};
    default:
      return null;
  }
}
