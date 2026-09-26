import { SCREENS, MEETING_TYPES } from '../constants';
import { authedFetch } from '../lib/authedFetch';
import { signatureStatusLabel } from '../lib/eSignature';
import { getEmployeeContext, hasUnattributedRecords } from '../lib/employeeContext';

// Integrations & Workflow Automation (Phase 5, IP27, §21) — same widened
// signing_requests status vocabulary as MeetingsTab.jsx's own badge.
const SIGN_STATUS_STYLE = {
  sent: { color: "#B87520", bg: "#FEF5E7" },
  opened: { color: "#B87520", bg: "#FEF5E7" },
  signed: { color: "#1A7A4A", bg: "#E8F5EE" },
  acknowledged: { color: "#1A7A4A", bg: "#E8F5EE" },
  declined: { color: "#C84B2F", bg: "#FEF0EB" },
  expired: { color: "#6B6375", bg: "#F5F1EA" },
};

// ─────────────────────────────────────────────────────────────────────────
// Phase E0.7 — the person is a UUID.
//
// This screen used to BE a name: `const empName = activePerson` followed by
// `cases.filter(c => c.employeeName === empName)`. Everything on it — cases,
// meetings, evidence, the employee profile, the portal invite, and an AI
// "Pattern Analysis / Risk Assessment" prompt — was assembled from that one
// string comparison. Two colleagues sharing a display name shared all of it.
//
// It now composes a canonical context from employee_id. Legacy name-only records
// are NOT shown here: they are real, and they remain reachable through Cases and
// the reconciliation workbench, but Compass cannot say they are this person's, so
// presenting them on their file would be an assertion it has not earned.
//
// This is identity composition, not authorisation: every collection arrives
// already filtered by RLS on its way to this client.
// ─────────────────────────────────────────────────────────────────────────
export function PersonViewScreen({ employeeId, employeeRecords = [], wellbeingNotes = [], concernReferrals = [], dsarRequests = [], isHR = false, cases, setScreen, setMeetingSetup,
  // getEmployeeRecord is deliberately NOT a prop any more. It is the legacy
  // name lookup (findEmployeeByName), and it returns whichever record happens to
  // be first when two employees share a name. This screen resolves its employee
  // by UUID, so removing the prop makes the name lookup unavailable here rather
  // than merely unused.
  editingEmployeeRecord, setEditingEmployeeRecord, editJobTitle, setEditJobTitle, editStartDate, setEditStartDate, editLocation, setEditLocation, locations, upsertEmployeeRecord, deleteEmployeeRecord, confirmDialog, showToast, setActiveCaseId, setActiveCaseStage, getCaseStatus, fmtDate, setReviewOutput, setMeetingType, setCaseInfo, employmentProfileLoading, setEmploymentProfileLoading, employmentProfileOutput, setEmploymentProfileOutput, getCaseStage, setLetterOutput, org, user, promptDialog }) {
  const ctx = getEmployeeContext(employeeId, { employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests });
  const employee = ctx.employee;
  // The display label, resolved from the roster. Never used to select records.
  const empName = employee?.name || "";
  const empCases = ctx.cases;
  // Meetings are reached THROUGH the case, which is authoritative parentage
  // (case.employee_id). Meeting identity itself is E2; nothing here matches a
  // meeting to a person by name.
  const allMeetings = empCases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,caseId:cs.id,caseType:cs.caseType}))).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const activeCases = empCases.filter(cs=>cs.stage!=="closed");
  const closedCases = empCases.filter(cs=>cs.stage==="closed");
  const highRisk = allMeetings.some(m=>m.riskScore?.rating==="HIGH");

  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setScreen(SCREENS.PEOPLE)}
            style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>← People</button>
          <div style={{width:1,height:20,background:"#EDE5D8"}}/>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:16,fontWeight:600,color:"#7C5CFC"}}>{(empName||"?")[0].toUpperCase()}</span>
            </div>
            <div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535"}}>{empName}</div>
              <div style={{fontSize:12,color:"#9B9098"}}>{allMeetings.length} meeting{allMeetings.length!==1?"s":""} · {empCases.length} case{empCases.length!==1?"s":""}{highRisk?" · High risk":""}</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={async()=>{
            const values = await promptDialog({
              title:"Invite to employee portal",
              message:`Send ${empName} an invite to view their case status and sign documents.`,
              fields:[{key:"email", label:"Email address", type:"email", placeholder:"name@company.com", required:true}],
              confirmLabel:"Send invite",
            });
            if(!values) return;
            const email = values.email.trim();
            try {
              const res = await authedFetch('/api/portal/invite', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ orgId: org?.id, orgName: org?.name, employeeName: empName, email }),
              });
              const data = await res.json();
              if(!res.ok||data.error) { showToast(data.error||"Couldn't send invite"); return; }
              showToast(`Portal invite sent to ${email}`);
            } catch(e) { showToast("Couldn't send invite — please try again"); }
          }}
            style={{background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#6B6375",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            Invite to portal
          </button>
          <button onClick={()=>{setMeetingSetup(p=>({...p,employee:empName,employeeJobTitle:employee?.jobTitle||""}));setScreen(SCREENS.HOME+"_meeting");}}
            style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            + New meeting
          </button>
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"28px 24px"}}>

        {/* Employee details */}
        {(()=>{
          // By UUID. getEmployeeRecord(name) is the legacy name lookup and
          // returns whichever record happens to be first when a name repeats.
          const rec = employee || {};
          const editing = editingEmployeeRecord;
          const setEditing = setEditingEmployeeRecord;
          const tenure = rec.startDate?(()=>{
            const d = new Date(rec.startDate);
            const now = new Date();
            const years = now.getFullYear()-d.getFullYear();
            const months = now.getMonth()-d.getMonth();
            const total = years*12+months;
            return total>=12?Math.floor(total/12)+" year"+(Math.floor(total/12)!==1?"s":""):total+" month"+(total!==1?"s":"");
          })():null;
          return (
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:editing?14:0}}>
                <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                  {rec.jobTitle&&<div><div style={{fontSize:10,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Job title</div><div style={{fontSize:13,color:"#1C1820",fontWeight:500}}>{rec.jobTitle}</div></div>}
                  {rec.startDate&&<div><div style={{fontSize:10,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Start date</div><div style={{fontSize:13,color:"#1C1820",fontWeight:500}}>{fmtDate(rec.startDate)}{tenure?" · "+tenure+" service":""}</div></div>}
                  {rec.location&&<div><div style={{fontSize:10,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Location</div><div style={{fontSize:13,color:"#1C1820",fontWeight:500}}>{rec.location}</div></div>}
                  {!rec.jobTitle&&!rec.startDate&&!rec.location&&!editing&&<div style={{fontSize:12,color:"#9B9098"}}>No employee details on file.</div>}
                </div>
                <button onClick={()=>{if(!editing){setEditJobTitle(rec.jobTitle||"");setEditStartDate(rec.startDate||"");setEditLocation(rec.location||"");}setEditing(!editing);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,flexShrink:0}}>{editing?"Cancel":"Edit details"}</button>
              </div>
              {editing&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                    <div><label htmlFor="person-view-job-title" style={{fontSize:11,fontWeight:600,color:"#6B6375",display:"block",marginBottom:4}}>Job title</label><input id="person-view-job-title" value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} placeholder="e.g. Sales Manager" style={{width:"100%",fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}/></div>
                    <div><label htmlFor="person-view-start-date" style={{fontSize:11,fontWeight:600,color:"#6B6375",display:"block",marginBottom:4}}>Start date</label><input id="person-view-start-date" type="date" value={editStartDate} onChange={e=>setEditStartDate(e.target.value)} onClick={e=>e.currentTarget.showPicker?.()} style={{width:"100%",fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",colorScheme:"light",cursor:"pointer"}}/></div>
                    <div><label htmlFor="person-view-location" style={{fontSize:11,fontWeight:600,color:"#6B6375",display:"block",marginBottom:4}}>Location</label><select id="person-view-location" value={editLocation} onChange={e=>setEditLocation(e.target.value)} style={{width:"100%",fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif",color:editLocation?"#1C1820":"#9B9098",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}><option value="">Select…</option>{locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}<option value="__other__">Other</option></select></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{upsertEmployeeRecord(rec.id||empName,{employeeId:rec.id,jobTitle:editJobTitle,startDate:editStartDate,location:editLocation});setEditing(false);showToast("Employee record updated");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:7,padding:"7px 16px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Save</button>
                    {(rec.jobTitle||rec.startDate||rec.location)&&(
                      <button onClick={async()=>{
                        const ok = await confirmDialog({title:"Delete employee record?", message:`This removes ${empName}'s job title, start date and location. Case files and meeting records are not affected.`, confirmLabel:"Delete", danger:true});
                        if(!ok) return;
                        // Phase E0.5A.1 — deletion is by canonical id. Deleting
                        // by name would remove the wrong person once two
                        // employees in one org can share one.
                        deleteEmployeeRecord(rec.id);
                        setEditing(false);
                        showToast("Employee record deleted");
                      }} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:7,padding:"7px 16px",color:"#C84B2F",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Delete record</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Phase E0.7 — the three record types this screen never showed ──────
            Wellbeing, referrals and DSAR requests were simply absent, so a
            person's file was incomplete as well as name-keyed. They appear only
            where a canonical employee_id links them, and only for HR: these
            collections arrive already filtered by their own RLS (all three are
            HR-only at the database), and this gate keeps the UI honest about it
            rather than relying on the array happening to be empty. */}
        {isHR&&ctx.wellbeingNotes.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Wellbeing notes ({ctx.wellbeingNotes.length})</div>
            {ctx.wellbeingNotes.map(n=>(
              <div key={n.id} style={{background:"#fff",border:"1px solid #EDE5D8",borderRadius:8,padding:"10px 14px",marginBottom:6}}>
                <div style={{fontSize:13,color:"#1A1535"}}>{n.type||"Note"} · {n.date||"No date"}</div>
                {/* Content is deliberately not rendered here — this is a link to
                    the Wellbeing screen, not a second disclosure surface. */}
                <div style={{fontSize:11,color:"#6B6375",marginTop:2}}>Recorded on this note as “{n.employeeName||"(no name)"}”</div>
              </div>
            ))}
          </div>
        )}
        {isHR&&ctx.concernReferrals.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Concern referrals ({ctx.concernReferrals.length})</div>
            {ctx.concernReferrals.map(r=>(
              <div key={r.id} style={{background:"#fff",border:"1px solid #EDE5D8",borderRadius:8,padding:"10px 14px",marginBottom:6}}>
                <div style={{fontSize:13,color:"#1A1535"}}>{r.concernType||"Concern"} · {r.status||"new"}</div>
              </div>
            ))}
          </div>
        )}
        {isHR&&ctx.dsarRequests.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Subject access requests ({ctx.dsarRequests.length})</div>
            {ctx.dsarRequests.map(d=>(
              <div key={d.id} style={{background:"#fff",border:"1px solid #EDE5D8",borderRadius:8,padding:"10px 14px",marginBottom:6}}>
                <div style={{fontSize:13,color:"#1A1535"}}>Received {d.receivedDate||"—"} · due {d.dueDate||"—"} · {d.status||"open"}</div>
              </div>
            ))}
          </div>
        )}

        {/* An employee with nothing canonically attributed is VALID, not broken.
            Production is almost entirely unreconciled synthetic history, so this
            is the common state — and E1 must be able to say so plainly. */}
        {ctx.isEmpty&&(
          <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"18px 20px",marginBottom:16}}>
            <div style={{fontSize:13,color:"#1A1535",marginBottom:4}}>No recorded activity yet.</div>
            <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
              Nothing has been linked to this employee record.
              {isHR&&hasUnattributedRecords(ctx)&&" Some older records in this organisation have not yet been linked to a canonical employee — they are not shown here because Compass cannot confirm whose they are."}
            </div>
          </div>
        )}

        {/* Active cases */}
        {activeCases.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Active cases</div>
            {activeCases.map(cs=>(
              <button key={cs.id} type="button" onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s",textAlign:"left",font:"inherit",color:"inherit"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#FDFAFF";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FFFFFF";}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1535",marginBottom:3,textTransform:"capitalize"}}>{cs.caseType||"HR Case"}</div>
                  <div style={{fontSize:12,color:"#9B9098"}}>Opened {fmtDate(cs.dateReceived)} · {(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"3px 10px"}}>{getCaseStatus(cs).label}</span>
                  <span style={{color:"#C4BAB0",fontSize:16}}>›</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Full meeting history */}
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Meeting history</div>
          {allMeetings.length===0&&(
            <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:10,border:"1px solid #E8E0D0",color:"#9B9098",fontSize:13}}>
              No meetings recorded yet
            </div>
          )}
          {allMeetings.map((m,i)=>(
            <div key={i} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:(m.type||"").toLowerCase().includes("investigation")?"#EDE8FF":(m.type||"").toLowerCase().includes("disciplinary")?"#FEF0EB":(m.type||"").toLowerCase().includes("appeal")?"#FEF5E7":"#F5F1EA",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:700,color:(m.type||"").toLowerCase().includes("investigation")?"#7C5CFC":(m.type||"").toLowerCase().includes("disciplinary")?"#C84B2F":(m.type||"").toLowerCase().includes("appeal")?"#B87520":"#6B6375"}}>
                    {(m.type||"M")[0].toUpperCase()}
                  </span>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{m.type}</div>
                  <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}{m.caseType?" · "+m.caseType:""}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
                {m.signStatus&&SIGN_STATUS_STYLE[m.signStatus]&&<span style={{fontSize:10,color:SIGN_STATUS_STYLE[m.signStatus].color,background:SIGN_STATUS_STYLE[m.signStatus].bg,borderRadius:4,padding:"2px 7px",fontWeight:600}}>{signatureStatusLabel(m.signStatus)}{(m.signStatus==="sent"||m.signStatus==="opened")?" — awaiting signature":""}</span>}
                {m.record&&<button onClick={()=>{setReviewOutput(m.record);setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setCaseInfo(p=>({...p,employee:empName,date:m.date,manager:m.manager||""}));setScreen(SCREENS.REVIEW);}}
                  style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View</button>}
              </div>
            </div>
          ))}
        </div>

        {/* Employment Profile Report */}
        <div style={{marginTop:24,marginBottom:24}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid #E8E0D0",background:"linear-gradient(135deg,#EDE8FF 0%,#FDFAF5 100%)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>AI generated</div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Employment Profile</div>
                <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>A complete picture of this employee's history in Compass</div>
              </div>
              <button
                disabled={employmentProfileLoading}
                onClick={async()=>{
                  setEmploymentProfileLoading(true);
                  setEmploymentProfileOutput("");
                  try {
                    const caseHistory = empCases.map(cs=>{
                      const mtgs = (cs.meetings||[]).map(m=>{
                        const risk = m.riskScore&&m.riskScore.rating?" [Risk: "+m.riskScore.rating+"]":"";
                        const signed = m.signStatus==="signed"?" [Signed]":"";
                        return "  - "+(m.type||"Meeting")+" on "+(m.date||"Unknown")+signed+risk;
                      }).join(", ");
                      const outcome = cs.outcome||"No outcome recorded";
                      const stage = getCaseStage(cs);
                      return "Case: "+(cs.caseType||"HR Matter")+" ("+stage+") | Opened: "+(cs.dateReceived||cs.createdAt||"Unknown")+" | Outcome: "+outcome+" | Meetings: "+mtgs+(cs.investigationReport?" | Investigation report on file":"");
                    }).join(" ;; ");
                    const evidence = empCases.flatMap(cs=>(cs.evidence||[]).map(e=>e.name||e.type)).filter(Boolean).join(", ")||"None";
                    // Phase E0.7 — by UUID. Note the bigger fix is above: this
                    // prompt's Pattern Analysis and Risk Assessment are built from
                    // empCases, which was a NAME match and is now canonical. Two
                    // same-named colleagues could previously be profiled as one
                    // person, with a merged disciplinary pattern and risk rating.
                    const empRec = employee || {};
                    const tenure = empRec.startDate?(()=>{const d=new Date(empRec.startDate);const now=new Date();const months=(now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth());return months>=12?Math.floor(months/12)+" years":months+" months";})():"Unknown";
                    const prompt = "You are a senior UK HR professional. Generate a comprehensive employment profile report for: "+empName+". Job title: "+(empRec.jobTitle||"Not recorded")+". Start date: "+(empRec.startDate||"Not recorded")+". Length of service: "+tenure+". Location: "+(empRec.location||"Not recorded")+". Total cases: "+empCases.length+". Active: "+activeCases.length+". Total meetings: "+allMeetings.length+". Evidence on file: "+evidence+". Case history: "+caseHistory+". Write a professional employment profile with sections: 1) Employment Summary (include length of service, job title, location) 2) Case History Overview 3) Pattern Analysis 4) Current Position and Outstanding Matters 5) Risk Assessment 6) Recommended Next Steps. Be factual, objective, ACAS-compliant. Reference length of service where it affects statutory rights. Use professional HR language.";
                    const response = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:prompt}]})});
                    const data = await response.json();
                    const text = data.content&&data.content[0]&&data.content[0].text?data.content[0].text:"Unable to generate profile.";
                    setEmploymentProfileOutput(text);
                  } catch(e) {
                    setEmploymentProfileOutput("Error generating profile. Please try again.");
                  }
                  setEmploymentProfileLoading(false);
                }}
                style={{fontSize:13,background:employmentProfileLoading?"#B8A9F8":"#7C5CFC",border:"none",borderRadius:9,padding:"10px 18px",color:"#fff",fontWeight:600,cursor:employmentProfileLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}
              >
                {employmentProfileLoading?"Generating…":"Generate profile"}
              </button>
            </div>
            {employmentProfileLoading&&(
              <div style={{padding:"24px 20px",textAlign:"center"}}>
                <div style={{fontSize:13,color:"#9B9098",fontStyle:"italic"}}>Analysing employment history…</div>
              </div>
            )}
            {employmentProfileOutput&&!employmentProfileLoading&&(
              <div style={{padding:"20px"}}>
                <div style={{fontSize:13,color:"#1C1820",lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"DM Sans,system-ui,sans-serif"}}>{employmentProfileOutput.replace(/^## /gm,"").replace(/^# /gm,"").replace(/\*\*/g,"")}</div>
                <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #E8E0D0",display:"flex",gap:8}}>
                  <button onClick={()=>{setLetterOutput(employmentProfileOutput);setScreen(SCREENS.LETTER);}} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View as document</button>
                  <button onClick={()=>navigator.clipboard.writeText(employmentProfileOutput).then(()=>showToast("Copied to clipboard"))} style={{fontSize:12,color:"#6B6375",background:"#F5F1EA",border:"none",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Copy</button>
                  <button onClick={()=>setEmploymentProfileOutput("")} style={{fontSize:12,color:"#9B9098",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",marginLeft:"auto"}}>Clear</button>
                </div>
              </div>
            )}
            {!employmentProfileOutput&&!employmentProfileLoading&&(
              <div style={{padding:"20px",color:"#9B9098",fontSize:13,textAlign:"center"}}>
                Click Generate to create a comprehensive employment profile for {empName}. This analyses all cases, meetings, outcomes and patterns on record.
              </div>
            )}
          </div>
        </div>

        {/* Closed cases */}
        {closedCases.length>0&&(
          <div style={{marginTop:24}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Closed cases</div>
            {closedCases.map(cs=>(
              <div key={cs.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,color:"#6B6375",textTransform:"capitalize"}}>{cs.caseType||"HR Case"}</div>
                  <div style={{fontSize:11,color:"#9B9098"}}>Opened {fmtDate(cs.dateReceived)} · {(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</div>
                </div>
                <span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:20,padding:"3px 10px",fontWeight:600}}>Closed</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
