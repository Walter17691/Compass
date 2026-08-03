import { getCaseStage } from './caseStage.js';

// Case Copilot's recommended next action — pure function of a case's
// current stage and meeting history, no I/O. Drives the "Next action"
// banner on Home, Cases, the case view, and Reports, so every stage in
// the disciplinary/appeal lifecycle needs a correct, ACAS-Code-grounded
// recommendation here.
//
// KNOWN GAP: the disciplinary "post_outcome" and appeal's final
// "close_case" branches below are effectively unreachable in real usage.
// getCaseStage() (./caseStage.js) auto-classifies a case as "closed" the
// moment ANY meeting is signed AND ANY meeting carries a letter output —
// checked across the whole meetings array, not scoped to one meeting —
// which is exactly the combination a signed hearing + saved outcome
// letter produces (each saveMeetingToCase call appends a new meeting
// entry, so they're usually two different entries). That happens before
// the appeal window has necessarily run. Net effect: cases can be
// silently marked closed while an appeal is still legally live, which
// also suppresses the appeal-window deadline in deadlines.js (it skips
// closed cases outright). See src/test/nextStep.test.js for the tests
// that caught this — left unfixed here since changing getCaseStage's
// classification affects every screen that reads case stage.
export function getNextStep(cs) {
  if(getCaseStage(cs)==="closed") return null;
  const stage = getCaseStage(cs);
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
      return {label:"Schedule investigation meeting", action:"start_investigation", primary:true, reason:"No fact-finding has started yet — ACAS recommends investigating without unreasonable delay."};
    case "investigation":
      if(!lastInv?.record) return {label:"Start investigation meeting", action:"start_investigation", primary:true, reason:"No investigation meeting recorded yet."};
      if(lastInv?.signStatus!=="signed") return {label:"Send investigation record for signature", action:"send_signature", primary:true, reason:"The employee should confirm the record is accurate before it's relied on."};
      return {label:"Generate investigation report", action:"inv_report", primary:true, reason:"Investigation meetings are complete — summarise findings before deciding next steps."};
    case "inv_report":
      return {label:"Proceed to disciplinary — send invitation", action:"disciplinary_invite", primary:true, reason:"ACAS Code: give the employee written notice of the allegations and evidence in good time before any hearing.", secondary:{label:"No case to answer — close", action:"close_no_case"}};
    case "disciplinary":
      if(!lastDisc?.record) return {label:"Start disciplinary hearing", action:"start_disciplinary", primary:true, reason:"Invitation sent — the hearing hasn't been held yet."};
      if(lastDisc?.signStatus!=="signed") return {label:"Send hearing record for signature", action:"send_signature", primary:true, reason:"The employee should confirm the hearing record is accurate."};
      if(!hasDiscOutcome) return {label:"Draft outcome letter", action:"outcome_letter", primary:true, reason:"ACAS Code: confirm the decision in writing, normally within 5 working days of the hearing."};
      return {label:"Outcome issued — close or appeal", action:"post_outcome", primary:true, reason:"Outcome letter sent — wait out the appeal window or close the case."};
    case "outcome":
      return {label:"Close case", action:"close_case", primary:true, reason:"Outcome has been issued and no appeal is in progress."};
    case "appeal":
      if(!lastAppeal?.record) return {label:"Start appeal hearing", action:"start_appeal_meeting", primary:true, reason:"An appeal has been raised but not yet heard."};
      if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", primary:true, reason:"The employee should confirm the appeal hearing record is accurate."};
      if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", primary:true, reason:"ACAS Code: confirm the appeal decision in writing — this is the final stage of the internal process."};
      return {label:"Appeal outcome issued — close case", action:"close_case", primary:true, reason:"The appeal is the final stage — nothing further to issue."};
    default:
      return null;
  }
}
