import { useRef, useState } from 'react';
import { approvalActionForOutcome, approvalActionLabel } from '../lib/approvals';
import { computeDecisionQualityGaps } from '../lib/decisionQuality';
import { DecisionQualityCheckModal } from '../components/DecisionQualityCheckModal';
import { useModalA11y } from '../hooks/useModalA11y';
import { isDisciplinaryMeeting, isGrievanceMeeting } from '../lib/meetingTypeMatch';
import { isWarningOutcome, isValidWarningDurationMonths } from '../lib/outcomeTypes';
import { addCalendarMonths, toISODateLocal } from '../lib/dates';
import { COLOR, FONT } from '../styles/tokens';

// Defect #11/#12/#13 remediation — every other handleLetter call site
// (CaseViewScreen.jsx's disciplinary_invite/outcome_letter/appeal/no-
// case-answer actions) sets caseInfo.employee/manager and reviewOutput
// from the authoritative case + its own relevant hearing meeting
// immediately before drafting a letter. This modal's own "Issue outcome
// & generate letter" button was the one call site that never did either
// — handleLetter's prompt got no explicit "Employee: X" fact and no
// meeting-record context at all, so the AI fell back to the case's own
// free-text description (which named a different real participant, a
// reporting manager, in a way that read as if they were the case
// subject) and had no source for the hearing's actual decided warning
// duration or hearing manager name, filling both with generic guesses.
// Mirrors CaseViewScreen's own relevantMeeting() (a local, unexported
// closure there) rather than importing it, since it's this small and
// this modal has no other reason to depend on that file.
function findOutcomeRelevantMeeting(cs) {
  const meetings = cs?.meetings || [];
  const matching = meetings.filter(m => isDisciplinaryMeeting(m.type) || isGrievanceMeeting(m.type));
  return matching[matching.length - 1] || meetings[meetings.length - 1] || null;
}

// Shared audit-detail text for both "Outcome issued" (finalizeOutcome)
// and "Outcome details amended" (completeOutcomeDetails) — structured,
// non-sensitive (no free-text outcomeNotes rationale included, only the
// facts a reader needs to establish what/when/duration/expiry), same
// shape either way so the two audit actions read as clearly related.
function describeOutcomeDetail(outcomeType, issuedAt, durationMonths, expiresAt, {amended}={}) {
  const parts = [
    outcomeType,
    `${amended?"issue date confirmed as":"issued"} ${issuedAt.toLocaleDateString("en-GB")}`,
  ];
  if(durationMonths) parts.push(`duration: ${durationMonths} month${durationMonths===1?"":"s"}`);
  if(expiresAt) parts.push(`expires ${new Date(expiresAt).toLocaleDateString("en-GB")}`);
  return parts.join(" — ");
}

