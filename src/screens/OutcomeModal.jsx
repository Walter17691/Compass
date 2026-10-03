import { useRef, useState } from 'react';
import { approvalActionForOutcome, approvalActionLabel } from '../lib/approvals';
import { computeDecisionQualityGaps } from '../lib/decisionQuality';
import { DecisionQualityCheckModal } from '../components/DecisionQualityCheckModal';
import { useModalA11y } from '../hooks/useModalA11y';
import { isWarningOutcome, isValidWarningDurationMonths } from '../lib/outcomeTypes';
import { addCalendarMonths, toISODateLocal } from '../lib/dates';
import { COLOR, FONT, TYPE, RADIUS, BUTTON } from '../styles/tokens';
import { outcomeDecisionContext } from '../lib/outcomeDecisionContext';
import { MDRenderer } from '../components/MDRenderer';

// WAVE D4.2b — findOutcomeRelevantMeeting was removed with the completion
// mode: it existed only to pre-fill that flow's issue-date input.

// Audit-detail text for "Outcome issued" (finalizeOutcome) — structured,
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
export function OutcomeModal({ cases, activeCaseId, setShowOutcomeModal, outcomeType, setOutcomeType, outcomeNotes, setOutcomeNotes, saveCases, showToast, requestHrReview, allegations, caseSignals, requestOverrideReason, createCaseTask, audit, currentUserId }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  // WAVE D2 — the record this decision is about, assembled from data this
  // component was already given and already authorised to hold. No query, no
  // fetch, no permission logic: see outcomeDecisionContext.js.
  const context = outcomeDecisionContext({ caseObj: cs, cases, allegations });
  const [showRecord, setShowRecord] = useState(false);
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
  // WAVE D4.2b — the "complete outcome details" mode is gone, and with it the
  // confirmed-issue-date input. Warning duration is SUBSTANTIVE decision data
  // (it sets how long the sanction is live, therefore whether it is a Current
  // Warning), so supplying it after the fact was editing the sanction through a
  // metadata route. A new decision always captures its own duration and is
  // always dated now, so there is nothing left to confirm or correct here.
  const isWarning = isWarningOutcome(outcomeType);
  const durationValid = !isWarning || isValidWarningDurationMonths(warningDurationMonths);
  const previewBaseDate = new Date();
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
      // Appeal Independence P1 (2026-09-18) — the authoritative decision-
      // maker for appoint_appeal_manager()'s independence check on this
      // pathway (see supabase/appeal_independence_decision_maker_2026-09-
      // 18.sql). The actually-authenticated user issuing this outcome,
      // never inferred from the case's manager/owner/created_by fields.
      disciplinaryDecidedBy:currentUserId||null,
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
    // ── WAVE D1 — recording a decision is not communicating it ──
    //
    // This used to call handleLetter("outcome", …) here, so one click both
    // recorded the authoritative employment decision AND started drafting the
    // letter that announces it. The button said so: "Issue outcome & generate
    // letter". Two different acts, one of which is a formal communication to
    // the employee, taken on a single confirmation.
    //
    // The decision is now recorded and nothing else happens. nextStep.js
    // already returns "Draft outcome letter" while no outcome letter exists
    // (its !hasDiscOutcome branch), so the workflow continues exactly as it
    // did — the user simply takes the second step deliberately.
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
  // Guarded against saving — an Escape press or backdrop click while the
  // outcome write is in flight (useModalA11y calls this directly) must
  // not hide the modal out from under an in-progress save; the disabled
  // Cancel button already covers the primary click path, this covers the
  // keyboard/backdrop ones the hook wires up independently.
  const close = () => { if(saving) return; setShowOutcomeModal(false); setOutcomeType(""); setOutcomeNotes(""); setWarningDurationMonths(""); };
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
      <div style={{background:COLOR.surface,borderRadius:RADIUS.card,padding:24,width:"100%",maxWidth:620,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(15,18,36,0.18)",fontFamily:FONT.sans}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div id="outcome-modal-title" style={{...TYPE.pageTitle,color:COLOR.ink}}>{"Record outcome"}</div>
            <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginTop:2}}>{cs?.employeeName}</div>
          </div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:COLOR.inkQuiet}}>×</button>
        </div>
        {/* ══ WAVE D2 — THE RECORD THIS DECISION IS ABOUT ══
            Shown before the controls, because a decision-maker should see what
            they are deciding before they are asked to decide it. Facts only:
            no recommendation, no severity, no ranking, nothing generated. */}
        {!context.isEmpty&&(
          <div style={{border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:18,background:COLOR.rail}}>
            <div style={{...TYPE.micro,color:COLOR.inkFaint,marginBottom:10}}>The record you are deciding on</div>

            {context.allegations.length>0&&(
              <div style={{marginBottom:context.meeting||context.warnings.length?14:0}}>
                <div style={{...TYPE.metadata,fontWeight:700,color:COLOR.ink,marginBottom:4}}>
                  {context.allegations.length===1?"Allegation":"Allegations"}
                </div>
                <ul style={{margin:0,paddingLeft:18,...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.7}}>
                  {context.allegations.map(a=>(
                    <li key={a.id}>
                      {a.title}
                      {/* The stored status, reported as stored. Compass has no
                          authoritative "finding" object, so none is implied. */}
                      {a.status&&<span style={{color:COLOR.inkQuiet}}> · {a.status}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {context.meeting&&(
              <div style={{marginBottom:context.warnings.length?14:0}}>
                {/* Progressive disclosure: the record is reachable without
                    leaving the decision, and opening it cannot lose anything
                    already entered — the form state lives above this. */}
                <button type="button" onClick={()=>setShowRecord(v=>!v)} aria-expanded={showRecord}
                  style={{...BUTTON.tertiary,fontSize:12,padding:0}}>
                  {showRecord?"Hide":"Show"} the {(context.meeting.type||"meeting").toLowerCase()} record
                  {context.meeting.date?` · ${context.meeting.date}`:""}
                </button>
                {showRecord&&(
                  <div style={{marginTop:8,maxHeight:220,overflowY:"auto",padding:"10px 12px",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface}}>
                    <div style={{...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.7}}>
                      <MDRenderer text={context.meeting.record||""}/>
                    </div>
                  </div>
                )}
              </div>
            )}
            {context.warnings.length>0&&(
              <div style={{marginBottom:0}}>
                <div style={{...TYPE.metadata,fontWeight:700,color:COLOR.ink,marginBottom:4}}>Live formal warnings</div>
                <ul style={{margin:0,paddingLeft:18,...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.7}}>
                  {context.warnings.map(w=>(
                    <li key={w.caseId}>
                      {w.type} · expires {new Date(w.expiresAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

        <div style={{marginBottom:16}}>
          <label htmlFor="outcome-type" style={{fontSize:12,fontWeight:600,color:COLOR.ink,display:"block",marginBottom:6}}>Outcome decision</label>
          <select id="outcome-type" value={outcomeType} onChange={e=>setOutcomeType(e.target.value)} style={{width:"100%",fontSize:13,border:`1.5px solid ${COLOR.borderStrong}`,borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:outcomeType?COLOR.ink:COLOR.inkQuiet,background:COLOR.surface,outline:"none",boxSizing:"border-box"}}>
            <option value="">Select outcome…</option>
            <option value="No further action">No further action</option>
            <option value="First written warning">First written warning</option>
            <option value="Final written warning">Final written warning</option>
            <option value="Demotion">Demotion</option>
            <option value="Dismissal with notice">Dismissal with notice</option>
            <option value="Summary dismissal (gross misconduct)">Summary dismissal (gross misconduct)</option>
          </select>
        </div>
        {isWarning&&(
          <div style={{marginBottom:16}}>
            <label htmlFor="warning-duration" style={{fontSize:12,fontWeight:600,color:COLOR.ink,display:"block",marginBottom:6}}>Warning duration</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input id="warning-duration" type="number" min={1} max={60} step={1} value={warningDurationMonths} onChange={e=>setWarningDurationMonths(e.target.value)} placeholder="e.g. 6" style={{width:100,fontSize:13,border:`1.5px solid ${COLOR.borderStrong}`,borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:COLOR.ink,background:COLOR.surface,outline:"none",boxSizing:"border-box"}}/>
              <span style={{fontSize:13,color:COLOR.inkFaint}}>months</span>
            </div>
            {warningDurationMonths&&!isValidWarningDurationMonths(warningDurationMonths)&&(
              <div style={{fontSize:11,color:COLOR.red,marginTop:4}}>Enter a whole number of months between 1 and 60.</div>
            )}
            {previewExpiry&&(
              <div style={{fontSize:12,color:COLOR.inkFaint,marginTop:6}}>Expires: <strong style={{color:COLOR.ink}}>{previewExpiry.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</strong> (calculated, not editable)</div>
            )}
          </div>
        )}
        <div style={{marginBottom:20}}>
          <label htmlFor="outcome-notes" style={{...TYPE.metadata,fontWeight:700,color:COLOR.ink,display:"block",marginBottom:6}}>Outcome reasoning <span style={{fontWeight:400,color:COLOR.inkQuiet}}>(optional)</span></label>
          <textarea id="outcome-notes" value={outcomeNotes} onChange={e=>setOutcomeNotes(e.target.value)} placeholder="Why you reached this outcome…" rows={3} style={{width:"100%",fontSize:13,border:`1.5px solid ${COLOR.borderStrong}`,borderRadius:8,padding:"10px 12px",fontFamily:FONT.sans,color:COLOR.ink,background:COLOR.surface,outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:COLOR.amberTint,border:`1px solid ${COLOR.amber}33`,borderRadius:8,padding:"10px 14px",marginBottom:outcomeType&&approvalActionForOutcome(outcomeType)?10:20,fontSize:12,color:COLOR.amber}}>
            {/* §3 — TRUTHFUL, not reworded. Traced: computeAppealDeadline returns
                null until an outcome LETTER has been saved, so recording a
                decision starts nothing. The window is then ANCHORED to this
                decision's date (appealWindowAnchor prefers cs.outcomeIssuedAt),
                which is deliberate — "the saved outcome letter is documentation
                OF the decision, not the decision itself". Saying "issuing this
                outcome starts the appeal window" was false at this moment. */}
            Recording this does not notify the employee. The appeal window is tracked once the outcome letter is issued, counted from this decision's date (ACAS-recommended 5 working days).
          </div>
        {outcomeType&&approvalActionForOutcome(outcomeType)&&(
          <div style={{background:COLOR.purpleTint,border:`1px solid ${COLOR.purple}44`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:COLOR.purpleDeep}}>
            {approvalActionLabel(approvalActionForOutcome(outcomeType))} normally requires HR sign-off. Recording it opens an approval request on the case's Overview tab — the outcome is recorded now and is not held pending that approval.
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={close} disabled={saving} style={{fontSize:13,padding:"10px 20px",border:`1px solid ${COLOR.borderStrong}`,borderRadius:8,background:"#FFFFFF",cursor:saving?"not-allowed":"pointer",color:COLOR.inkFaint,fontFamily:FONT.sans}}>Cancel</button>
          <button disabled={!outcomeType||saving||!durationValid} onClick={issueOutcome} style={{fontSize:13,padding:"10px 20px",background:!outcomeType||saving||!durationValid?COLOR.border:COLOR.purple,border:"none",borderRadius:8,color:!outcomeType||saving||!durationValid?COLOR.inkQuiet:COLOR.paper,cursor:!outcomeType||saving||!durationValid?"not-allowed":"pointer",fontWeight:600,fontFamily:FONT.sans}}>{saving?"Recording outcome…":"Record outcome"}</button>
        </div>
      </div>
    </div>
  );
}
