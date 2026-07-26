import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { CompassLogo } from '../components/CompassLogo';

const NEEDS_INVITATION = ["disciplinary","grievance","redundancy-atrisk","appeal-disciplinary","pip-review"];

export function BriefScreen({ setScreen, meetingType, setMeetingType, caseInfo, setCaseInfo, getEmployeeRecord, cases, currentUser, orgMembers, activeCaseId, setActiveCaseId, getCaseStage, fmtDate, showToast, setTranscript, setAdjournments, setCurrentAdjournment, setParticipants }) {
  const isGroupMeeting = meetingType?.id === "redundancy-atrisk";
  const [participantDraft, setParticipantDraft] = useState([]);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantRole, setNewParticipantRole] = useState("Affected employee");
  const addParticipant = () => {
    if(!newParticipantName.trim()) return;
    setParticipantDraft(p=>[...p, {name:newParticipantName.trim(), role:newParticipantRole}]);
    setNewParticipantName("");
  };
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E8E0D0",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <CompassLogo size={28}/>
          <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1C1820",fontWeight:400}}>Compass</span>
        </div>
        <button onClick={()=>setScreen(SCREENS.HOME)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:7,padding:"7px 14px",fontSize:12,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>← Back</button>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"36px 24px"}}>
        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#1C1820",fontWeight:400,marginBottom:4}}>Set up your meeting</div>
        <div style={{fontSize:13,color:"#9B9098",marginBottom:32}}>Complete the details below before starting. This ensures accurate notes, correct ACAS guidance, and properly formatted documents.</div>

        {/* Step 1: Meeting type */}
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px 24px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Meeting type</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {MEETING_TYPES.map(mt=>(
              <button key={mt.id} onClick={()=>setMeetingType(mt)} style={{padding:"10px 14px",borderRadius:9,border:"1.5px solid",borderColor:meetingType?.id===mt.id?"#7C5CFC":"#E8E0D0",background:meetingType?.id===mt.id?"#EDE8FF":"#FDFAF5",cursor:"pointer",textAlign:"left",fontFamily:"DM Sans,system-ui,sans-serif",transition:"all 0.15s"}}>
                <div style={{fontSize:12,fontWeight:600,color:meetingType?.id===mt.id?"#7C5CFC":"#1C1820"}}>{mt.label}</div>
                {mt.tag&&<div style={{fontSize:10,color:"#9B9098",marginTop:2}}>{mt.tag}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Employee & chair */}
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px 24px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:14}}>Participants</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Employee name</label>
              <input value={caseInfo.employee||""} onChange={e=>{setCaseInfo(p=>({...p,employee:e.target.value}));const rec=getEmployeeRecord(e.target.value.trim());if(rec){setCaseInfo(p=>({...p,employeeJobTitle:rec.jobTitle||"",employee:e.target.value}));}}} placeholder="Full name" list="employee-list" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
              <datalist id="employee-list">{[...new Set(cases.map(c=>c.employeeName).filter(Boolean))].map(n=><option key={n} value={n}/>)}</datalist>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Employee job title <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <input value={caseInfo.employeeJobTitle||""} onChange={e=>setCaseInfo(p=>({...p,employeeJobTitle:e.target.value}))} placeholder="e.g. Sales Manager" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Chair / manager</label>
              <input value={caseInfo.manager||currentUser?.name||""} onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))} placeholder="Your name" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Chair job title <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <input value={caseInfo.chairJobTitle||(orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title||""} onChange={e=>setCaseInfo(p=>({...p,chairJobTitle:e.target.value}))} placeholder="e.g. HR Manager" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Notetaker <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <input value={caseInfo.notetaker||""} onChange={e=>setCaseInfo(p=>({...p,notetaker:e.target.value}))} placeholder="Name of notetaker" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Date</label>
              <input type="date" value={caseInfo.date||new Date().toISOString().split("T")[0]} onChange={e=>setCaseInfo(p=>({...p,date:e.target.value}))} onClick={e=>e.currentTarget.showPicker?.()} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",colorScheme:"light",cursor:"pointer"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Link to case <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <select value={activeCaseId||""} onChange={e=>{setActiveCaseId(e.target.value);const cs=cases.find(x=>x.id===e.target.value);if(cs){setCaseInfo(p=>({...p,employee:cs.employeeName}));}}} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                <option value="">No case linked</option>
                {cases.filter(cs=>getCaseStage(cs)!=="closed").map(cs=><option key={cs.id} value={cs.id}>{cs.employeeName} — {cs.caseType||"HR Matter"}</option>)}
              </select>
            </div>
          </div>
        </div>

        {meetingType&&NEEDS_INVITATION.includes(meetingType.id)&&(
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px 24px",marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Representative / companion <span style={{fontWeight:400,color:"#9B9098",textTransform:"none",letterSpacing:0}}>(optional — right to be accompanied, ERA 1999 s.10)</span></div>
            <div style={{display:"flex",gap:8}}>
              <input placeholder="e.g. Jo Bloggs (if present)" value={caseInfo.representative||""}
                onChange={e=>setCaseInfo(p=>({...p,representative:e.target.value}))}
                style={{flex:2,fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
              <select value={caseInfo.representativeRole||"colleague"} onChange={e=>setCaseInfo(p=>({...p,representativeRole:e.target.value}))}
                style={{flex:1,fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 8px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                <option value="colleague">Colleague</option>
                <option value="trade union representative">Trade union rep</option>
              </select>
            </div>
          </div>
        )}

        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px 24px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{isGroupMeeting?"Affected employees / other attendees":"Additional attendees"} <span style={{fontWeight:400,color:"#9B9098",textTransform:"none",letterSpacing:0}}>(optional)</span></div>
          {isGroupMeeting&&<p style={{fontSize:12,color:"#9B9098",margin:"0 0 8px"}}>For a group consultation, list everyone else affected here — each can still get their own individual case afterwards.</p>}
          {participantDraft.length>0&&(
            <div style={{marginBottom:8}}>
              {participantDraft.map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 12px",marginBottom:6}}>
                  <span style={{fontSize:13,color:"#1A1535"}}>{p.name} <span style={{color:"#9B9098"}}>— {p.role}</span></span>
                  <button onClick={()=>setParticipantDraft(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#C84B2F",fontSize:12,cursor:"pointer"}}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <input placeholder="Name" value={newParticipantName}
              onChange={e=>setNewParticipantName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addParticipant())}
              style={{flex:2,fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
              onFocus={e=>e.target.style.borderColor="#7C5CFC"} onBlur={e=>e.target.style.borderColor="#E8E0D0"}/>
            <select value={newParticipantRole} onChange={e=>setNewParticipantRole(e.target.value)}
              style={{flex:1,fontSize:12,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"9px 6px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
              <option value="Affected employee">Affected employee</option>
              <option value="Witness">Witness</option>
              <option value="Notetaker">Notetaker</option>
              <option value="Observer">Observer</option>
              <option value="Other">Other</option>
            </select>
            <button onClick={addParticipant} style={{background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:8,padding:"0 14px",fontSize:12,color:"#1A1535",cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
          </div>
        </div>

        {/* Step 3: ACAS guidance for meeting type */}
        {meetingType&&(
          <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px",marginBottom:24}}>
            <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>ACAS guidance — {meetingType.label}</div>
            <div style={{fontSize:12,color:"#6B6375",lineHeight:1.7}}>
              {meetingType.id==="investigation"&&"Conduct the investigation without unreasonable delay. Keep an open mind — the purpose is to establish facts, not to reach a conclusion. The employee has no statutory right to be accompanied at an investigatory meeting (unless your policy provides for this). Do not pre-judge the outcome."}
              {meetingType.id==="disciplinary"&&"The employee has a statutory right to be accompanied. State the nature of the allegation clearly. Give the employee a genuine opportunity to respond before any decision is made. Do not confirm a decision at the hearing — take time to consider and communicate the outcome in writing."}
              {meetingType.id==="grievance"&&"Listen carefully and remain neutral. The employee should be given the opportunity to fully explain their grievance. They have the right to be accompanied. You should investigate the grievance and respond in writing within a reasonable timeframe."}
              {meetingType.id==="welfare"&&"This is a supportive meeting, not a disciplinary one. Focus on understanding the employee's circumstances. Be mindful of potential disability discrimination. Consider whether reasonable adjustments may be appropriate."}
              {meetingType.id==="return"&&"Welcome the employee back. Discuss the nature of their absence sensitively. Identify any support or adjustments needed. This is not a disciplinary meeting."}
              {meetingType.id==="performance"&&"Focus on specific, measurable performance concerns. The employee should be given a realistic opportunity to improve. Consider whether training or support is appropriate before moving to formal action."}
              {!["investigation","disciplinary","grievance","welfare","return","performance"].includes(meetingType.id)&&"Ensure you have a clear agenda and objective for this meeting. Keep notes and follow up in writing where appropriate."}
            </div>
          </div>
        )}

        {/* Previous meetings context */}
        {caseInfo.employee&&(()=>{
          const empCases = cases.filter(cs=>cs.employeeName===caseInfo.employee.trim());
          const prevMeetings = empCases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,caseType:cs.caseType})));
          if(prevMeetings.length===0) return null;
          return (
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px",marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Previous meetings with {caseInfo.employee}</div>
              {prevMeetings.slice(0,3).map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<Math.min(prevMeetings.length,3)-1?"1px solid #F5F1EA":"none"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"#7C5CFC",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,color:"#1C1820",fontWeight:500}}>{m.type}</span>
                    <span style={{fontSize:11,color:"#9B9098",marginLeft:8}}>{fmtDate(m.date)}</span>
                  </div>
                  {m.signStatus==="signed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 6px"}}>Signed</span>}
                </div>
              ))}
              {prevMeetings.length>3&&<div style={{fontSize:11,color:"#9B9098",marginTop:8}}>{prevMeetings.length-3} more meetings on record</div>}
            </div>
          );
        })()}

        {/* Start button */}
        <button
          onClick={()=>{
            if(!meetingType){showToast("Please select a meeting type");return;}
            if(!caseInfo.employee?.trim()){showToast("Please enter the employee name");return;}
            const mgr = caseInfo.manager?.trim()||currentUser?.name||"HR Manager";
            const dt = caseInfo.date||new Date().toISOString().split("T")[0];
            setCaseInfo(p=>({...p,manager:mgr,date:dt}));
            setTranscript([]);
            setAdjournments([]);
            setCurrentAdjournment(null);
            setParticipants(participantDraft);
            setScreen(SCREENS.RECORD);
          }}
          style={{width:"100%",background:"#7C5CFC",border:"none",borderRadius:10,padding:"14px",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",letterSpacing:"-0.2px"}}
        >
          Start meeting →
        </button>
        {(!meetingType||!caseInfo.employee?.trim())&&(
          <div style={{textAlign:"center",fontSize:11,color:"#9B9098",marginTop:8}}>
            {!meetingType?"Select a meeting type to continue":"Enter employee name to continue"}
          </div>
        )}
      </div>
    </div>
  );
}
