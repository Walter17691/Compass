import { useRef, useState } from 'react';
import { approvalActionForOutcome, approvalActionLabel } from '../lib/approvals';
import { computeDecisionQualityGaps } from '../lib/decisionQuality';
import { DecisionQualityCheckModal } from '../components/DecisionQualityCheckModal';
import { useModalA11y } from '../hooks/useModalA11y';
import { COLOR, FONT } from '../styles/tokens';

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
export function OutcomeModal({ cases, activeCaseId, setShowOutcomeModal, outcomeType, setOutcomeType, outcomeNotes, setOutcomeNotes, saveCases, showToast, handleLetter, requestHrReview, allegations, caseSignals, requestOverrideReason, createCaseTask }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [qualityGaps, setQualityGaps] = useState([]);
  // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) — see
  // finalizeOutcome's own comment below for why this exists.
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const result = await saveCases(cases.map(x=>x.id===activeCaseId?{...x,outcome:outcomeType,outcomeDate:new Date().toISOString(),outcomeNotes:outcomeNotes}:x), activeCaseId);
    setSaving(false);
    if(!result?.ok) {
      if(result?.reason !== 'conflict') showToast("Couldn't record the outcome — please try again", "error");
      return;
    }
    const approvalAction = approvalActionForOutcome(outcomeType);
    if(approvalAction) requestHrReview(approvalAction, activeCaseId, null, outcomeType+(outcomeNotes?" — "+outcomeNotes:""), false);
    setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");showToast(approvalAction?"Outcome recorded — approval requested":"Outcome recorded");handleLetter("outcome");
  };

  const issueOutcome = () => {
    if(!outcomeType || !cs) return;
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

  // Guarded against saving — an Escape press or backdrop click while the
  // outcome write is in flight (useModalA11y calls this directly) must
  // not hide the modal out from under an in-progress save; the disabled
  // Cancel button already covers the primary click path, this covers the
  // keyboard/backdrop ones the hook wires up independently.
  const close = () => { if(saving) return; setShowOutcomeModal(false); setOutcomeType(""); setOutcomeNotes(""); };
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
            <div id="outcome-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>Issue disciplinary outcome</div>
            <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>{cs?.employeeName}</div>
          </div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098"}}>×</button>
        </div>
        <div style={{marginBottom:16}}>
          <label htmlFor="outcome-type" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Outcome decision</label>
          <select id="outcome-type" value={outcomeType} onChange={e=>setOutcomeType(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:outcomeType?"#1C1820":"#9B9098",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
            <option value="">Select outcome…</option>
            <option value="No further action">No further action</option>
            <option value="First written warning">First written warning</option>
            <option value="Final written warning">Final written warning</option>
            <option value="Demotion">Demotion</option>
            <option value="Dismissal with notice">Dismissal with notice</option>
            <option value="Summary dismissal (gross misconduct)">Summary dismissal (gross misconduct)</option>
          </select>
        </div>
        <div style={{marginBottom:20}}>
          <label htmlFor="outcome-notes" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Notes <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
          <textarea id="outcome-notes" value={outcomeNotes} onChange={e=>setOutcomeNotes(e.target.value)} placeholder="Any additional notes…" rows={3} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:"#FFF8F0",border:"1px solid #E8622A33",borderRadius:8,padding:"10px 14px",marginBottom:outcomeType&&approvalActionForOutcome(outcomeType)?10:20,fontSize:12,color:"#E8622A"}}>
          Issuing this outcome starts the employee's 5 working day appeal window (ACAS Code).
        </div>
        {outcomeType&&approvalActionForOutcome(outcomeType)&&(
          <div style={{background:COLOR.purpleTint,border:`1px solid ${COLOR.purple}44`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:COLOR.purpleDeep}}>
            {approvalActionLabel(approvalActionForOutcome(outcomeType))} requires sign-off — this will also open an approval request, visible on the case's Overview tab.
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={close} disabled={saving} style={{fontSize:13,padding:"10px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#FFFFFF",cursor:saving?"not-allowed":"pointer",color:"#6B6375",fontFamily:FONT.sans}}>Cancel</button>
          <button disabled={!outcomeType||saving} onClick={issueOutcome} style={{fontSize:13,padding:"10px 20px",background:!outcomeType||saving?"#B8A9F8":"#1C1820",border:"none",borderRadius:8,color:"#fff",cursor:!outcomeType||saving?"not-allowed":"pointer",fontWeight:600,fontFamily:FONT.sans}}>{saving?"Recording outcome…":"Issue outcome & generate letter"}</button>
        </div>
      </div>
    </div>
  );
}
