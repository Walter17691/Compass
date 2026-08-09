import { getCaseStage, isGrievanceCase } from './caseStage.js';

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
export function getNextStep(cs) {
  const stage = getCaseStage(cs);
  if(stage==="closed") return null;
  return isGrievanceCase(cs) ? grievanceNextStep(cs, stage) : disciplinaryNextStep(cs, stage);
}

function disciplinaryNextStep(cs, stage) {
  const meetings = cs.meetings||[];
  const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation"));
  const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary"));
  const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal"));
  const lastInv = invMeetings[invMeetings.length-1];
  const lastDisc = discMeetings[discMeetings.length-1];
  const lastAppeal = appealMeetings[appealMeetings.length-1];
  const hasDiscOutcome = discMeetings.some(m=>m.letterOutput);
  const hasAppealOutcome = appealMeetings.some(m=>m.letterOutput);

  switch(stage) {
    case "intake":
      return {label:"Schedule investigation meeting", action:"start_investigation", meetingType:"investigation", primary:true, reason:"No fact-finding has started yet — ACAS recommends investigating without unreasonable delay."};
    case "investigation":
      if(!lastInv?.record) return {label:"Start investigation meeting", action:"start_investigation", meetingType:"investigation", primary:true, reason:"No investigation meeting recorded yet."};
      if(lastInv?.signStatus!=="signed") return {label:"Send investigation record for signature", action:"send_signature", meetingType:"investigation", primary:true, reason:"The employee should confirm the record is accurate before it's relied on."};
      return {label:"Generate investigation report", action:"inv_report", meetingType:"investigation", primary:true, reason:"Investigation meetings are complete — summarise findings before deciding next steps."};
    case "inv_report":
      return {label:"Proceed to disciplinary — send invitation", action:"disciplinary_invite", meetingType:"disciplinary", primary:true, reason:"ACAS Code: give the employee written notice of the allegations and evidence in good time before any hearing.", secondary:{label:"No case to answer — close", action:"close_no_case"}};
    case "disciplinary":
      if(!lastDisc?.record) return {label:"Start disciplinary hearing", action:"start_disciplinary", meetingType:"disciplinary", primary:true, reason:"Invitation sent — the hearing hasn't been held yet."};
      if(lastDisc?.signStatus!=="signed") return {label:"Send hearing record for signature", action:"send_signature", meetingType:"disciplinary", primary:true, reason:"The employee should confirm the hearing record is accurate."};
      if(!hasDiscOutcome) return {label:"Draft outcome letter", action:"outcome_letter", meetingType:"disciplinary", primary:true, reason:"ACAS Code: confirm the decision in writing, normally within 5 working days of the hearing."};
      return {label:"Outcome issued — close or appeal", action:"post_outcome", meetingType:"disciplinary", primary:true, reason:"Outcome letter sent — wait out the appeal window or close the case."};
    case "outcome":
      return {label:"Close case", action:"close_case", meetingType:"disciplinary", primary:true, reason:"Outcome has been issued and no appeal is in progress."};
    case "appeal":
      if(!lastAppeal?.record) return {label:"Start appeal hearing", action:"start_appeal_meeting", meetingType:"appeal-disciplinary", primary:true, reason:"An appeal has been raised but not yet heard."};
      if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", meetingType:"appeal-disciplinary", primary:true, reason:"The employee should confirm the appeal hearing record is accurate."};
      if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", meetingType:"appeal-disciplinary", primary:true, reason:"ACAS Code: confirm the appeal decision in writing — this is the final stage of the internal process."};
      return {label:"Appeal outcome issued — close case", action:"close_case", meetingType:"appeal-disciplinary", primary:true, reason:"The appeal is the final stage — nothing further to issue."};
    default:
      return null;
  }
}

// Grievance (ACAS S6) has no investigation-vs-hearing split the way
// disciplinary does — one meeting type ("grievance") covers the hearing
// itself, so this collapses to a single "hearing" stage instead of
// disciplinary's investigation -> inv_report -> disciplinary chain.
function grievanceNextStep(cs, stage) {
  const meetings = cs.meetings||[];
  const hearingMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("grievance")&&!(m.type||"").toLowerCase().includes("appeal"));
  const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal"));
  const lastHearing = hearingMeetings[hearingMeetings.length-1];
  const lastAppeal = appealMeetings[appealMeetings.length-1];
  const hasHearingOutcome = hearingMeetings.some(m=>m.letterOutput);
  const hasAppealOutcome = appealMeetings.some(m=>m.letterOutput);

  switch(stage) {
    case "intake":
      return {label:"Schedule grievance meeting", action:"start_hearing", meetingType:"grievance", primary:true, reason:"No grievance meeting has been held yet — ACAS recommends dealing with grievances promptly."};
    case "hearing":
      if(!lastHearing?.record) return {label:"Start grievance meeting", action:"start_hearing", meetingType:"grievance", primary:true, reason:"No grievance meeting recorded yet."};
      if(lastHearing?.signStatus!=="signed") return {label:"Send grievance record for signature", action:"send_signature", meetingType:"grievance", primary:true, reason:"The employee should confirm the record is accurate before it's relied on."};
      if(!hasHearingOutcome) return {label:"Draft grievance outcome letter", action:"outcome_letter", meetingType:"grievance", primary:true, reason:"ACAS Code: confirm the outcome in writing without unreasonable delay."};
      return {label:"Outcome issued — close or appeal", action:"post_outcome", meetingType:"grievance", primary:true, reason:"Outcome letter sent — wait out the appeal window or close the case."};
    case "outcome":
      return {label:"Close case", action:"close_case", meetingType:"grievance", primary:true, reason:"Outcome has been issued and no appeal is in progress."};
    case "appeal":
      if(!lastAppeal?.record) return {label:"Start appeal hearing", action:"start_appeal_meeting", meetingType:"appeal-grievance", primary:true, reason:"An appeal has been raised but not yet heard."};
      if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", meetingType:"appeal-grievance", primary:true, reason:"The employee should confirm the appeal hearing record is accurate."};
      if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", meetingType:"appeal-grievance", primary:true, reason:"ACAS Code: confirm the appeal decision in writing — this is the final stage of the internal process."};
      return {label:"Appeal outcome issued — close case", action:"close_case", meetingType:"appeal-grievance", primary:true, reason:"The appeal is the final stage — nothing further to issue."};
    default:
      return null;
  }
}
