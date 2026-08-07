import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { CheckIcon, WarningIcon } from '../components/Icons';

export function HomeMeetingScreen({ meetingSetup, setMeetingSetup, orgMembers, getEmployeeRecord, cases, needsInvitation, setCaseInfo, setMeetingType, setPendingLetterType, setShowLetterModal, setScreen, setTranscript, setPrepNotes, setReviewOutput, setReviewOutputOriginal, setLetterOutput, setRiskScore, setLiveChatHistory, setParticipants, generateBrief, startSession }) {
  const isGroupMeeting = meetingSetup.type === "redundancy-atrisk" || meetingSetup.type === "redundancy-consult";
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantRole, setNewParticipantRole] = useState(isGroupMeeting ? "Affected employee" : "Witness");
  const [showAttendees, setShowAttendees] = useState(false);
  const attendeesExpanded = isGroupMeeting || (meetingSetup.participants||[]).length>0 || showAttendees;
  const addParticipant = () => {
    if(!newParticipantName.trim()) return;
    setMeetingSetup(p=>({...p, participants:[...(p.participants||[]), {name:newParticipantName.trim(), role:newParticipantRole}]}));
    setNewParticipantName("");
  };
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",display:"flex",flexDirection:"column"}}>
      <div style={{flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"48px 24px"}}>
        <div style={{width:"100%",maxWidth:480}}>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:28,fontWeight:400,color:"#1A1535",margin:"0 0 6px",letterSpacing:"-0.3px"}}>New meeting</h2>
          <p style={{fontSize:14,color:"#9B9098",margin:"0 0 32px"}}>Fill in the details — Compass handles the rest</p>

          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Your name (chair)</label>
            <input autoFocus placeholder="e.g. Tom Norton"
              value={meetingSetup.manager||""}
              onChange={e=>{
                const val=e.target.value;
                const rec=(orgMembers||[]).find(m=>m.name===val.trim());
                setMeetingSetup(p=>({...p,manager:val,chairJobTitle:rec?(rec.job_title||""):p.chairJobTitle}));
              }}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
              onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
              onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
          </div>

          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Chair job title <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
            <input placeholder="e.g. HR Manager"
              value={meetingSetup.chairJobTitle||""}
              onChange={e=>setMeetingSetup(p=>({...p,chairJobTitle:e.target.value}))}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
              onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
              onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
          </div>

          {meetingSetup.linkedCaseId&&(
            <div style={{background:"#EDE8FF",border:"1px solid #D4C9F5",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,color:"#5B3FD4",marginBottom:2}}>Witness interview</div>
              <div style={{fontSize:12,color:"#7C5CFC"}}>This interview will be saved as evidence in {meetingSetup.linkedCaseName} case</div>
            </div>
          )}
          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>{meetingSetup.linkedCaseId?"Witness name":"Employee name"}</label>
            <input placeholder={meetingSetup.linkedCaseId?"e.g. John Smith (witness)":"e.g. Sarah Johnson"}
              value={meetingSetup.employee}
              onChange={e=>{
                const val=e.target.value;
                const rec=getEmployeeRecord(val.trim());
                setMeetingSetup(p=>({...p,employee:val,employeeJobTitle:rec?(rec.jobTitle||""):p.employeeJobTitle}));
              }}
              list="employee-list"
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
              onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
              onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
            <datalist id="employee-list">
              {[...new Set(cases.map(cs=>cs.employeeName).filter(Boolean))].map(n=><option key={n} value={n}/>)}
            </datalist>
          </div>

          {!meetingSetup.linkedCaseId&&(
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Employee job title <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <input placeholder="e.g. Sales Manager"
                value={meetingSetup.employeeJobTitle||""}
                onChange={e=>setMeetingSetup(p=>({...p,employeeJobTitle:e.target.value}))}
                style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
                onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
            </div>
          )}

          {!meetingSetup.linkedCaseId&&meetingSetup.type&&needsInvitation(meetingSetup.type)&&(
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Representative / companion <span style={{fontWeight:400,color:"#9B9098"}}>(optional — right to be accompanied, ERA 1999 s.10)</span></label>
              <div style={{display:"flex",gap:8}}>
                <input placeholder="e.g. Jo Bloggs (if present)"
                  value={meetingSetup.representative||""}
                  onChange={e=>setMeetingSetup(p=>({...p,representative:e.target.value}))}
                  style={{flex:2,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
                <select value={meetingSetup.representativeRole||"colleague"}
                  onChange={e=>setMeetingSetup(p=>({...p,representativeRole:e.target.value}))}
                  style={{flex:1,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 10px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}>
                  <option value="colleague">Colleague</option>
                  <option value="trade union representative">Trade union rep</option>
                </select>
              </div>
            </div>
          )}

          {!meetingSetup.linkedCaseId&&!attendeesExpanded&&(
            <div style={{marginBottom:20}}>
              <button onClick={()=>setShowAttendees(true)} style={{background:"none",border:"none",color:"#7C5CFC",fontSize:13,fontWeight:500,cursor:"pointer",padding:0}}>
                + Add another attendee <span style={{fontWeight:400,color:"#9B9098"}}>(witness, observer — rare, optional)</span>
              </button>
            </div>
          )}

          {!meetingSetup.linkedCaseId&&attendeesExpanded&&(
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>{isGroupMeeting?"Affected employees / other attendees":"Additional attendees"} <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              {isGroupMeeting&&<p style={{fontSize:12,color:"#9B9098",margin:"0 0 8px"}}>For a group consultation, list everyone else affected here — each can still get their own individual case afterwards.</p>}
              {(meetingSetup.participants||[]).length>0&&(
                <div style={{marginBottom:8}}>
                  {meetingSetup.participants.map((p,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                      <span style={{fontSize:13,color:"#1A1535"}}>{p.name} <span style={{color:"#9B9098"}}>— {p.role}</span></span>
                      <button onClick={()=>setMeetingSetup(prev=>({...prev, participants: prev.participants.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#C84B2F",fontSize:12,cursor:"pointer"}}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <input placeholder="Name" value={newParticipantName}
                  onChange={e=>setNewParticipantName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addParticipant())}
                  style={{flex:2,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
                <select value={newParticipantRole} onChange={e=>setNewParticipantRole(e.target.value)}
                  style={{flex:1,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 6px",fontSize:13,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}>
                  <option value="Affected employee">Affected employee</option>
                  <option value="Witness">Witness</option>
                  <option value="Notetaker">Notetaker</option>
                  <option value="Observer">Observer</option>
                  <option value="Other">Other</option>
                </select>
                <button onClick={addParticipant} style={{background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:10,padding:"0 16px",fontSize:13,color:"#1A1535",cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
              </div>
            </div>
          )}

          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Meeting type</label>
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}>
              {[
                {id:"investigation",label:"Investigation",desc:"Fact-finding before formal action"},
                {id:"disciplinary",label:"Disciplinary hearing",desc:"Formal disciplinary process"},
                {id:"grievance",label:"Grievance",desc:"Employee raised a concern"},
                {id:"redundancy-atrisk",label:"Redundancy consultation",desc:"At risk or confirmed redundancy"},
                {id:"return",label:"Return to work",desc:"After sickness absence"},
                {id:"informal",label:"Informal / 1-1",desc:"General check-in"},
                {id:"appeal-disciplinary",label:"Appeal",desc:"Appeal against a decision"},
                {id:"pip-review",label:"Performance review",desc:"PIP or performance discussion"},
              ].map((t,i,arr)=>(
                <button key={t.id} onClick={()=>setMeetingSetup(p=>({...p,type:t.id}))}
                  style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:meetingSetup.type===t.id?"#F5F3FF":"#FFFFFF",border:"none",borderBottom:i<arr.length-1?"1px solid #F5F1EA":"none",borderLeft:`3px solid ${meetingSetup.type===t.id?"#7C5CFC":"transparent"}`,cursor:"pointer",textAlign:"left",transition:"all 0.1s",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:meetingSetup.type===t.id?600:400,color:meetingSetup.type===t.id?"#5B3FD4":"#1A1535"}}>{t.label}</div>
                    <div style={{fontSize:12,color:"#9B9098",marginTop:1}}>{t.desc}</div>
                  </div>
                  {meetingSetup.type===t.id&&<CheckIcon size={14} color="#7C5CFC" style={{marginLeft:8}} />}
                </button>
              ))}
            </div>
          </div>

          {/* Invitation warning */}
          {meetingSetup.type&&needsInvitation(meetingSetup.type)&&(
            <div style={{background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:10,padding:"14px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
              <WarningIcon size={15} color="#B87520" style={{flexShrink:0}} />
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#B87520",marginBottom:3}}>Formal invitation required</div>
                <div style={{fontSize:12,color:"#7A5C1A",lineHeight:1.6}}>
                  {meetingSetup.type==="disciplinary"&&"The employee must receive a written invitation at least 48 hours before the hearing, including the allegations, evidence, and right to be accompanied (ERA 1999 s.10)."}
                  {meetingSetup.type==="grievance"&&"Send a written invitation confirming the date, time, location and the employee's right to be accompanied."}
                  {meetingSetup.type==="redundancy-atrisk"&&"Employees must receive written notice of the at-risk meeting and have the opportunity to discuss alternatives (ERA 1996)."}
                  {meetingSetup.type==="appeal-disciplinary"&&"The appeal invitation must confirm the grounds being considered and the employee's right to be accompanied."}
                  {meetingSetup.type==="pip-review"&&"Send a written invitation with the agenda and any supporting documents in advance."}
                </div>
                <button onClick={()=>{
                    const mt = MEETING_TYPES.find(t=>t.id===meetingSetup.type)||{id:meetingSetup.type,label:meetingSetup.type};
                    setCaseInfo(p=>({...p,
                      employee:meetingSetup.employee.trim()||p.employee,
                      employeeJobTitle:meetingSetup.employeeJobTitle||p.employeeJobTitle,
                      manager:meetingSetup.manager||p.manager,
                      chairJobTitle:meetingSetup.chairJobTitle||p.chairJobTitle,
                      date:meetingSetup.date
                    }));
                    setMeetingType(mt);
                    setPendingLetterType("invite");
                    setShowLetterModal(true);
                  }}
                  style={{marginTop:8,background:"none",border:"1px solid #B87520",borderRadius:6,padding:"5px 12px",fontSize:11,color:"#B87520",cursor:"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  Draft invitation letter →
                </button>
              </div>
            </div>
          )}

          <div style={{marginBottom:28}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Date</label>
            <input type="date" value={meetingSetup.date}
              onChange={e=>setMeetingSetup(p=>({...p,date:e.target.value}))}
              onClick={e=>e.currentTarget.showPicker?.()}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)",colorScheme:"light",cursor:"pointer"}}
              onFocus={e=>{e.target.style.borderColor="#7C5CFC";}}
              onBlur={e=>{e.target.style.borderColor="#E8E0D0";}}/>
          </div>

          <button
            disabled={!meetingSetup.employee.trim()||!meetingSetup.type}
            onClick={()=>{
              const mt = MEETING_TYPES.find(t=>t.id===meetingSetup.type)||{id:meetingSetup.type,label:meetingSetup.type,mode:"er",group:"formal"};
              if(mt.group==="dev"){ startSession(mt); return; }
              setMeetingType(mt);
              setCaseInfo(p=>({...p,employee:meetingSetup.employee.trim(),employeeJobTitle:meetingSetup.employeeJobTitle||"",date:meetingSetup.date,manager:meetingSetup.manager||"",chairJobTitle:meetingSetup.chairJobTitle||"",representative:meetingSetup.representative||"",representativeRole:meetingSetup.representativeRole||"colleague",_linkedCaseId:meetingSetup.linkedCaseId||p._linkedCaseId,_linkedCaseName:meetingSetup.linkedCaseName||p._linkedCaseName}));
              setTranscript([]);setPrepNotes("");setReviewOutput("");setReviewOutputOriginal("");setLetterOutput("");setRiskScore(null);setLiveChatHistory([]);setParticipants(meetingSetup.participants||[]);
              const hasPrev=cases.some(cs=>cs.employeeName===meetingSetup.employee.trim());
              if(hasPrev){generateBrief(meetingSetup.employee.trim(),mt.label);setScreen(SCREENS.BRIEF);}else{setScreen(SCREENS.RECORD);}
            }}
            style={{width:"100%",background:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:10,padding:"14px",fontSize:15,color:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#9B9098":"#FFFFFF",fontWeight:600,cursor:(!meetingSetup.employee.trim()||!meetingSetup.type)?"not-allowed":"pointer",transition:"all 0.15s",fontFamily:"DM Sans,system-ui,sans-serif",boxShadow:(!meetingSetup.employee.trim()||!meetingSetup.type)?"none":"0 4px 16px rgba(124,92,252,0.25)"}}>
            Start meeting
          </button>
        </div>
      </div>
    </div>
  );
}
