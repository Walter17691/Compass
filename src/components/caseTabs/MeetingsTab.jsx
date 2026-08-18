import { isGrievanceCase } from '../../lib/caseStage';

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
export function MeetingsTab({ cs, cases, saveCases, activeCaseStage, setActiveCaseStage, setMeetingSetup, setCaseInfo, getEmployeeRecord, orgMembers, setScreen, screens, setReviewOutput, setMeetingType, meetingTypes, fmtDate, attemptSubmitInvestigation, concludingInvestigation, setShowHandoffModal, setLetterOutput, onAcceptSavedSuggestion, onDismissSavedSuggestion }) {
  const grievance = isGrievanceCase(cs);
  const meetings = cs.meetings||[];
  const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const grievanceMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("grievance")&&!(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const knownTerms = grievance ? ["grievance","appeal"] : ["investigation","disciplinary","appeal"];
  const otherMeetings = meetings.filter(m=>!knownTerms.some(t=>(m.type||"").toLowerCase().includes(t))).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const allStages = grievance ? [
    {id:"hearing",label:"Grievance",meetings:grievanceMeetings,color:"#7C5CFC"},
    {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
    ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#6B6375"}]:[]),
  ].filter(s=>s.meetings.length>0||s.id==="hearing") : [
    {id:"investigation",label:"Investigation",meetings:invMeetings,color:"#7C5CFC"},
    {id:"disciplinary",label:"Disciplinary",meetings:discMeetings,color:"#C84B2F"},
    {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
    ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#6B6375"}]:[]),
  ].filter(s=>s.meetings.length>0||s.id==="investigation");
  const activeStage = allStages.find(s=>s.id===activeCaseStage)||allStages[0];

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
    <div style={{marginTop:8,background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#5B3FD4",letterSpacing:0.5,textTransform:"uppercase",marginBottom:6}}>Scheduled — not yet held</div>
      {m.attendees?.length>0&&<div style={{fontSize:12,color:"#1A1535",marginBottom:6}}>Attendees: {m.attendees.join(", ")}</div>}
      {m.agenda&&<div style={{fontSize:12,color:"#1A1535",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:m.prepQuestions?.length?8:0}}>{m.agenda}</div>}
      {m.prepQuestions?.length>0&&(
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#5B3FD4",letterSpacing:0.5,textTransform:"uppercase",marginBottom:4}}>Prep questions</div>
          {m.prepQuestions.map(q=>(
            <div key={q.id} style={{fontSize:12,color:"#1A1535",marginBottom:2}}>{q.essential?"● ":"○ "}{q.text}</div>
          ))}
        </div>
      )}
    </div>
  );

  const MeetingRow = ({m}) => (
    <div style={{padding:"12px 0",borderBottom:"1px solid #F5F1EA"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{m.type}</div>
          <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
          {m.signStatus==="signed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Signed</span>}
          {m.signStatus==="pending"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>Pending signature</span>}
          {m.signStatus==="pending"&&<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(mt=>mt.id===m.id?{...mt,signStatus:"signed"}:mt)}:x))} style={{fontSize:10,background:"#E8F5EE",border:"none",borderRadius:4,padding:"2px 8px",color:"#1A7A4A",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>}
          {m.notetakerNotesStatus==="submitted"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Notetaker notes awaiting review</span>}
          {m.notetakerNotesStatus==="reviewed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Notetaker notes reviewed</span>}
          {m.record&&<button onClick={()=>{setReviewOutput(m.record);setMeetingType(meetingTypes.find(t=>t.label===m.type)||null);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:m.manager||"",date:m.date}));setScreen(screens.REVIEW);}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
        </div>
      </div>
      {!m.record&&(m.agenda||m.prepQuestions?.length>0||m.attendees?.length>0)&&<ScheduledMeetingDetails m={m}/>}
      {m.record&&m.unresolvedSuggestions?.length>0&&(onAcceptSavedSuggestion||onDismissSavedSuggestion)&&(
        <div style={{marginTop:8,background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#8A5A1E",letterSpacing:0.5,textTransform:"uppercase",marginBottom:6}}>Not actioned during the meeting</div>
          {m.unresolvedSuggestions.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"4px 0"}}>
              <span style={{fontSize:12,color:"#1A1535"}}>{SUGGESTION_LABEL[s.kind]?.(s)||s.description}</span>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>onAcceptSavedSuggestion?.(cs,m.id,s)} style={{fontSize:11,color:"#fff",background:"#7C5CFC",border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Accept</button>
                <button onClick={()=>onDismissSavedSuggestion?.(cs,m.id,s)} style={{fontSize:11,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {m.notetakerNotesStatus==="submitted"&&(
        <div style={{marginTop:8,background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:"#9B9098",marginBottom:6}}>Submitted by {m.notetakerNotesSubmittedBy||"the notetaker"}{m.notetakerNotesSubmittedAt?" · "+fmtDate(m.notetakerNotesSubmittedAt):""}</div>
          <div style={{fontSize:13,color:"#1A1535",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:10}}>{m.notetakerNotes}</div>
          <button onClick={()=>markNotetakerNotesReviewed(m)} style={{fontSize:11,background:"#1A7A4A",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark reviewed</button>
        </div>
      )}
    </div>
  );

  if (!activeStage) return null;

  return (
    <>
      <div style={{display:"flex",gap:2,marginBottom:16}}>
        {allStages.map(s=>(
          <button key={s.id} onClick={()=>setActiveCaseStage(s.id)}
            style={{padding:"6px 14px",borderRadius:6,border:"none",background:activeCaseStage===s.id||(!activeCaseStage&&s.id===allStages[0].id)?"#F5F3FF":"none",color:activeStage.id===s.id?s.color:"#6B6375",fontWeight:activeStage.id===s.id?600:400,fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",alignItems:"center",gap:5}}>
            {s.label}
            {s.meetings.length>0&&<span style={{fontSize:10,background:activeStage.id===s.id?s.color:"#E8E0D0",color:activeStage.id===s.id?"#fff":"#6B6375",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{s.meetings.length}</span>}
          </button>
        ))}
      </div>

      {activeStage.meetings.length>0?(
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,fontWeight:700,color:activeStage.color,letterSpacing:"0.5px",textTransform:"uppercase"}}>Meetings ({activeStage.meetings.length})</div>
            <button onClick={()=>startMeeting(typeFor(activeStage.id))} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ Add meeting</button>
          </div>
          <div style={{padding:"0 16px"}}>
            {activeStage.meetings.map((m,i)=><MeetingRow key={m.id||i} m={m}/>)}
          </div>
        </div>
      ):(
        <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0",marginBottom:16}}>
          <div style={{fontSize:14,color:"#9B9098",marginBottom:12}}>No {activeStage.label.toLowerCase()} meetings yet</div>
          <button onClick={()=>startMeeting(typeFor(activeStage.id))} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start {activeStage.label.toLowerCase()} meeting</button>
        </div>
      )}

      {activeStage.id==="investigation"&&(
        <>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Investigation report</div>
              {cs.investigationReport&&<button onClick={()=>{setLetterOutput(cs.investigationReport);setScreen(screens.LETTER);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View report</button>}
            </div>
            <div style={{padding:"14px 16px"}}>{
              cs.investigationReport?(
                <div style={{fontSize:13,color:"#1A7A4A"}}>Report generated {fmtDate(cs.investigationReportDate)}</div>
              ):invMeetings.some(m=>m.record)?(
                <div>
                  <div style={{fontSize:13,color:"#6B6375",marginBottom:12}}>Investigation meetings recorded. Ready to conclude.</div>
                  <button disabled={concludingInvestigation} onClick={()=>attemptSubmitInvestigation(cs.id)}
                    style={{background:"#1C1820",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",fontWeight:600,cursor:concludingInvestigation?"not-allowed":"pointer",opacity:concludingInvestigation?0.6:1,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    {concludingInvestigation?"Generating report...":"Conclude investigation & generate report"}
                  </button>
                </div>
              ):(
                <div style={{fontSize:13,color:"#9B9098"}}>No report yet — complete investigation meetings first, then generate here.</div>
              )
            }</div>
          </div>
          {(cs.investigationReport || (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("investigation")&&m.signStatus==="signed")) && !cs.disciplinaryOfficer && (
            <div style={{marginTop:12,padding:"14px 16px",background:"#EDE8FF",borderRadius:12,border:"1px solid #C8BCFF"}}>
              <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Investigation complete</div>
              <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>Appoint a disciplinary officer to continue the process.</div>
              <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:8,padding:"9px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Appoint disciplinary officer →</button>
            </div>
          )}
          {cs.disciplinaryOfficer && (
            <div style={{marginTop:12,padding:"14px 16px",background:"#E8F5EE",borderRadius:12,border:"1px solid #A8D5B5"}}>
              <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Disciplinary officer appointed</div>
              <div style={{fontSize:12,color:"#6B6375",marginTop:2}}>{cs.disciplinaryOfficer} · Handed off {fmtDate(cs.handoffDate)}</div>
            </div>
          )}
        </>
      )}
    </>
  );
}
