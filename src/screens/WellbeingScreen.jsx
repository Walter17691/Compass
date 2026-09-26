import { WELLBEING_RESOURCES, WELLBEING_TYPES } from '../constants';
import { DateInput } from '../components/DateInput';
import { Btn, Card, Badge } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { PageHeader } from '../components/design/PageHeader';
import { EmployeeSelect } from '../components/EmployeeSelect';

export function WellbeingScreen({ employeeRecords = [], isHR = false, onRequestCreateEmployee, wellbeingNotes, activeWellbeing, wellbeingView, setActiveWellbeing, setWellbeingView, toggleFollowUpDone, wellbeingForm, setWellbeingForm, addWellbeingNote }) {
  const typeColors = {"chat":"#7C5CFC","eap":"#4A7C6F","adjustment":"#5E627A","crisis":"#E8622A","return":"#D4882A","checkin":"#888"};
  // ── Phase E0.7 — people come from CANONICAL IDENTITY, not from names ──────
  //
  // This built its list of "employees" as `new Set(notes.map(n => n.employeeName))`
  // and then matched notes back by that string. Two colleagues sharing a display
  // name shared one wellbeing file — the single most sensitive record type in the
  // product, routinely touching health and disability.
  //
  // The write side has captured a canonical uuid since E0.6; the read side threw
  // it away. It no longer does. Notes with no employee_id are LEGACY: they are
  // listed separately and never attached to anyone by name, because a wrong
  // attribution here discloses one person's health information to a colleague's
  // file. Access is unchanged — this table is HR-only and stays that way.
  const attributed = wellbeingNotes.filter(n => n && n.employeeId);
  const legacyNotes = wellbeingNotes.filter(n => n && !n.employeeId);
  const allEmployees = [...new Map(
    attributed.map(n => [n.employeeId, {
      id: n.employeeId,
      // The label comes from the roster where we have it, so a renamed employee
      // reads correctly; the note's own stored name is the point-in-time
      // snapshot and is shown on the note itself.
      name: (employeeRecords.find(e => e && e.id === n.employeeId)?.name) || n.employeeName || "(unnamed)",
    }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));
  // activeWellbeing is now an employee UUID, never a name.
  const employeeNotes = activeWellbeing
    ? attributed.filter(n => n.employeeId === activeWellbeing).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    : [];
  const activeEmployeeLabel = allEmployees.find(e => e.id === activeWellbeing)?.name || "";
  const overdueFollowUps = wellbeingNotes.filter(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());

  return(
    <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
      {/* Design System Convergence pass, Phase 2 — was a purple serif h2. */}
      <PageHeader title="Mental health & wellbeing" subtitle="Confidential wellbeing case notes. Completely separate from disciplinary and performance records."
        actions={<>
          {activeWellbeing&&<Btn variant="ghost" onClick={()=>{setActiveWellbeing(null);setWellbeingView("list");}}>← All employees</Btn>}
          <Btn onClick={()=>setWellbeingView(wellbeingView==="new"?"list":"new")}>{wellbeingView==="new"?"Cancel":"+ Add note"}</Btn>
        </>}/>

      {/* Confidentiality notice */}
      <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:"#7C5CFC",flexShrink:0}}/>
        <div style={{fontSize:11,color:"#6B6880",lineHeight:1.5}}>These notes are confidential and are not linked to any disciplinary, performance, or ER case file. Access should be restricted to HR only. Notes may be relevant to reasonable adjustment obligations under the Equality Act 2010.</div>
      </div>

      {/* Overdue follow-ups */}
      {overdueFollowUps.length>0&&(
        <div style={{background:"#FEF5E7",border:"1px solid #D4882A33",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:11,color:"#B87520",fontWeight:600,marginBottom:8}}>Overdue follow-ups ({overdueFollowUps.length})</div>
          {overdueFollowUps.map(n=>(
            <div key={n.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
              <span style={{fontSize:12,color:"#3D3560"}}>{n.employeeName} — {n.followUpDate}</span>
              <button onClick={()=>toggleFollowUpDone(n.id)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>Mark done</button>
            </div>
          ))}
        </div>
      )}

      {/* Add note form */}
      {wellbeingView==="new"&&(
        <Card style={{marginBottom:20}}>
          <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 16px",fontWeight:600}}>Add wellbeing note</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div>
              {/* Phase E0.6 — was a free-text name. A wellbeing note is the most
                  sensitive employee-owned record in the product, and it used to
                  be filed against whatever string somebody typed. The canonical
                  employee is now chosen from the roster; the name still travels
                  with the note as its display snapshot. */}
              <EmployeeSelect
                inputId="wellbeing-employee-name"
                label="Employee *"
                employeeRecords={employeeRecords}
                value={wellbeingForm.employeeId || null}
                canCreateEmployee={isHR}
                onRequestCreate={onRequestCreateEmployee}
                onChange={(id, employee)=>setWellbeingForm(p=>({...p, employeeId:id, employeeName:employee?.name||""}))}
              />
            </div>
            <div>
              <label htmlFor="wellbeing-type" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Note type</label>
              <select id="wellbeing-type" value={wellbeingForm.type} onChange={e=>setWellbeingForm(p=>({...p,type:e.target.value}))}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
                {Object.entries(WELLBEING_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="wellbeing-date" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Date</label>
              <DateInput id="wellbeing-date" value={wellbeingForm.date} onChange={e=>setWellbeingForm(p=>({...p,date:e.target.value}))} />
            </div>
            <div>
              <label htmlFor="wellbeing-manager" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>HR manager</label>
              <input id="wellbeing-manager" placeholder="Your name" value={wellbeingForm.manager} onChange={e=>setWellbeingForm(p=>({...p,manager:e.target.value}))}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label htmlFor="wellbeing-content" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Conversation notes *</label>
            <textarea id="wellbeing-content" placeholder="What was discussed? What did the employee share? What was observed? How did they seem?" value={wellbeingForm.content} onChange={e=>setWellbeingForm(p=>({...p,content:e.target.value}))}
              rows={5}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div>
              <label htmlFor="wellbeing-support-offered" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Support offered</label>
              <input id="wellbeing-support-offered" placeholder="e.g. EAP referral, flexible working, OH referral" value={wellbeingForm.supportOffered} onChange={e=>setWellbeingForm(p=>({...p,supportOffered:e.target.value}))}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
            </div>
            <div>
              <label htmlFor="wellbeing-follow-up-date" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Follow-up date</label>
              <DateInput id="wellbeing-follow-up-date" value={wellbeingForm.followUpDate} onChange={e=>setWellbeingForm(p=>({...p,followUpDate:e.target.value}))} />
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={addWellbeingNote} disabled={!wellbeingForm.employeeName.trim()||!wellbeingForm.content.trim()}>Save note</Btn>
            <Btn variant="ghost" onClick={()=>setWellbeingView("list")}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:20,alignItems:"start"}}>
        {/* Employee list */}
        <div>
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Employees ({allEmployees.length})</div>
            {allEmployees.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No wellbeing notes yet</div>}
            {allEmployees.map(emp=>{
              const empNotes = attributed.filter(n=>n.employeeId===emp.id);
              const hasOverdue = empNotes.some(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());
              return(
                <button key={emp.id} onClick={()=>{setActiveWellbeing(emp.id);setWellbeingView("employee");}}
                  style={{width:"100%",background:activeWellbeing===emp.id?"#7C5CFC18":"none",border:"1px solid",borderColor:activeWellbeing===emp.id?"#7C5CFC33":"transparent",borderRadius:7,padding:"10px 12px",marginBottom:4,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,color:"#1A1535",fontWeight:activeWellbeing===emp.id?600:400}}>{emp.name}</div>
                    <div style={{fontSize:10,color:"#6B6880",marginTop:2}}>{empNotes.length} note{empNotes.length!==1?"s":""}</div>
                  </div>
                  {hasOverdue&&<div role="img" aria-label="Has an overdue follow-up" title="Has an overdue follow-up" style={{width:7,height:7,borderRadius:"50%",background:"#D4882A"}}/>}
                </button>
              );
            })}
          </Card>

          {/* Resources */}
          <Card style={{background:"#F5F1EA"}}>
            <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Crisis resources</div>
            {WELLBEING_RESOURCES.map(r=>(
              <div key={r.name} style={{padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                <div style={{fontSize:12,color:"#1A1535",fontWeight:500}}>{r.name}</div>
                <div style={{fontSize:11,color:"#7C5CFC",marginTop:1}}>{r.contact}</div>
                <div style={{fontSize:10,color:"#5A5570",marginTop:1}}>{r.note}</div>
              </div>
            ))}
          </Card>
        </div>

        {/* Notes view */}
        <div>
          {!activeWellbeing&&wellbeingView!=="new"&&(
            <>
              <Card style={{textAlign:"center",padding:"40px 20px",background:"#F5F1EA"}}>
                <div style={{fontSize:14,color:"#6B6880",marginBottom:8}}>Select an employee to view their wellbeing history</div>
                <div style={{fontSize:12,color:"#5A5570"}}>Or click "+ Add note" to log a new wellbeing conversation</div>
              </Card>
              {/* Phase E0.7 — legacy notes are disclosed, not hidden and not
                  attached. They are real records HR can still reach; what Compass
                  cannot say is WHOSE they are, so they are counted rather than
                  filed under a name that might belong to someone else. */}
              {legacyNotes.length>0&&(
                <Card style={{marginTop:12,background:"#FDFAF5"}}>
                  <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
                    <strong>{legacyNotes.length} older note{legacyNotes.length===1?"":"s"} {legacyNotes.length===1?"is":"are"} not linked to an employee record.</strong>{" "}
                    {legacyNotes.length===1?"It was":"They were"} recorded against a name only, so {legacyNotes.length===1?"it is":"they are"} not
                    shown under any employee — attaching {legacyNotes.length===1?"it":"them"} by name could file one person's
                    wellbeing history against a colleague.
                  </div>
                </Card>
              )}
            </>
          )}

          {activeWellbeing&&employeeNotes.length>0&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                {/* The heading renders the LABEL; activeWellbeing is a uuid. */}
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",fontWeight:600}}>{activeEmployeeLabel}</div>
                {/* Prefills BOTH the canonical id and its label, so adding a note
                    from an employee's own page cannot produce a name-only note. */}
                <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeId:activeWellbeing,employeeName:activeEmployeeLabel}));setWellbeingView("new");}} style={{padding:"6px 14px",fontSize:12}}>+ Add note</Btn>
              </div>
              {employeeNotes.map(note=>{
                const typeColor = typeColors[note.type]||"#7C5CFC";
                const typeInfo = WELLBEING_TYPES[note.type];
                const isOverdue = !note.followUpDone&&note.followUpDate&&new Date(note.followUpDate.split("/").reverse().join("-"))<new Date();
                return(
                  <Card key={note.id} style={{marginBottom:12,borderLeft:`3px solid ${typeColor}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <Badge color={typeColor}>{typeInfo?.label||note.type}</Badge>
                        <span style={{fontSize:11,color:"#6B6880"}}>{note.date}</span>
                        {note.manager&&<span style={{fontSize:11,color:"#5A5570"}}>{note.manager}</span>}
                      </div>
                      {note.confidential&&<span style={{fontSize:9,color:"#6B6880",border:"1px solid #E8E0D0",borderRadius:3,padding:"1px 6px",letterSpacing:0.5}}>CONFIDENTIAL</span>}
                    </div>
                    <div style={{fontSize:13,color:"#3D3560",lineHeight:1.7,marginBottom:10,whiteSpace:"pre-wrap"}}><MDRenderer text={note.content}/></div>
                    {note.supportOffered&&(
                      <div style={{fontSize:11,color:"#6B6880",marginBottom:8}}>
                        <span style={{color:"#6B6375",fontWeight:600}}>Support offered: </span>{note.supportOffered}
                      </div>
                    )}
                    {note.followUpDate&&(
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#FDFAF5",borderRadius:6,padding:"8px 12px"}}>
                        <div>
                          <span style={{fontSize:11,color:isOverdue?"#D4882A":"#555"}}>Follow-up: {note.followUpDate}</span>
                          {isOverdue&&<span style={{fontSize:10,color:"#B87520",marginLeft:8}}>overdue</span>}
                        </div>
                        <button onClick={()=>toggleFollowUpDone(note.id)}
                          style={{background:note.followUpDone?"#7C5CFC22":"none",border:"1px solid",borderColor:note.followUpDone?"#7C5CFC":"#E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:note.followUpDone?"#A98FFF":"#666",cursor:"pointer"}}>
                          {note.followUpDone?"Done":"Mark done"}
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {activeWellbeing&&employeeNotes.length===0&&(
            <Card style={{textAlign:"center",padding:"32px",background:"#F5F1EA"}}>
              <div style={{fontSize:13,color:"#6B6880",marginBottom:12}}>No notes yet for {activeEmployeeLabel}</div>
              <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeName:activeWellbeing}));setWellbeingView("new");}}>Add first note</Btn>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
