import { WELLBEING_RESOURCES, WELLBEING_TYPES } from '../constants';
import { DateInput } from '../components/DateInput';
import { Btn, Card, Badge } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { PageHeader } from '../components/design/PageHeader';

export function WellbeingScreen({ wellbeingNotes, activeWellbeing, wellbeingView, setActiveWellbeing, setWellbeingView, toggleFollowUpDone, wellbeingForm, setWellbeingForm, addWellbeingNote }) {
  const typeColors = {"chat":"#7C5CFC","eap":"#4A7C6F","adjustment":"#5E627A","crisis":"#E8622A","return":"#D4882A","checkin":"#888"};
  const allEmployees = [...new Set(wellbeingNotes.map(n=>n.employeeName))];
  const employeeNotes = activeWellbeing ? wellbeingNotes.filter(n=>n.employeeName===activeWellbeing).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)) : [];
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
              <label htmlFor="wellbeing-employee-name" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Employee name *</label>
              <input id="wellbeing-employee-name" placeholder="e.g. James Wilson" value={wellbeingForm.employeeName} onChange={e=>setWellbeingForm(p=>({...p,employeeName:e.target.value}))}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
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
              const empNotes = wellbeingNotes.filter(n=>n.employeeName===emp);
              const hasOverdue = empNotes.some(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());
              return(
                <button key={emp} onClick={()=>{setActiveWellbeing(emp);setWellbeingView("employee");}}
                  style={{width:"100%",background:activeWellbeing===emp?"#7C5CFC18":"none",border:"1px solid",borderColor:activeWellbeing===emp?"#7C5CFC33":"transparent",borderRadius:7,padding:"10px 12px",marginBottom:4,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,color:"#1A1535",fontWeight:activeWellbeing===emp?600:400}}>{emp}</div>
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
            <Card style={{textAlign:"center",padding:"40px 20px",background:"#F5F1EA"}}>
              <div style={{fontSize:14,color:"#6B6880",marginBottom:8}}>Select an employee to view their wellbeing history</div>
              <div style={{fontSize:12,color:"#5A5570"}}>Or click "+ Add note" to log a new wellbeing conversation</div>
            </Card>
          )}

          {activeWellbeing&&employeeNotes.length>0&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",fontWeight:600}}>{activeWellbeing}</div>
                <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeName:activeWellbeing}));setWellbeingView("new");}} style={{padding:"6px 14px",fontSize:12}}>+ Add note</Btn>
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
              <div style={{fontSize:13,color:"#6B6880",marginBottom:12}}>No notes yet for {activeWellbeing}</div>
              <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeName:activeWellbeing}));setWellbeingView("new");}}>Add first note</Btn>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
