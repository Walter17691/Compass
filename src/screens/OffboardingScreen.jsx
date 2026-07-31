import { Btn, Card, Badge } from '../components/Primitives';
import { DateInput } from '../components/DateInput';

const REASON_LABELS = {
  resignation: "Resignation",
  redundancy: "Redundancy",
  dismissal: "Dismissal",
  retirement: "Retirement",
  end_of_contract: "End of fixed-term contract",
  other: "Other",
};

export function OffboardingScreen({ activeLeaver, setActiveLeaver, leaverView, setLeaverView, newLeaverForm, setNewLeaverForm, leaverTemplates, createLeaverInstance, leaverInstances, aiCustomiseLeaverChecklist, leaverAiProcessing, toggleLeaverTask, updateLeaverTaskNote, updateLeaverExitInterview, portalAccounts, revokePortalAccess }) {
  const hasPortalAccess = activeLeaver && (portalAccounts||[]).some(a=>a.employee_name===activeLeaver.name);
  const phases = activeLeaver
    ? [...new Set(activeLeaver.tasks.map(t=>t.phaseLabel))].map(pl=>({
        label:pl,
        tasks:activeLeaver.tasks.filter(t=>t.phaseLabel===pl)
      }))
    : [];
  const completedCount = activeLeaver?.tasks.filter(t=>t.done).length || 0;
  const totalCount = activeLeaver?.tasks.length || 0;
  const pct = totalCount ? Math.round(completedCount/totalCount*100) : 0;
  const ownerColors = {"HR":"#7C5CFC","Line Manager":"#D4882A","IT":"#4A6FA5","Facilities":"#4A7C6F","Payroll":"#7A5C4A"};

  return(
    <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Employee offboarding</h2>
          <p style={{fontSize:13,color:"#6B6880",margin:0}}>AI-guided leaver checklists. Track access revocation, handover, final pay and exit interviews.</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {activeLeaver&&<Btn variant="ghost" onClick={()=>{setActiveLeaver(null);setLeaverView("list");}}>← All leavers</Btn>}
          {!activeLeaver&&<Btn onClick={()=>setLeaverView(leaverView==="list"?"new":"list")}>{leaverView==="list"?"+ Add leaver":"Cancel"}</Btn>}
        </div>
      </div>

      {/* Add new leaver form */}
      {leaverView==="new"&&!activeLeaver&&(
        <Card style={{marginBottom:24}}>
          <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",margin:"0 0 16px",fontWeight:600}}>Leaver details</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            {[
              {k:"name",l:"Full name",req:true,ph:"e.g. James Wilson"},
              {k:"role",l:"Job title",ph:"e.g. Marketing Executive"},
              {k:"department",l:"Department",ph:"e.g. Marketing"},
              {k:"manager",l:"Line manager",ph:"e.g. Sarah Johnson"},
              {k:"email",l:"Email",ph:"james@company.com",type:"email"},
              {k:"lastWorkingDay",l:"Last working day",req:true,type:"date"},
            ].map(f=>(
              <div key={f.k}>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{f.l}{f.req&&<span style={{color:"#C84B2F"}}> *</span>}</label>
                {f.type==="date"
                  ?<DateInput value={newLeaverForm[f.k]||""} onChange={e=>setNewLeaverForm(p=>({...p,[f.k]:e.target.value}))} />
                  :<input type={f.type||"text"} placeholder={f.ph} value={newLeaverForm[f.k]||""} onChange={e=>setNewLeaverForm(p=>({...p,[f.k]:e.target.value}))}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />}
              </div>
            ))}
          </div>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Reason for leaving</label>
            <select value={newLeaverForm.reason} onChange={e=>setNewLeaverForm(p=>({...p,reason:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
              {Object.entries(REASON_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Offboarding template</label>
            <select value={newLeaverForm.templateId} onChange={e=>setNewLeaverForm(p=>({...p,templateId:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
              {leaverTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={createLeaverInstance} disabled={!newLeaverForm.name||!newLeaverForm.lastWorkingDay}>Create offboarding checklist</Btn>
            <Btn variant="ghost" onClick={()=>setLeaverView("list")}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* Leaver list */}
      {leaverView==="list"&&!activeLeaver&&(
        <>
          {leaverInstances.length===0&&(
            <Card style={{textAlign:"center",padding:"50px 20px"}}>
              <div style={{fontSize:32,marginBottom:12,color:"#E8E0D0"}}>—</div>
              <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>No leavers yet</div>
              <div style={{fontSize:12,color:"#5A5570",marginBottom:20}}>Create an offboarding checklist when someone hands in their notice.</div>
              <Btn onClick={()=>setLeaverView("new")}>+ Add first leaver</Btn>
            </Card>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
            {leaverInstances.map(s=>{
              const done = s.tasks.filter(t=>t.done).length;
              const total = s.tasks.length;
              const pct = total ? Math.round(done/total*100) : 0;
              const overdueTasks = s.tasks.filter(t=>!t.done&&t.dueDate&&new Date(t.dueDate.split("/").reverse().join("-"))<new Date());
              return(
                <button key={s.id} onClick={()=>{setActiveLeaver(s);setLeaverView("instance");}}
                  style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"18px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",fontWeight:600,marginBottom:2}}>{s.name}</div>
                      <div style={{fontSize:11,color:"#6B6880"}}>{s.role}{s.department?" · "+s.department:""}</div>
                    </div>
                    {overdueTasks.length>0&&<Badge color="#E8622A">{overdueTasks.length} overdue</Badge>}
                  </div>
                  <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>
                    Last day: {new Date(s.lastWorkingDay).toLocaleDateString("en-GB")} · {REASON_LABELS[s.reason]||"Not specified"}
                  </div>
                  <div style={{background:"#FDFAF5",borderRadius:4,height:4,marginBottom:6}}>
                    <div style={{background:"#7C5CFC",borderRadius:4,height:4,width:pct+"%",transition:"width 0.3s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880"}}>
                    <span>{done}/{total} tasks complete</span>
                    <span style={{color:pct===100?"#7C5CFC":"#555"}}>{pct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Active leaver checklist */}
      {activeLeaver&&(
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20,alignItems:"start"}}>
          {/* Sidebar */}
          <div>
            <Card style={{marginBottom:12}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",fontWeight:600,marginBottom:4}}>{activeLeaver.name}</div>
              <div style={{fontSize:12,color:"#6B6880",marginBottom:12}}>{activeLeaver.role}{activeLeaver.department?" · "+activeLeaver.department:""}</div>
              <div style={{fontSize:11,color:"#6B6880",marginBottom:3}}>Last working day: {new Date(activeLeaver.lastWorkingDay).toLocaleDateString("en-GB")}</div>
              <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>Reason: {REASON_LABELS[activeLeaver.reason]||"Not specified"}</div>
              <div style={{background:"#FDFAF5",borderRadius:4,height:6,marginBottom:6}}>
                <div style={{background:"#7C5CFC",borderRadius:4,height:6,width:pct+"%",transition:"width 0.5s"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",marginBottom:14}}>
                <span>{completedCount}/{totalCount} complete</span>
                <span style={{color:pct===100?"#7C5CFC":"#555",fontWeight:600}}>{pct}%</span>
              </div>
              <Btn onClick={()=>aiCustomiseLeaverChecklist(activeLeaver)} disabled={leaverAiProcessing} style={{width:"100%",fontSize:12,padding:"9px"}}>
                {leaverAiProcessing?"Customising...":"AI customise for role"}
              </Btn>
              {activeLeaver.aiCustomised&&<div style={{fontSize:10,color:"#7C5CFC",marginTop:6,textAlign:"center"}}>AI tasks added</div>}
            </Card>

            {/* Exit interview */}
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Exit interview</div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Date</label>
              <DateInput value={activeLeaver.exitInterviewDate||""} onChange={e=>updateLeaverExitInterview(activeLeaver.id,{exitInterviewDate:e.target.value})} />
              <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",margin:"12px 0 5px"}}>Notes</label>
              <textarea placeholder="What did they say? Reasons for leaving, feedback, anything to follow up on..."
                value={activeLeaver.exitInterviewNotes||""}
                onChange={e=>updateLeaverExitInterview(activeLeaver.id,{exitInterviewNotes:e.target.value})}
                rows={5}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535",boxSizing:"border-box"}} ></textarea>
            </Card>

            {/* Employee Portal access */}
            {hasPortalAccess&&(
              <Card style={{marginBottom:12}}>
                <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Employee Portal</div>
                <div style={{fontSize:12,color:"#6B6880",marginBottom:10,lineHeight:1.6}}>{activeLeaver.name} still has active Portal access — they can view their case status and documents.</div>
                <Btn variant="danger" onClick={()=>revokePortalAccess(activeLeaver.name)} style={{width:"100%",fontSize:12,padding:"9px"}}>Revoke portal access</Btn>
              </Card>
            )}

            {/* Owner legend */}
            <Card style={{background:"#F5F1EA",padding:14}}>
              <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Task owners</div>
              {Object.entries(ownerColors).map(([owner,color])=>(
                <div key={owner} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#6B6880"}}>{owner}</span>
                </div>
              ))}
            </Card>
          </div>

          {/* Task phases */}
          <div>
            {phases.map(phase=>{
              const phaseDone = phase.tasks.filter(t=>t.done).length;
              const phaseOverdue = phase.tasks.filter(t=>!t.done&&t.dueDate&&new Date(t.dueDate.split("/").reverse().join("-"))<new Date());
              return(
                <Card key={phase.label} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1A1535",fontWeight:600}}>{phase.label}</span>
                      {phaseOverdue.length>0&&<Badge color="#E8622A">{phaseOverdue.length} overdue</Badge>}
                    </div>
                    <span style={{fontSize:11,color:"#6B6880"}}>{phaseDone}/{phase.tasks.length}</span>
                  </div>
                  {phase.tasks.map(task=>{
                    const ownerColor = ownerColors[task.owner]||"#555";
                    const isOverdue = !task.done&&task.dueDate&&new Date(task.dueDate.split("/").reverse().join("-"))<new Date();
                    return(
                      <div key={task.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
                        <button onClick={()=>toggleLeaverTask(activeLeaver.id,task.id)}
                          style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:task.done?"#7C5CFC":"#E8E0D0",background:task.done?"#7C5CFC":"none",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                          {task.done&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
                        </button>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:task.done?"#9B9098":"#1C1820",textDecoration:task.done?"line-through":"none",marginBottom:3}}>{task.task}</div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:ownerColor}}/>
                              <span style={{fontSize:10,color:"#6B6880"}}>{task.owner}</span>
                            </div>
                            {task.dueDate&&<span style={{fontSize:10,color:isOverdue?"#E8622A":"#444",fontFamily:"JetBrains Mono,monospace"}}>{task.dueDate}{isOverdue?" (overdue)":""}</span>}
                            {task.done&&task.doneAt&&<span style={{fontSize:10,color:"#7C5CFC"}}>Done {new Date(task.doneAt).toLocaleDateString("en-GB")}</span>}
                          </div>
                          {task.note&&<div style={{fontSize:11,color:"#6B6375",marginTop:4,fontStyle:"italic"}}>{task.note}</div>}
                        </div>
                        <input placeholder="Add note..." value={task.note||""} onChange={e=>updateLeaverTaskNote(activeLeaver.id,task.id,e.target.value)}
                          style={{background:"none",border:"none",borderBottom:"1px solid #E8E0D0",color:"#6B6880",fontSize:11,outline:"none",width:140,padding:"2px 4px"}}/>
                      </div>
                    );
                  })}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