// Process Intelligence (P9) — issuing the outcome itself is unchanged
// (case saved, letter drafted); for
// the spec's own approval-gated outcome types this ALSO opens a visible,
// trackable approval request (requestHrReview, generalized beyond its
// original single "record" step) so the decision shows as "Awaiting
// approval" until someone with sign-off records a decision — advisory
// tracking, not yet a hard block on sending, matching this whole
// codebase's established never-block-HR posture (M8/M9's own "advisory
// only" precedent).
//
// Process Intelligence (P11) — "Issue outcome" is also where
// computeDecisionQualityGaps gets checked, gating letter generation via
// the same "Proceed anyway" pattern as everywhere else in this codebase.
// Kept as component-local state (not lifted to App.jsx like Meeting
// Intelligence's equivalent) since OutcomeModal is already a
// self-contained modal, not a full screen orchestrated from App.jsx —
// nothing else needs to know this check ran.
export function OutcomeModal({ cases, activeCaseId, setShowOutcomeModal, outcomeType, setOutcomeType, outcomeNotes, setOutcomeNotes, saveCases, showToast, handleLetter, requestHrReview, allegations, caseSignals, requestOverrideReason, createCaseTask, setCaseInfo, setReviewOutput, audit, completingOutcomeDetails, setCompletingOutcomeDetails }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [qualityGaps, setQualityGaps] = useState([]);
  // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) — see
  // finalizeOutcome's own comment below for why this exists.
  const [saving, setSaving] = useState(false);
  // Defect #12 remediation — required whenever outcomeType is a warning
  // type, in both the normal issue flow and the historical "complete
  // outcome details" flow. Kept as a string (not a number) so the input
  // can hold an in-progress, not-yet-valid value ("", "0", "6.5") without
  // fighting a controlled numeric input.
  const [warningDurationMonths, setWarningDurationMonths] = useState("");
  // Defect #14 remediation — only used in completingOutcomeDetails mode,
  // where outcome_issued_at is unknown and must never be silently set to
  // "now" (that would misrepresent when the outcome was actually
  // decided, and would shift the ACAS appeal-window clock this field
  // conceptually anchors). Lazily pre-filled with the case's own most
  // recent hearing meeting date as a starting point for HR to confirm or
  // correct — never auto-saved without HR explicitly reviewing this
  // field, since the Save button remains disabled until it's populated.
  const [confirmedIssueDate, setConfirmedIssueDate] = useState(() => findOutcomeRelevantMeeting(cs)?.date || "");
  const isWarning = isWarningOutcome(outcomeType);
  const durationValid = !isWarning || isValidWarningDurationMonths(warningDurationMonths);
  const issueDateValid = !completingOutcomeDetails || !!confirmedIssueDate;
  const previewBaseDate = completingOutcomeDetails ? (confirmedIssueDate ? new Date(confirmedIssueDate) : null) : new Date();
  const previewExpiry = isWarning && isValidWarningDurationMonths(warningDurationMonths) && previewBaseDate
    ? addCalendarMonths(previewBaseDate, Number(warningDurationMonths))
    : null;

  // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) — used
  // to call saveCases (a fire-and-forget optimistic write, its own
  // returned Promise discarded) and then immediately, synchronously
  // close the modal, show "Outcome recorded", and start drafting the
  // outcome letter — all before the write to `cases` had actually been
  // confirmed to land. If that write then failed (network issue, a
  // stale-version conflict), HR had already been told the decision was
  // recorded, the modal was gone, and Compass had already started
  // drafting a letter for an outcome that was never actually persisted —
  // the single highest-stakes write in the app, since cs.outcome is what
  // starts the real ACAS appeal-window clock and drives whether the case
  // is even considered closed (caseStage.js). saveCases now returns a
  // real Promise<{ok, reason?}> for a single-case write (passing
  // activeCaseId as changedId) — awaited here, so success is only ever
  // reported once the database has actually confirmed it. On failure,
  // the modal stays open with the entered outcome/notes intact so HR can
  // just retry, rather than silently losing what they typed.
  //
  // E2E Navigation Alignment pass, outcome-recording defect (P2) —
  // saveCaseToDB's optimistic-concurrency guard (saveCases →
  // saveCaseToDB's conditional .eq('updated_at', ...) in App.jsx) can
  // fail for two entirely different reasons: a genuine persistence
  // failure, or a stale-version conflict it has ALREADY recovered from
  // (it shows its own accurate "this case was updated... we've refreshed
  // it" toast and reloads the case before returning). Both used to come
  // back as a bare `false`, so this always overwrote that accurate
  // message with a generic "Couldn't record the outcome — please try
  // again" — telling HR the operation failed when really the case had
  // just been refreshed and was waiting for a conscious retry against
  // the new data. reason:'conflict' lets this tell the two apart without
  // parsing toast text: on a conflict, this shows nothing further (the
  // info toast already said what happened, and `cases` — hence `cs` —
  // re-renders with the refreshed data once loadCasesFromDB's own state
  // update lands), the modal simply stays open exactly as it already did
  // on any other failure, and nothing is auto-resubmitted.
  const finalizeOutcome = async () => {
    if(isWarning && !isValidWarningDurationMonths(warningDurationMonths)) return;
    setSaving(true);
    const issuedAt = new Date();
    const durationMonths = isWarning ? Number(warningDurationMonths) : null;
    const expiresAt = durationMonths ? toISODateLocal(addCalendarMonths(issuedAt, durationMonths)) : null;
    const result = await saveCases(cases.map(x=>x.id===activeCaseId?{...x,
      outcome:outcomeType,
      outcomeIssuedAt:issuedAt.toISOString(),
      outcomeNotes:outcomeNotes,
      warningDurationMonths:durationMonths,
      warningExpiresAt:expiresAt,
    }:x), activeCaseId);
    setSaving(false);
    if(!result?.ok) {
      if(result?.reason !== 'conflict') showToast("Couldn't record the outcome — please try again", "error");
      return;
    }
    const approvalAction = approvalActionForOutcome(outcomeType);
    if(approvalAction) requestHrReview(approvalAction, activeCaseId, null, outcomeType+(outcomeNotes?" — "+outcomeNotes:""), false);
    // Defect #14 remediation — the only place a genuinely new outcome
    // decision gets its own explicit audit entry; previously only the
    // quality-check-override path (below) logged anything at all, so a
    // clean issuance with no gaps left no record beyond the raw case row
    // changing. This fires either way — the override path's own entry
    // records HOW the decision was allowed through despite gaps, this one
    // records WHAT was decided, which is worth keeping independently.
    audit("Outcome issued", describeOutcomeDetail(outcomeType, issuedAt, durationMonths, expiresAt), activeCaseId);
    setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");setWarningDurationMonths("");showToast(approvalAction?"Outcome recorded — approval requested":"Outcome recorded");
    // Defect #11/#12/#13 remediation — ground caseInfo/reviewOutput from
    // the authoritative case and its own relevant hearing meeting before
    // drafting the letter (see findOutcomeRelevantMeeting/comment above).
    const meeting = findOutcomeRelevantMeeting(cs);
    setCaseInfo(p=>({...p, employee:cs.employeeName, manager:cs.manager||"", date:meeting?.date||p.date}));
    setReviewOutput(meeting?.record||"");
    // Defect #20 remediation — handleLetter is a closure over App.jsx's
    // own caseInfo state; setCaseInfo above only schedules that update,
    // it isn't visible yet in this same synchronous handler. Passing the
    // employee/manager/date this modal just computed directly means
    // handleLetter's own AI grounding and validation call both use the
    // real value instead of whatever caseInfo held before this click.
    handleLetter("outcome", {employeeName:cs.employeeName, manager:cs.manager||"", date:meeting?.date});
  };

  const issueOutcome = () => {
    if(!outcomeType || !cs) return;
    if(isWarning && !isValidWarningDurationMonths(warningDurationMonths)) return;
    const prospectiveCase = {...cs, outcome:outcomeType, outcomeNotes};
    const gaps = computeDecisionQualityGaps(prospectiveCase, allegations, caseSignals);
    if(gaps.length) { setQualityGaps(gaps); setShowQualityCheck(true); return; }
    finalizeOutcome();
  };

  const proceedPastQualityCheck = async () => {
    setShowQualityCheck(false);
    const ok = await requestOverrideReason(qualityGaps.join("; "), { caseId: activeCaseId, actionLabel: "Issued outcome despite quality check gaps" });
    if(!ok) return;
    finalizeOutcome();
  };

  const createQualityCheckFollowUp = () => {
    createCaseTask(activeCaseId, { name: "Follow up on: "+qualityGaps.join("; ") });
    setShowQualityCheck(false);
    finalizeOutcome();
  };

  // Defect #14 remediation — the historical-completion path
  // (needsOutcomeDetailsCompletion in OutcomeTab.jsx). Deliberately never
  // touches cs.outcome and never calls handleLetter: this isn't a new
  // decision, just filling in structured facts a decision already made
  // is missing, so nothing here should read as "the outcome was just
  // issued" anywhere else in the app (Timeline, audit, letter-drafting
  // toasts). No quality-check gate either — that's specifically for a
  // NEW decision's own evidentiary basis, which isn't what's happening
  // here. outcome_issued_at is set from confirmedIssueDate (HR-reviewed,
  // pre-filled only as a starting suggestion — see its own useState
  // comment above), never from "now".
  const completeOutcomeDetails = async () => {
    if(!confirmedIssueDate || (isWarning && !isValidWarningDurationMonths(warningDurationMonths))) return;
    setSaving(true);
    const issuedAt = new Date(confirmedIssueDate);
    const durationMonths = isWarning ? Number(warningDurationMonths) : null;
    const expiresAt = durationMonths ? toISODateLocal(addCalendarMonths(issuedAt, durationMonths)) : null;
    const result = await saveCases(cases.map(x=>x.id===activeCaseId?{...x,
      outcomeIssuedAt:issuedAt.toISOString(),
      outcomeNotes:outcomeNotes,
      warningDurationMonths:durationMonths,
      warningExpiresAt:expiresAt,
    }:x), activeCaseId);
    setSaving(false);
    if(!result?.ok) {
      if(result?.reason !== 'conflict') showToast("Couldn't save outcome details — please try again", "error");
      return;
    }
    audit("Outcome details amended", describeOutcomeDetail(outcomeType, issuedAt, durationMonths, expiresAt, {amended:true}), activeCaseId);
    setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");setWarningDurationMonths("");setCompletingOutcomeDetails(false);
    showToast("Outcome details saved");
  };

  // Guarded against saving — an Escape press or backdrop click while the
  // outcome write is in flight (useModalA11y calls this directly) must
  // not hide the modal out from under an in-progress save; the disabled
  // Cancel button already covers the primary click path, this covers the
  // keyboard/backdrop ones the hook wires up independently.
  const close = () => { if(saving) return; setShowOutcomeModal(false); setOutcomeType(""); setOutcomeNotes(""); setWarningDurationMonths(""); setCompletingOutcomeDetails(false); };
  // Called unconditionally, ahead of the early return below (DecisionQuality
  // CheckModal — itself now hook-managed too, active:false while it isn't
  // showing) — the rules of hooks don't allow this after a conditional return.
  const containerRef = useRef(null);
  useModalA11y(containerRef, close, !showQualityCheck);

  if(showQualityCheck) {
    return <DecisionQualityCheckModal gaps={qualityGaps} onGoBack={()=>setShowQualityCheck(false)} onCreateFollowUp={createQualityCheckFollowUp} onProceed={proceedPastQualityCheck} />;
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="outcome-modal-title" ref={containerRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div id="outcome-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>{completingOutcomeDetails?"Complete outcome details":"Issue disciplinary outcome"}</div>
            <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>{cs?.employeeName}</div>
          </div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098"}}>×</button>
        </div>
        <div style={{marginBottom:16}}>
          <label htmlFor="outcome-type" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Outcome decision</label>
          <select id="outcome-type" value={outcomeType} onChange={e=>setOutcomeType(e.target.value)} disabled={completingOutcomeDetails} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:outcomeType?"#1C1820":"#9B9098",background:completingOutcomeDetails?"#F5F1EA":"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
            <option value="">Select outcome…</option>
            <option value="No further action">No further action</option>
            <option value="First written warning">First written warning</option>
            <option value="Final written warning">Final written warning</option>
            <option value="Demotion">Demotion</option>
            <option value="Dismissal with notice">Dismissal with notice</option>
            <option value="Summary dismissal (gross misconduct)">Summary dismissal (gross misconduct)</option>
          </select>
          {completingOutcomeDetails&&<div style={{fontSize:11,color:"#9B9098",marginTop:4}}>The outcome itself was already decided — this only completes its missing details.</div>}
        </div>
        {completingOutcomeDetails&&(
          <div style={{marginBottom:16}}>
            <label htmlFor="outcome-issue-date" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Original outcome issue date</label>
            <input id="outcome-issue-date" type="date" value={confirmedIssueDate} onChange={e=>setConfirmedIssueDate(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}/>
            <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>This wasn't recorded at the time — confirm (or correct) the date this outcome was actually decided. Pre-filled from the case's own hearing meeting date where available.</div>
          </div>
        )}
        {isWarning&&(
          <div style={{marginBottom:16}}>
            <label htmlFor="warning-duration" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Warning duration</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input id="warning-duration" type="number" min={1} max={60} step={1} value={warningDurationMonths} onChange={e=>setWarningDurationMonths(e.target.value)} placeholder="e.g. 6" style={{width:100,fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}/>
              <span style={{fontSize:13,color:"#6B6375"}}>months</span>
            </div>
            {warningDurationMonths&&!isValidWarningDurationMonths(warningDurationMonths)&&(
              <div style={{fontSize:11,color:"#C84B2F",marginTop:4}}>Enter a whole number of months between 1 and 60.</div>
            )}
            {previewExpiry&&(
              <div style={{fontSize:12,color:"#6B6375",marginTop:6}}>Expires: <strong style={{color:"#1C1820"}}>{previewExpiry.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</strong> (calculated, not editable)</div>
            )}
          </div>
        )}
        <div style={{marginBottom:20}}>
          <label htmlFor="outcome-notes" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Notes <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
          <textarea id="outcome-notes" value={outcomeNotes} onChange={e=>setOutcomeNotes(e.target.value)} placeholder="Any additional notes…" rows={3} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        {!completingOutcomeDetails&&(
          <div style={{background:"#FFF8F0",border:"1px solid #E8622A33",borderRadius:8,padding:"10px 14px",marginBottom:outcomeType&&approvalActionForOutcome(outcomeType)?10:20,fontSize:12,color:"#E8622A"}}>
            Issuing this outcome starts the employee's 5 working day appeal window (ACAS Code).
          </div>
        )}
        {!completingOutcomeDetails&&outcomeType&&approvalActionForOutcome(outcomeType)&&(
          <div style={{background:COLOR.purpleTint,border:`1px solid ${COLOR.purple}44`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:COLOR.purpleDeep}}>
            {approvalActionLabel(approvalActionForOutcome(outcomeType))} requires sign-off — this will also open an approval request, visible on the case's Overview tab.
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={close} disabled={saving} style={{fontSize:13,padding:"10px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#FFFFFF",cursor:saving?"not-allowed":"pointer",color:"#6B6375",fontFamily:FONT.sans}}>Cancel</button>
          {completingOutcomeDetails ? (
            <button disabled={!outcomeType||saving||!durationValid||!issueDateValid} onClick={completeOutcomeDetails} style={{fontSize:13,padding:"10px 20px",background:!outcomeType||saving||!durationValid||!issueDateValid?"#B8A9F8":"#1C1820",border:"none",borderRadius:8,color:"#fff",cursor:!outcomeType||saving||!durationValid||!issueDateValid?"not-allowed":"pointer",fontWeight:600,fontFamily:FONT.sans}}>{saving?"Saving…":"Save outcome details"}</button>
          ) : (
            <button disabled={!outcomeType||saving||!durationValid} onClick={issueOutcome} style={{fontSize:13,padding:"10px 20px",background:!outcomeType||saving||!durationValid?"#B8A9F8":"#1C1820",border:"none",borderRadius:8,color:"#fff",cursor:!outcomeType||saving||!durationValid?"not-allowed":"pointer",fontWeight:600,fontFamily:FONT.sans}}>{saving?"Recording outcome…":"Issue outcome & generate letter"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
