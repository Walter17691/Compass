import { useState, useRef, useEffect } from 'react';
import { isGrievanceCase } from '../../lib/caseStage';
import { isTerminalStatus, isConfirmationSettled, isExpired, signatureStatusLabel } from '../../lib/eSignature';
import { confirmationSemantics, provenanceLine } from '../../lib/confirmationSemantics';
import { canIssueFirstConfirmation } from '../../lib/meetingIdentity';
import { meetingRecordState, meetingsSummary } from '../../lib/meetingRecordState';
import { requestManualSignatureConfirmation } from '../../lib/humanOverride';
import { SignedRecordModal } from '../SignedRecordModal';
import { COLOR, FONT, TYPE } from '../../styles/tokens';

// Integrations & Workflow Automation (Phase 5, IP27, §21) — badge colour
// per widened signing_requests status. sent/opened are both "still
// waiting" (amber); signed/acknowledged are both a real completion
// (green); declined/expired are their own distinct, honest states —
// neither one gets folded into "pending" or silently hidden.
// Wave B.2 corrective — the record-state palette, matching the signature badges
// already beside it so the two read as one row of state rather than two systems.
const RECORD_TONE = {
  pending:   { color:"#4A4E63", bg:"#F0F1F7" },
  live:      { color:"#8A5A17", bg:"#FEF5E7" },
  attention: { color:"#B87520", bg:"#FEF5E7" },
  done:      { color:"#1A7A4A", bg:"#E8F5EE" },
  muted:     { color:"#8A8EA3", bg:"#F0F1F7" },
};

const SIGN_STATUS_STYLE = {
  sent: { color: "#B87520", bg: "#FEF5E7" },
  opened: { color: "#B87520", bg: "#FEF5E7" },
  signed: { color: "#1A7A4A", bg: "#E8F5EE" },
  acknowledged: { color: "#1A7A4A", bg: "#E8F5EE" },
  declined: { color: "#C84B2F", bg: "#FEF0EB" },
  expired: { color: "#4A4E63", bg: "#F0F1F7" },
};

// IP18, §12 — display text for an unresolved post-meeting suggestion,
// matching the exact task-name wording taskFieldsForSuggestion
// (lib/meetingCompletion.js) uses once accepted, so what's shown here is
// never a surprise once it becomes a real task.
const SUGGESTION_LABEL = {
  witness: s => `Potential witness: ${s.description}`,
  evidence: s => `Evidence mentioned: ${s.description}`,
  action: s => `Action: ${s.description}`,
};

