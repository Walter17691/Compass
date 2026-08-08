import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { CheckIcon, WarningIcon } from '../components/Icons';

// The one meeting-setup form — reached both from contextual entry points
// (a case's "Start meeting", "+ Witness interview", PersonViewScreen's
// "New meeting", which pre-fill meetingSetup before navigating here) and
// from Home's generic "Start meeting"/"Schedule meeting" buttons (blank
// slate). Those used to be two separately hand-built forms — this one and
// BriefScreen — which had drifted: this one's meeting-type list was a
// hardcoded 8 of the 17 real types (missing Formal Meeting, PDP/1-2-1,
// both Grievance/Dismissal Appeal, and 3 of the 4 redundancy stages —
// selectable in BriefScreen but not here), while BriefScreen was missing
// this screen's invitation-letter drafting and witness-interview handling.
// BriefScreen also duplicated every field HomeMeetingScreen had already
// collected (reachable as a "second step" for employees with case
// history) and was meant to show an AI-generated meeting brief there
// (generateBrief/briefData in App.jsx) but never actually rendered it —
// the API call fired and the result was discarded. Removed rather than
// wired up: a real feature is worth building deliberately, not smuggled
// into a cleanup pass.
const FORMAL_MEETING_TYPES = MEETING_TYPES.filter(t => t.group !== "dev");
// Appraisal/Probation Review/PDP route to DevelopScreen's own structured
// flow (self-assessment, manager assessment, objectives, outcome letter)
// instead of the plain live-notes Record screen — and DevelopScreen
// collects employee name/role/department/date itself in its first step,
// so these skip straight there on click rather than joining the
// fill-in-the-form-then-submit flow below, which doesn't apply to them.
// Previously these had no way to be started anywhere in the product at
// all — DevelopScreen was fully built and completely unreachable.
const DEV_MEETING_TYPES = MEETING_TYPES.filter(t => t.group === "dev");

