import { SCREENS, MEETING_TYPES } from '../constants';

export function CaseViewScreen({ cases, activeCaseId, setScreen, getCaseStage, getNextStep, fmtDate, getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, orgMembers, setCaseInfo, activeCaseStage, setActiveCaseStage, saveCases, setReviewOutput, setMeetingType, showAppealInput, setShowAppealInput, appealText, setAppealText, setShowHandoffModal, setShowOutcomeModal, showToast, currentUser, setLetterOutput, setShowSignModal, handleLetter }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  if(!cs) return <div style={{padding:40,color:"#9B9098",fontFamily:"DM Sans,system-ui,sans-serif"}}>Case not found — <button onClick={()=>setScreen(SCREENS.CASES)} style={{color:"#7C5CFC",background:"none",border:"none",cursor:"pointer"}}>Back to cases</button></div>;
  const meetings = cs.meetings||[];
  const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const otherMeetings = meetings.filter(m=>!["investigation","disciplinary","appeal"].some(t=>(m.type||"").toLowerCase().includes(t))).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const stage = getCaseStage(cs);
  const nextStep = getNextStep(cs);
  const allStages = [
    {id:"investigation",label:"Investigation",meetings:invMeetings,color:"#7C5CFC"},
    {id:"disciplinary",label:"Disciplinary",meetings:discMeetings,color:"#C84B2F"},
    {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
    ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#6B6375"}]:[]),
  ].filter(s=>s.meetings.length>0||s.id==="investigation");
  const activeStage = allStages.find(s=>s.id===activeCaseStage)||allStages[0];

  const MeetingRow = ({m})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #F5F1EA",gap:12}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{m.type}</div>
        <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
        {m.signStatus==="signed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Signed</span>}
        {m.signStatus==="pending"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>Pending signature</span>}
        {m.signStatus==="pending"&&<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(mt=>mt.id===m.id?{...mt,signStatus:"signed"}:mt)}:x))} style={{fontSize:10,background:"#E8F5EE",border:"none",borderRadius:4,padding:"2px 8px",color:"#1A7A4A",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>}
        {m.record&&<button onClick={()=>{setReviewOutput(m.record);setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:m.manager||"",date:m.date}));setScreen(SCREENS.REVIEW);}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 28px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setScreen(SCREENS.CASES)} style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>← Cases</button>
            <div style={{width:1,height:16,background:"#EDE5D8"}}/>
            <div>
              <div style={{fontSize:11,color:"#9B9098"}}>{cs.employeeName}</div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535"}}>{getProceedingTitle(cs)}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"4px 12px"}}>{getCaseStatus(cs).label}</span>
            <button onClick={()=>{const type=activeStage?.id==="investigation"?"investigation":activeStage?.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}}
              style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New meeting</button>
          </div>
        </div>
        {/* Stage tabs */}
        <div style={{display:"flex",gap:2}}>
          {allStages.map(s=>(
            <button key={s.id} onClick={()=>setActiveCaseStage(s.id)}
              style={{padding:"6px 14px",borderRadius:6,border:"none",background:activeCaseStage===s.id?"#F5F3FF":"none",color:activeCaseStage===s.id?s.color:"#6B6375",fontWeight:activeCaseStage===s.id?600:400,fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",alignItems:"center",gap:5}}>
              {s.label}
              {s.meetings.length>0&&<span style={{fontSize:10,background:activeCaseStage===s.id?s.color:"#E8E0D0",color:activeCaseStage===s.id?"#fff":"#6B6375",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{s.meetings.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Next action */}
      {nextStep&&stage!=="closed"&&(
        <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:13,color:"#5B3FD4",fontWeight:500}}>Next: {nextStep.label}</div>
          <div style={{display:"flex",gap:8}}>
            {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed",closedReason:"no_case"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));handleLetter("no-case-answer");}}} style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.secondary.label}</button>}
            <button onClick={()=>{
              if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"){setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:nextStep.action==="start_investigation"?"investigation":nextStep.action==="start_appeal_meeting"?"appeal-disciplinary":"disciplinary"}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}
              else if(nextStep.action==="send_signature"){const rel=stage==="investigation"?invMeetings:stage==="appeal"?appealMeetings:discMeetings;const m=rel[0]||meetings[meetings.length-1];if(m?.record){setReviewOutput(m.record);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setShowSignModal(true);}}
              else if(nextStep.action==="inv_report"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"inv_report"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="investigation")||null);handleLetter("investigation-report");}
              else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);handleLetter("invite");}
              else if(nextStep.action==="outcome_letter"||nextStep.action==="appeal_letter"){const m=discMeetings[0]||meetings[meetings.length-1];if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));handleLetter("outcome");}
              else if(nextStep.action==="close_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));}
            }} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 18px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.label} →</button>
          </div>
        </div>
      )}

      {/* Closed - appeal */}
      {stage==="closed"&&!showAppealInput[cs.id]&&!meetings.some(m=>(m.type||"").toLowerCase().includes("appeal"))&&(
        <div style={{background:"#E8F5EE",borderBottom:"1px solid #C8E6C9",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Case closed</div>
          <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:true}))} style={{fontSize:12,background:"none",border:"1px solid #C84B2F",borderRadius:6,padding:"5px 14px",color:"#C84B2F",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Employee is appealing</button>
        </div>
      )}
      {showAppealInput[cs.id]&&(
        <div style={{background:"#FEF5E7",borderBottom:"1px solid #F5E6C4",padding:"14px 28px",flexShrink:0}}>
          <div style={{fontSize:13,color:"#5B3FD4",fontWeight:500,marginBottom:8}}>Paste the employee appeal — Compass will use this for the appeal hearing:</div>
          <textarea value={appealText[cs.id]||""} onChange={e=>setAppealText(p=>({...p,[cs.id]:e.target.value}))} rows={3} style={{width:"100%",background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1A1535",outline:"none",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"appeal",appealText:appealText[cs.id]||""}:x));setShowAppealInput(p=>({...p,[cs.id]:false}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setMeetingType(MEETING_TYPES.find(t=>t.id==="appeal-disciplinary")||null);handleLetter("invite");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>Start appeal and send invitation</button>
            <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:false}))} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
          </div>
        </div>
      )}
      {/* Appeal — option to proceed to new disciplinary if appeal upheld/dismissed */}
      {stage==="appeal"&&(
        <div style={{background:"#FDFAF5",borderBottom:"1px solid #E8E0D0",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#9B9098"}}>Appeal in progress · {cs.disciplinaryOfficer?"Officer: "+cs.disciplinaryOfficer:"No officer assigned"}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
              {cs.disciplinaryOfficer?"Reassign officer":"Appoint appeal officer"}
            </button>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));showToast("Case closed");}} style={{fontSize:12,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
              Close case
            </button>
          </div>
        </div>
      )}


      {/* Stage content */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
        {activeStage&&(
          <div style={{maxWidth:800,margin:"0 auto"}}>
            {activeStage.meetings.length>0?(
              <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:700,color:activeStage.color,letterSpacing:"0.5px",textTransform:"uppercase"}}>Meetings ({activeStage.meetings.length})</div>
                  <button onClick={()=>{const type=activeStage.id==="investigation"?"investigation":activeStage.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ Add meeting</button>
                </div>
                <div style={{padding:"0 16px"}}>
                  {activeStage.meetings.map((m,i)=><MeetingRow key={m.id||i} m={m}/>)}
                </div>
              </div>
            ):(
              <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0",marginBottom:16}}>
                <div style={{fontSize:14,color:"#9B9098",marginBottom:12}}>No {activeStage.label.toLowerCase()} meetings yet</div>
                <button onClick={()=>{const type=activeStage.id==="investigation"?"investigation":activeStage.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start {activeStage.label.toLowerCase()} meeting</button>
              </div>
            )}

            {activeStage.id==="disciplinary"&&(
              <div style={{marginTop:16}}>
                {cs.outcome?(
                  <div style={{background:"#E8F5EE",border:"1px solid #A8D5B5",borderRadius:12,padding:"16px 20px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#1A7A4A",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Outcome issued</div>
                    <div style={{fontSize:14,fontWeight:600,color:"#1C1820",marginBottom:4}}>{cs.outcome}</div>
                    <div style={{fontSize:12,color:"#6B6375"}}>Issued {fmtDate(cs.outcomeDate)} · Appeal window: 5 working days from issue</div>
                  </div>
                ):(
                  <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px"}}>
                    <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Issue disciplinary outcome</div>
                    <div style={{fontSize:12,color:"#6B6375",marginBottom:14}}>Once the hearing is complete, issue the written outcome. ACAS recommends within 5 working days of the hearing. The outcome letter starts the employee's 5-day appeal window.</div>
                    <button onClick={()=>setShowOutcomeModal(true)} style={{fontSize:13,background:"#1C1820",border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Issue outcome →</button>
                  </div>
                )}
              </div>
            )}

            {activeStage.id==="investigation"&&(
              <>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}><div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Evidence & witness statements</div></div>
                  <div style={{padding:"16px"}}>
                    {(cs.evidence||[]).length===0&&<div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>No evidence added yet</div>}
                    {(cs.evidence||[]).map((ev,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F1EA"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#1A1535",fontWeight:500}}>{ev.name}</div>
                          <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:"#9B9098"}}>{ev.type} · {fmtDate(ev.date)}</span>
                            {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"1px 6px",fontWeight:600}}>Signed</span>:<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"1px 6px"}}>Pending signature</span>)}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          {ev.dataUrl&&<a href={ev.dataUrl} download={ev.name} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"3px 8px",textDecoration:"none",fontWeight:500}}>Download</a>}
                          {ev.record&&<button onClick={()=>{setReviewOutput(ev.record);setScreen(SCREENS.REVIEW);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
                          {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"3px 8px",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Signed</span>:<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).map((e,j)=>j===i?{...e,signStatus:"signed"}:e)}:x))} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>)}
                          <button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).filter((_,j)=>j!==i)}:x))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
                        </div>
                      </div>
                    ))}
                    <label style={{display:"flex",alignItems:"center",justifyContent:"center",border:"2px dashed #E8E0D0",borderRadius:8,padding:"16px",cursor:"pointer",background:"#FDFAF5",marginTop:12,transition:"all 0.15s"}}
                      onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#F5F3FF";}}
                      onDragLeave={e=>{e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FDFAF5";}}
                      onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FDFAF5";Array.from(e.dataTransfer.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{const nv={name:f.name,type:f.type||"Document",size:f.size,date:new Date().toLocaleDateString("en-GB"),addedBy:currentUser?.name||"HR Manager",dataUrl:ev.target.result};saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:[...(x.evidence||[]),nv]}:x));};r.readAsDataURL(f);});}}>
                      <input type="file" multiple onChange={e=>{Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{const nv={name:f.name,type:f.type||"Document",size:f.size,date:new Date().toLocaleDateString("en-GB"),addedBy:currentUser?.name||"HR Manager",dataUrl:ev.target.result};saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:[...(x.evidence||[]),nv]}:x));};r.readAsDataURL(f);});}} style={{display:"none"}}/>
                      <div style={{textAlign:"center"}}><div style={{fontSize:13,color:"#6B6375",fontWeight:500}}>Drop files or click to upload</div><div style={{fontSize:11,color:"#9B9098",marginTop:2}}>CCTV, emails, screenshots, documents</div></div>
                    </label>
                    <div style={{marginTop:12,padding:"12px",background:"#F5F3FF",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div><div style={{fontSize:12,fontWeight:500,color:"#1A1535"}}>Witness interview</div><div style={{fontSize:11,color:"#9B9098"}}>Record and save directly to this investigation</div></div>
                      <button onClick={()=>{setMeetingSetup(p=>({...p,employee:"",employeeJobTitle:"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:"investigation",linkedCaseId:cs.id,linkedCaseName:cs.employeeName}));setCaseInfo(p=>({...p,_linkedCaseId:cs.id,_linkedCaseName:cs.employeeName}));setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>+ Witness interview</button>
                    </div>
                  </div>
                </div>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Investigation report</div>
                    {cs.investigationReport&&<button onClick={()=>{setLetterOutput(cs.investigationReport);setScreen(SCREENS.LETTER);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View report</button>}
                  </div>
                  <div style={{padding:"14px 16px"}}>{
                    cs.investigationReport?(
                      <div style={{fontSize:13,color:"#1A7A4A"}}>Report generated {fmtDate(cs.investigationReportDate)}</div>
                    ):invMeetings.some(m=>m.record)?(
                      <div>
                        <div style={{fontSize:13,color:"#6B6375",marginBottom:12}}>Investigation meetings recorded. Ready to conclude.</div>
                        <button onClick={()=>{
                          const rpt = invMeetings.filter(m=>m.record).map(m=>"Meeting: "+m.type+" — "+m.date+"\n\n"+(m.record||"")).join("\n\n---\n\n");
                          const fullRpt = "Investigation Report\n\nEmployee: "+cs.employeeName+"\nCase: "+(cs.caseType||"HR Matter")+"\nDate concluded: "+new Date().toLocaleDateString("en-GB")+"\n\n"+rpt;
                          saveCases(cases.map(x=>x.id===cs.id?{...x,investigationReport:fullRpt,investigationReportDate:new Date().toISOString(),stage:"inv_report"}:x));
                          showToast("Investigation concluded");
                        }} style={{background:"#1C1820",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                          Conclude investigation &amp; generate report
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
            <div style={{marginTop:20,padding:"12px 0",borderTop:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#9B9098"}}>{cs.description&&<span style={{fontStyle:"italic"}}>"{cs.description.slice(0,60)}{cs.description.length>60?"...":""}"</span>}{cs.referredBy&&<span style={{marginLeft:8}}>Referred by: {cs.referredBy}</span>}</div>
              <button onClick={()=>{if(window.confirm("Delete this case?"))saveCases(cases.filter(x=>x.id!==cs.id));setScreen(SCREENS.CASES);}} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Delete case</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