// Absorbs the case view's former top-level "stage tabs" as an internal
// sub-filter now that they're specifically about which meetings to show,
// not which workspace tab is active. Grievance-typed cases get a single
// "Grievance" pill instead of the disciplinary shape's Investigation +
// Disciplinary split — ACAS S6 has no equivalent separation, one meeting
// type ("Grievance") covers the hearing itself. The investigation-report
// and disciplinary-officer-handoff blocks stay grouped with the
// Investigation meetings list (their natural narrative position, and
// disciplinary-only — a grievance case never shows them) rather than
// moving to Outcome, which is specifically about the decision itself.
export function MeetingsTab({ cs, cases, saveCases, activeCaseStage, setActiveCaseStage, setMeetingSetup, setCaseInfo, getEmployeeRecord, orgMembers, setScreen, screens, onPresentMeetingRecord, showToast, meetingTypes, fmtDate, attemptSubmitInvestigation, concludingInvestigation, investigationReportDraft, setShowHandoffModal, setLetterOutput, onAcceptSavedSuggestion, onDismissSavedSuggestion, promptDialog, audit, loadSignedSnapshot, loadRequestHistory, proceedWithoutConfirmation, onResendReminder }) {
  const grievance = isGrievanceCase(cs);
  const meetings = cs.meetings||[];
  // Human UAT remediation, Batch 2, Part 9 — see SignedRecordModal's own
  // comment for why this needs a durable, in-Compass view at all.
  const [viewingSignedMeeting, setViewingSignedMeeting] = useState(null);
  // Slice 1b — previous versions are loaded ON DEMAND, per meeting. Nothing is
  // fetched, and nothing is shown, unless the manager asks: the default view is
  // the current state only, which is the whole point of the re-issue UX brief.
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState(null);
  const openHistory = async (m) => {
    setHistoryFor(m.id); setHistoryRows(null);
    const chain = await loadRequestHistory?.(m.id);
    setHistoryRows(chain?.superseded || []);
  };
  // Human UAT remediation, Batch 2, Part 12 — keeps the live report
  // preview scrolled to the newest text as it streams in, rather than
  // stuck showing only the opening lines once the content outgrows the
  // box's fixed height.
  const investigationReportDraftRef = useRef(null);
  useEffect(() => {
    if (investigationReportDraftRef.current) {
      investigationReportDraftRef.current.scrollTop = investigationReportDraftRef.current.scrollHeight;
    }
  }, [investigationReportDraft]);

  const markMeetingSigned = async m => {
    const ok = await requestManualSignatureConfirmation(promptDialog, audit, { itemLabel: `${m.type||"Meeting"} record — ${fmtDate(m.date)}`, caseId: cs.id });
    if(!ok) return;
    saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(mt=>mt.id===m.id?{...mt,signStatus:"signed"}:mt)}:x));
  };
  const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const grievanceMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("grievance")&&!(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const knownTerms = grievance ? ["grievance","appeal"] : ["investigation","disciplinary","appeal"];
  const otherMeetings = meetings.filter(m=>!knownTerms.some(t=>(m.type||"").toLowerCase().includes(t))).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const allStages = grievance ? [
    {id:"hearing",label:"Grievance",meetings:grievanceMeetings,color:COLOR.purple},
    {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
    ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#4A4E63"}]:[]),
  ].filter(s=>s.meetings.length>0||s.id==="hearing") : [
    {id:"investigation",label:"Investigation",meetings:invMeetings,color:COLOR.purple},
    {id:"disciplinary",label:"Disciplinary",meetings:discMeetings,color:"#C84B2F"},
    {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
    ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#4A4E63"}]:[]),
  ].filter(s=>s.meetings.length>0||s.id==="investigation");
  // Wave B.2 corrective — the default stage is the first one that actually HAS
  // meetings, not always "Investigation". A case whose only meeting is a
  // disciplinary hearing used to open on an empty Investigation stage, so the
  // meeting the user came to find was one unexplained click away. An explicit
  // choice still wins; this only changes where the eye lands first.
  const firstPopulatedStage = allStages.find(s=>s.meetings.length>0);
  const activeStage = allStages.find(s=>s.id===activeCaseStage) || firstPopulatedStage || allStages[0];

  const startMeeting = (type) => {
    setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));
    setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));
    setScreen(screens.HOME+"_meeting");
  };
  const typeFor = stageId => {
    if(stageId==="appeal") return grievance ? "appeal-grievance" : "appeal-disciplinary";
    if(stageId==="hearing") return "grievance";
    if(stageId==="investigation") return "investigation";
    return "disciplinary";
  };

  // Manager Enablement (Phase 4, MP2) — the closing half of Notetaker
  // Mode's "submitted to the case owner for review" loop. Kept as a
  // simple inline expand within this same row rather than a new screen —
  // there's nothing here that needs ReviewScreen's AI-editing machinery,
  // just plain text to read and a status to flip.
  const markNotetakerNotesReviewed = (m) => saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(mt=>mt.id===m.id?{...mt,notetakerNotesStatus:"reviewed"}:mt)}:x));

  // Integrations & Workflow Automation (Phase 5, IP17, §11) — a meeting
  // scheduled via the Calendar screen's automatic workspace
  // (lib/meetingScheduling.js's buildScheduledMeetingEntry) has no
  // record yet — nextStep.js already treats that as "hasn't happened",
  // so this shows the auto-generated agenda/questions/attendees instead
  // of the sign-status/notes controls that only make sense once the
  // meeting has actually been held.
  const ScheduledMeetingDetails = ({m}) => (
    <div style={{marginTop:8,background:COLOR.purpleTint,border:`1px solid ${COLOR.purple}33`,borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:12,fontWeight:700,color:COLOR.purpleDeep,marginBottom:6}}>Scheduled — not yet held</div>
      {m.attendees?.length>0&&<div style={{fontSize:12,color:"#0F1224",marginBottom:6}}>Attendees: {m.attendees.join(", ")}</div>}
      {m.agenda&&<div style={{fontSize:12,color:"#0F1224",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:m.prepQuestions?.length?8:0}}>{m.agenda}</div>}
      {m.prepQuestions?.length>0&&(
        <div>
          <div style={{fontSize:12,fontWeight:700,color:COLOR.purpleDeep,marginBottom:4}}>Prep questions</div>
          {m.prepQuestions.map(q=>(
            <div key={q.id} style={{fontSize:12,color:"#0F1224",marginBottom:2}}>{q.essential?"● ":"○ "}{q.text}</div>
          ))}
        </div>
      )}
    </div>
  );

  // ── ONE OPENER FOR BOTH ROW CONTROLS ──────────────────────────────────
  //
  // Human UAT: "Review & send" did nothing at all — no navigation, no error, no
  // toast. The cause was a PROP-GROUP MISMATCH one layer up: App passed
  // onPresentMeetingRecord as a top-level prop of CaseViewScreen while
  // CaseViewScreen destructures it from `shell`, so it arrived here as
  // undefined and `onClick={()=>onPresentMeetingRecord(...)}` threw a
  // TypeError. React does NOT route errors thrown in event handlers to error
  // boundaries, so the throw went to window.onerror and the UI never moved.
  //
  // The mismatch is fixed at source and a structural test now pins the whole
  // class. This is the second line of defence: a missing handler is reported to
  // the manager instead of vanishing. A control that appears to accept a click
  // must never do nothing.
  const openMeetingRecord = (m) => {
    if(typeof onPresentMeetingRecord !== "function") {
      console.error("MeetingsTab: onPresentMeetingRecord was not provided");
      showToast?.("Compass couldn't open that meeting record. Please reload the page and try again.", "error");
      return;
    }
    onPresentMeetingRecord(m, {
      meetingType: meetingTypes.find(t=>t.label===m.type)||null,
      caseInfo: { employee:cs.employeeName, manager:m.manager||"", date:m.date, caseId:cs.id },
    });
  };

  const MeetingRow = ({m}) => {
    // Computed once per row. One canonical source for every label below, so a
    // status can never pick up a different meaning in two places.
    const sem = confirmationSemantics(m.signStatus);
    const agreed = sem.impliesAgreement;
    return (
    <div style={{padding:"12px 0",borderBottom:"1px solid #F0F1F7"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,color:"#0F1224"}}>{m.type}</div>
          <div style={{fontSize:11,color:"#8A8EA3",marginTop:2}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {/* Wave B.2 corrective — the RECORD's own state. Human testing: "the Case
              View does not tell me the lifecycle/status of that meeting record."
              The signature badge beside this was already here; what was missing was
              whether the write-up is a draft awaiting review, finished, or the
              meeting has not happened yet. Both are stored; only one was shown.
              meetingRecordState reads meetings[].status and invents nothing. */}
          {(()=>{ const rs = meetingRecordState(m); return rs ? (
            <span style={{fontSize:10,fontWeight:600,borderRadius:4,padding:"2px 7px",
                          color: RECORD_TONE[rs.tone].color, background: RECORD_TONE[rs.tone].bg}}>{rs.label}</span>
          ) : null; })()}
          {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
          {m.signStatus&&SIGN_STATUS_STYLE[m.signStatus]&&<span style={{fontSize:10,color:SIGN_STATUS_STYLE[m.signStatus].color,background:SIGN_STATUS_STYLE[m.signStatus].bg,borderRadius:4,padding:"2px 7px",fontWeight:600}}>{signatureStatusLabel(m.signStatus)}{(m.signStatus==="sent"||m.signStatus==="opened")?" — awaiting signature":""}</span>}
          {m.signStatus&&!isTerminalStatus(m.signStatus)&&<button onClick={()=>markMeetingSigned(m)} style={{fontSize:10,background:"#E8F5EE",border:"none",borderRadius:4,padding:"2px 8px",color:"#1A7A4A",cursor:"pointer",fontFamily:FONT.sans}}>Mark signed</button>}
          {m.notetakerNotesStatus==="submitted"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Notetaker notes awaiting review</span>}
          {m.notetakerNotesStatus==="reviewed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Notetaker notes reviewed</span>}
          {m.record&&<button onClick={()=>openMeetingRecord(m)} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>View notes</button>}
          {/* ── FIRST ISSUE ──────────────────────────────────────────────────
              A completed record the participant has never been given was
              previously undiscoverable: the only route was View notes, and the
              button it led to was labelled for a record that had not been saved.
              Opens the SAME review screen — deliberately, so the record is read
              before it leaves the building — and the send control there is now
              correctly offered because the identity resolves. */}
          {canIssueFirstConfirmation(m)&&<button onClick={()=>openMeetingRecord(m)} style={{fontSize:11,background:COLOR.purple,border:"none",borderRadius:6,padding:"4px 10px",color:"#FFFFFF",cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>Review &amp; send</button>}
          {/* Human UAT remediation, Batch 2, Part 9 — the only place the
              actual signature/acknowledgement was ever visible was the
              external, time-limited /sign/[id] link. "View notes" above
              shows the same plain record whether or not it was signed —
              this is the one, durable, always-available place to see the
              signed copy itself, reading the exact fields the badge above
              already reads, not a second status source. */}
          {/* Pre-V1 Trust Slice — reachable for a DISPUTE too: when a participant
              disagrees, the issued document and their comments are exactly what
              a reviewer most needs to see. The label follows the state rather
              than claiming a signature in every case. */}
          {m.record&&m.signStatus&&isTerminalStatus(m.signStatus)&&m.signStatus!=="declined"&&(
            <button onClick={()=>setViewingSignedMeeting(m)} style={{fontSize:11,background: agreed?"#E8F5EE":"#FEF5E7",border:`1px solid ${agreed?"#A8D5B5":"#F5E6C4"}`,borderRadius:6,padding:"4px 10px",color: agreed?"#1A7A4A":"#7A5C1A",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>
              {sem.viewLabel}
            </button>
          )}
        </div>
      </div>
      {/* Human UAT remediation, Batch 1, Issue 2 — signer/date (and decline
          reason, if declined) is real data this app already captures in
          signing_requests, but was never synced down or shown anywhere:
          the badge above said "Signed" with nothing to confirm it. */}
      {m.signStatus&&isTerminalStatus(m.signStatus)&&(m.signedAt||m.declineReason)&&(
        <div style={{fontSize:11,color:"#8A8EA3",marginTop:4}}>
          {/* One canonical state line. Only `signed` can produce signature
              wording, because only its provenanceKind is SIGNED. */}
          {m.signStatus==="declined"
            ? <>Declined to sign{m.signerName?` by ${m.signerName}`:""}{m.signedAt?` on ${fmtDate(m.signedAt)}`:""}{m.declineReason?`: "${m.declineReason}"`:""}</>
            : m.signStatus==="disputed"
              ? <>Responded with comments{m.participantCommentAt?` on ${fmtDate(m.participantCommentAt)}`:""} — the record was not changed by their comments</>
              : m.signStatus==="proceeded"
                ? <>Proceeded without confirmation{m.proceededAt?` on ${fmtDate(m.proceededAt)}`:""}{m.proceededFromStatus?` — the request was ${confirmationSemantics(m.proceededFromStatus).stateLine.toLowerCase()} at the time`:""}</>
                : <>{provenanceLine(m.signStatus, { name: m.signerName, at: m.signedAt, fmtDate })}</>}
        </div>
      )}
      {/* ── CONFIRMATION OUTSTANDING ────────────────────────────────────────
          One line of state and at most two actions, never a signature dashboard.
          Shown only while the participant has neither responded nor been
          proceeded past, so a settled record carries no call to action at all.

          Compass states elapsed facts and does not judge them: it never says the
          opportunity was reasonable, or suggests proceeding. That decision, and
          its reason, belong to the human who records it. */}
      {m.record&&m.signId&&!isConfirmationSettled(m.signStatus)&&(
        <div style={{marginTop:8,background:"#F6F5FA",border:"1px solid #E8EAF2",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:12,color:"#4A4E63",lineHeight:1.6}}>
            {m.expiresAt&&isExpired(m.expiresAt)
              ? <>Sent for confirmation. <strong>The link has expired</strong> without a response.</>
              : m.signStatus==="opened"
                ? <>Sent for confirmation — opened, but no response yet.</>
                : <>Sent for confirmation — no response yet.</>}
          </div>
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
            {!(m.expiresAt&&isExpired(m.expiresAt))&&onResendReminder&&(
              <button onClick={()=>onResendReminder(cs,m)} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>Send reminder</button>
            )}
            {proceedWithoutConfirmation&&(
              <button onClick={()=>proceedWithoutConfirmation(cs,m)} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>Proceed without confirmation</button>
            )}
          </div>
        </div>
      )}
      {/* ── PREVIOUS VERSIONS, ON DEMAND ───────────────────────────────────
          One quiet link, shown only where a request exists at all. No list, no
          dashboard, no counts in the default view: a manager who never re-issued
          anything sees nothing here, and one who did gets the history when they
          ask for it. */}
      {m.record&&m.signId&&loadRequestHistory&&(
        <div style={{marginTop:6}}>
          {historyFor!==m.id ? (
            <button onClick={()=>openHistory(m)} style={{fontSize:11,background:"none",border:"none",padding:0,color:"#8A8EA3",cursor:"pointer",textDecoration:"underline",fontFamily:FONT.sans}}>
              Previous versions
            </button>
          ) : historyRows===null ? (
            <div style={{fontSize:11,color:"#8A8EA3"}}>Loading previous versions…</div>
          ) : historyRows.length===0 ? (
            <div style={{fontSize:11,color:"#8A8EA3"}}>No previous versions — this record has been issued once.</div>
          ) : (
            <div style={{background:"#F6F5FA",border:"1px solid #E8EAF2",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#4A4E63",letterSpacing:0.4,textTransform:"uppercase",marginBottom:6}}>Previous versions</div>
              {historyRows.map(r=>(
                <div key={r.sign_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"3px 0"}}>
                  <span style={{fontSize:11,color:"#4A4E63"}}>
                    Issued {r.created_at?fmtDate(r.created_at):"—"} · {confirmationSemantics(r.status).stateLine} · replaced {r.superseded_at?fmtDate(r.superseded_at):"—"}
                  </span>
                  <button onClick={()=>setViewingSignedMeeting({...m, signId:r.sign_id, signStatus:r.status, signedAt:r.signed_at, supersededAt:r.superseded_at})}
                    style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"2px 8px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>
                    View issued record
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!m.record&&(m.agenda||m.prepQuestions?.length>0||m.attendees?.length>0)&&<ScheduledMeetingDetails m={m}/>}
      {m.record&&m.unresolvedSuggestions?.length>0&&(onAcceptSavedSuggestion||onDismissSavedSuggestion)&&(
        <div style={{marginTop:8,background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#8A5A1E",marginBottom:6}}>Not actioned during the meeting</div>
          {m.unresolvedSuggestions.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"4px 0"}}>
              <span style={{fontSize:12,color:"#0F1224"}}>{SUGGESTION_LABEL[s.kind]?.(s)||s.description}</span>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>onAcceptSavedSuggestion?.(cs,m.id,s)} style={{fontSize:11,color:"#fff",background:COLOR.purple,border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>Accept</button>
                <button onClick={()=>onDismissSavedSuggestion?.(cs,m.id,s)} style={{fontSize:11,color:"#4A4E63",background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:FONT.sans}}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {m.notetakerNotesStatus==="submitted"&&(
        <div style={{marginTop:8,background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:"#8A8EA3",marginBottom:6}}>Submitted by {m.notetakerNotesSubmittedBy||"the notetaker"}{m.notetakerNotesSubmittedAt?" · "+fmtDate(m.notetakerNotesSubmittedAt):""}</div>
          <div style={{fontSize:13,color:"#0F1224",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:10}}>{m.notetakerNotes}</div>
          <button onClick={()=>markNotetakerNotesReviewed(m)} style={{fontSize:11,background:"#1A7A4A",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Mark reviewed</button>
        </div>
      )}
    </div>
  );
  };

  if (!activeStage) return null;

  return (
    <>
      {/* Wave B.2 corrective — the whole case's meeting state, above the stage
          filter. The filter shows one stage at a time, so a case with an
          investigation record awaiting review and a disciplinary in progress
          showed neither fact until you clicked through. This says it once. */}
      {meetingsSummary(meetings)&&(
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginBottom:12}}>{meetingsSummary(meetings)}</div>
      )}
      <div style={{display:"flex",gap:2,marginBottom:16}}>
        {allStages.map(s=>(
          <button key={s.id} onClick={()=>setActiveCaseStage(s.id)}
            style={{padding:"6px 14px",borderRadius:6,border:"none",background:activeStage.id===s.id?COLOR.purpleTint:"none",color:activeStage.id===s.id?s.color:"#4A4E63",fontWeight:activeStage.id===s.id?600:400,fontSize:13,cursor:"pointer",fontFamily:FONT.sans,display:"flex",alignItems:"center",gap:5}}>
            {s.label}
            {s.meetings.length>0&&<span style={{fontSize:10,background:activeStage.id===s.id?s.color:"#E8EAF2",color:activeStage.id===s.id?"#fff":"#4A4E63",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{s.meetings.length}</span>}
          </button>
        ))}
      </div>

      {activeStage.meetings.length>0?(
        <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:14,fontWeight:700,color:activeStage.color}}>Meetings ({activeStage.meetings.length})</div>
            <button onClick={()=>startMeeting(typeFor(activeStage.id))} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>+ Add meeting</button>
          </div>
          <div style={{padding:"0 16px"}}>
            {activeStage.meetings.map((m,i)=><MeetingRow key={m.id||i} m={m}/>)}
          </div>
        </div>
      ):(
        <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8EAF2",marginBottom:16}}>
          <div style={{fontSize:14,color:"#8A8EA3",marginBottom:12}}>No {activeStage.label.toLowerCase()} meetings yet</div>
          <button onClick={()=>startMeeting(typeFor(activeStage.id))} style={{background:COLOR.purple,border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>Start {activeStage.label.toLowerCase()} meeting</button>
        </div>
      )}

      {activeStage.id==="investigation"&&(
        <>
          <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:14,fontWeight:700,color:COLOR.purple}}>Investigation report</div>
              {cs.investigationReport&&<button onClick={()=>{setLetterOutput(cs.investigationReport);setScreen(screens.LETTER);}} style={{fontSize:11,color:COLOR.purple,background:COLOR.purpleTint,border:"none",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>View report</button>}
            </div>
            <div style={{padding:"14px 16px"}}>{
              cs.investigationReport?(
                <div style={{fontSize:13,color:"#1A7A4A"}}>Report generated {fmtDate(cs.investigationReportDate)}</div>
              ):invMeetings.some(m=>m.record)?(
                <div>
                  <div style={{fontSize:13,color:"#4A4E63",marginBottom:12}}>Investigation meetings recorded. Ready to conclude.</div>
                  <button disabled={concludingInvestigation} aria-busy={concludingInvestigation} onClick={()=>attemptSubmitInvestigation(cs.id)}
                    style={{background:"#1C1820",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",fontWeight:600,cursor:concludingInvestigation?"not-allowed":"pointer",opacity:concludingInvestigation?0.6:1,fontFamily:FONT.sans}}>
                    {concludingInvestigation?"Generating report...":"Conclude investigation & generate report"}
                  </button>
                  {/* Human UAT remediation, Batch 2, Part 12 — the report
                      itself is a genuinely unavoidable multi-part AI
                      generation; what's removable is the perceived wait.
                      Streams the real, actual text as Compass writes it
                      (this app's own established pattern for other long-
                      form generations) rather than a blank wait or a
                      fabricated percentage. */}
                  {concludingInvestigation&&(
                    <div ref={investigationReportDraftRef} style={{marginTop:12,background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:8,padding:"10px 12px",maxHeight:140,overflowY:"auto",fontSize:11,color:"#4A4E63",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                      {investigationReportDraft||"Reading the investigation record..."}
                    </div>
                  )}
                </div>
              ):(
                <div style={{fontSize:13,color:"#8A8EA3"}}>No report yet — complete investigation meetings first, then generate here.</div>
              )
            }</div>
          </div>
          {(cs.investigationReport || (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("investigation")&&m.signStatus==="signed")) && !cs.disciplinaryOfficer && (
            <div style={{marginTop:12,padding:"14px 16px",background:COLOR.purpleTint,borderRadius:12,border:`1px solid ${COLOR.purple}55`}}>
              <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Investigation complete</div>
              <div style={{fontSize:12,color:"#4A4E63",marginBottom:12}}>Appoint a disciplinary officer to continue the process.</div>
              <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:13,background:COLOR.purple,border:"none",borderRadius:8,padding:"9px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Appoint disciplinary officer →</button>
            </div>
          )}
          {cs.disciplinaryOfficer && (
            <div style={{marginTop:12,padding:"14px 16px",background:"#E8F5EE",borderRadius:12,border:"1px solid #A8D5B5"}}>
              <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Disciplinary officer appointed</div>
              <div style={{fontSize:12,color:"#4A4E63",marginTop:2}}>{cs.disciplinaryOfficer} · Handed off {fmtDate(cs.handoffDate)}</div>
            </div>
          )}
        </>
      )}
      {viewingSignedMeeting&&<SignedRecordModal meeting={viewingSignedMeeting} fmtDate={fmtDate} loadSignedSnapshot={loadSignedSnapshot} onClose={()=>setViewingSignedMeeting(null)}/>}
    </>
  );
}