export function HomeMeetingScreen({ meetingSetup, setMeetingSetup, orgMembers, getEmployeeRecord, cases, getCaseStage, activeCaseId, setActiveCaseId, needsInvitation, setCaseInfo, setMeetingType, setPendingLetterType, setShowLetterModal, setScreen, setTranscript, setPrepNotes, setReviewOutput, setReviewOutputOriginal, setLetterOutput, setRiskScore, setLiveChatHistory, setParticipants, fmtDate, startSession }) {
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
  const selectedType = MEETING_TYPES.find(t=>t.id===meetingSetup.type);
  const prevMeetings = meetingSetup.employee
    ? cases.filter(cs=>cs.employeeName===meetingSetup.employee.trim()).flatMap(cs=>(cs.meetings||[]).map(m=>({...m,caseType:cs.caseType}))).sort((a,b)=>new Date(b.date)-new Date(a.date))
    : [];
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

          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Notetaker <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
            <input placeholder="Name of notetaker"
              value={meetingSetup.notetaker||""}
              onChange={e=>setMeetingSetup(p=>({...p,notetaker:e.target.value}))}
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

          {!meetingSetup.linkedCaseId&&(
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Link to case <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <select value={activeCaseId||""} onChange={e=>{setActiveCaseId(e.target.value);const cs=cases.find(x=>x.id===e.target.value);if(cs){setMeetingSetup(p=>({...p,employee:cs.employeeName}));}}}
                style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}>
                <option value="">No case linked</option>
                {cases.filter(cs=>getCaseStage(cs)!=="closed").map(cs=><option key={cs.id} value={cs.id}>{cs.employeeName} — {cs.caseType||"HR Matter"}</option>)}
              </select>
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
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 2px rgba(26,21,53,0.04)",maxHeight:340,overflowY:"auto"}}>
              {FORMAL_MEETING_TYPES.map((t)=>(
                <button key={t.id} onClick={()=>setMeetingSetup(p=>({...p,type:t.id}))}
                  style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:meetingSetup.type===t.id?"#F5F3FF":"#FFFFFF",border:"none",borderBottom:"1px solid #F5F1EA",borderLeft:`3px solid ${meetingSetup.type===t.id?"#7C5CFC":"transparent"}`,cursor:"pointer",textAlign:"left",transition:"all 0.1s",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:meetingSetup.type===t.id?600:400,color:meetingSetup.type===t.id?"#5B3FD4":"#1A1535"}}>{t.label}</div>
                    {t.tag&&<div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{t.tag}</div>}
                  </div>
                  {meetingSetup.type===t.id&&<CheckIcon size={14} color="#7C5CFC" style={{marginLeft:8}} />}
                </button>
              ))}
              <div style={{padding:"8px 16px",background:"#FDFAF5",fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase"}}>Development — goes straight to its own guided flow</div>
              {DEV_MEETING_TYPES.map((t,i,arr)=>(
                <button key={t.id} onClick={()=>startSession(t)}
                  style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:"#FFFFFF",border:"none",borderBottom:i<arr.length-1?"1px solid #F5F1EA":"none",cursor:"pointer",textAlign:"left",transition:"all 0.1s",fontFamily:"DM Sans,system-ui,sans-serif"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                  onMouseLeave={e=>e.currentTarget.style.background="#FFFFFF"}>
                  <div>
                    <div style={{fontSize:13,color:"#1A1535"}}>{t.label}</div>
                    {t.tag&&<div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{t.tag}</div>}
                  </div>
                  <span style={{color:"#C4BAB0",fontSize:16}}>›</span>
                </button>
              ))}
            </div>
          </div>

          {/* ACAS guidance for the selected type */}
          {selectedType&&(
            <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>ACAS guidance — {selectedType.label}</div>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.7}}>
                {selectedType.id==="investigation"&&"Conduct the investigation without unreasonable delay. Keep an open mind — the purpose is to establish facts, not to reach a conclusion. The employee has no statutory right to be accompanied at an investigatory meeting (unless your policy provides for this). Do not pre-judge the outcome."}
                {selectedType.id==="disciplinary"&&"The employee has a statutory right to be accompanied. State the nature of the allegation clearly. Give the employee a genuine opportunity to respond before any decision is made. Do not confirm a decision at the hearing — take time to consider and communicate the outcome in writing."}
                {selectedType.id==="grievance"&&"Listen carefully and remain neutral. The employee should be given the opportunity to fully explain their grievance. They have the right to be accompanied. You should investigate the grievance and respond in writing within a reasonable timeframe."}
                {selectedType.id==="return"&&"Welcome the employee back. Discuss the nature of their absence sensitively. Identify any support or adjustments needed. This is not a disciplinary meeting."}
                {selectedType.id==="pip-review"&&"Focus on specific, measurable performance concerns. The employee should be given a realistic opportunity to improve. Consider whether training or support is appropriate before moving to formal action."}
                {!["investigation","disciplinary","grievance","return","pip-review"].includes(selectedType.id)&&"Ensure you have a clear agenda and objective for this meeting. Keep notes and follow up in writing where appropriate."}
              </div>
            </div>
          )}

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

          {/* Previous meetings with this employee */}
          {prevMeetings.length>0&&(
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Previous meetings with {meetingSetup.employee}</div>
              {prevMeetings.slice(0,3).map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<Math.min(prevMeetings.length,3)-1?"1px solid #F5F1EA":"none"}}>
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
              setCaseInfo(p=>({...p,employee:meetingSetup.employee.trim(),employeeJobTitle:meetingSetup.employeeJobTitle||"",date:meetingSetup.date,manager:meetingSetup.manager||"",chairJobTitle:meetingSetup.chairJobTitle||"",notetaker:meetingSetup.notetaker||"",representative:meetingSetup.representative||"",representativeRole:meetingSetup.representativeRole||"colleague",_linkedCaseId:meetingSetup.linkedCaseId||p._linkedCaseId,_linkedCaseName:meetingSetup.linkedCaseName||p._linkedCaseName}));
              setTranscript([]);setPrepNotes("");setReviewOutput("");setReviewOutputOriginal("");setLetterOutput("");setRiskScore(null);setLiveChatHistory([]);setParticipants(meetingSetup.participants||[]);
              setScreen(SCREENS.RECORD);
            }}
            style={{width:"100%",background:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:10,padding:"14px",fontSize:15,color:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#9B9098":"#FFFFFF",fontWeight:600,cursor:(!meetingSetup.employee.trim()||!meetingSetup.type)?"not-allowed":"pointer",transition:"all 0.15s",fontFamily:"DM Sans,system-ui,sans-serif",boxShadow:(!meetingSetup.employee.trim()||!meetingSetup.type)?"none":"0 4px 16px rgba(124,92,252,0.25)"}}>
            Start meeting
          </button>
        </div>
      </div>
    </div>
  );
}
