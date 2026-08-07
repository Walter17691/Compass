import { useState } from 'react';
import { Btn, Card, Badge } from '../../components/Primitives';
import { DateInput } from '../../components/DateInput';
import { CheckIcon } from '../../components/Icons';

// Shared by NewStarterScreen (onboarding) and OffboardingScreen (used to be
// two ~230-line hand-copied files that had already drifted — offboarding
// gained exit-interview/portal-access sections and a reason field that
// onboarding never got). Everything structural (list view, progress ring,
// phase nav, task rows) lives here; each flow supplies its own copy/labels
// and the handful of fields/sections it alone needs via config + render
// props, rather than the two screens re-implementing the whole layout.
export function ChecklistScreen({
  title, subtitle,
  active, setActive, view, setView, form, setForm, templates,
  createInstance, instances, aiCustomise, aiProcessing,
  toggleTask, updateTaskNote, addTask, removeTask, reassignTaskOwner,
  dateFieldKey, dateFieldLabel, dateFieldReq = true,
  createButtonLabel, createDisabled,
  addButtonLabel, allButtonLabel,
  emptyTitle, emptySubtitle, emptyButtonLabel,
  ownerColors,
  listSecondaryLine,
  sidebarLine1,
  sidebarLine2,
  renderExtraFormFields,
  renderExtraSidebar,
}) {
  const [newTaskText, setNewTaskText] = useState({});
  const phases = active
    ? [...new Set(active.tasks.map(t=>t.phaseLabel))].map(pl=>({
        label:pl,
        tasks:active.tasks.filter(t=>t.phaseLabel===pl)
      }))
    : [];
  const completedCount = active?.tasks.filter(t=>t.done).length || 0;
  const totalCount = active?.tasks.length || 0;
  const pct = totalCount ? Math.round(completedCount/totalCount*100) : 0;

  return(
    <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>{title}</h2>
          <p style={{fontSize:13,color:"#6B6880",margin:0}}>{subtitle}</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {active&&<Btn variant="ghost" onClick={()=>{setActive(null);setView("list");}}>← {allButtonLabel}</Btn>}
          {!active&&<Btn onClick={()=>setView(view==="list"?"new":"list")}>{view==="list"?addButtonLabel:"Cancel"}</Btn>}
        </div>
      </div>

      {/* Add new instance form */}
      {view==="new"&&!active&&(
        <Card style={{marginBottom:24}}>
          <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",margin:"0 0 16px",fontWeight:600}}>Details</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            {[
              {k:"name",l:"Full name",req:true,ph:"e.g. James Wilson"},
              {k:"role",l:"Job title",ph:"e.g. Marketing Executive"},
              {k:"department",l:"Department",ph:"e.g. Marketing"},
              {k:"manager",l:"Line manager",ph:"e.g. Sarah Johnson"},
              {k:"email",l:"Email",ph:"james@company.com",type:"email"},
              {k:dateFieldKey,l:dateFieldLabel,req:dateFieldReq,type:"date"},
            ].map(f=>(
              <div key={f.k}>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{f.l}{f.req&&<span style={{color:"#C84B2F"}}> *</span>}</label>
                {f.type==="date"
                  ?<DateInput value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} />
                  :<input type={f.type||"text"} placeholder={f.ph} value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />}
              </div>
            ))}
          </div>
          {renderExtraFormFields?.()}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Template</label>
            <select value={form.templateId} onChange={e=>setForm(p=>({...p,templateId:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
              {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={createInstance} disabled={createDisabled}>{createButtonLabel}</Btn>
            <Btn variant="ghost" onClick={()=>setView("list")}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* List */}
      {view==="list"&&!active&&(
        <>
          {instances.length===0&&(
            <Card style={{textAlign:"center",padding:"50px 20px"}}>
              <div style={{fontSize:32,marginBottom:12,color:"#E8E0D0"}}>—</div>
              <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>{emptyTitle}</div>
              <div style={{fontSize:12,color:"#5A5570",marginBottom:20}}>{emptySubtitle}</div>
              <Btn onClick={()=>setView("new")}>{emptyButtonLabel}</Btn>
            </Card>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
            {instances.map(s=>{
              const done = s.tasks.filter(t=>t.done).length;
              const total = s.tasks.length;
              const pct = total ? Math.round(done/total*100) : 0;
              const overdueTasks = s.tasks.filter(t=>!t.done&&t.dueDate&&new Date(t.dueDate.split("/").reverse().join("-"))<new Date());
              return(
                <button key={s.id} onClick={()=>{setActive(s);setView("instance");}}
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
                  <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>{listSecondaryLine(s)}</div>
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

      {/* Active instance */}
      {active&&(
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20,alignItems:"start"}}>
          {/* Sidebar */}
          <div style={{position:"sticky",top:90}}>
            <Card style={{marginBottom:12}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",fontWeight:600,marginBottom:4}}>{active.name}</div>
              <div style={{fontSize:12,color:"#6B6880",marginBottom:12}}>{active.role}{active.department?" · "+active.department:""}</div>
              <div style={{fontSize:11,color:"#6B6880",marginBottom:3}}>{sidebarLine1(active)}</div>
              <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>{sidebarLine2(active)}</div>
              <div style={{background:"#FDFAF5",borderRadius:4,height:6,marginBottom:6}}>
                <div style={{background:"#7C5CFC",borderRadius:4,height:6,width:pct+"%",transition:"width 0.5s"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",marginBottom:14}}>
                <span>{completedCount}/{totalCount} complete</span>
                <span style={{color:pct===100?"#7C5CFC":"#555",fontWeight:600}}>{pct}%</span>
              </div>
              <Btn onClick={()=>aiCustomise(active)} disabled={aiProcessing} style={{width:"100%",fontSize:12,padding:"9px"}}>
                {aiProcessing?"Customising...":"AI customise for role"}
              </Btn>
              {active.aiCustomised&&<div style={{fontSize:10,color:"#7C5CFC",marginTop:6,textAlign:"center"}}>AI tasks added</div>}
            </Card>

            {renderExtraSidebar?.(active)}

            {/* Phase jump nav */}
            <Card style={{marginBottom:12,padding:14}}>
              <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Jump to phase</div>
              {phases.map(phase=>{
                const phaseDone = phase.tasks.filter(t=>t.done).length;
                return (
                  <button key={phase.label} onClick={()=>document.getElementById("phase-"+phase.label.toLowerCase().replace(/\s+/g,"-"))?.scrollIntoView({behavior:"smooth",block:"start"})}
                    style={{display:"flex",justifyContent:"space-between",width:"100%",background:"none",border:"none",padding:"5px 0",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    <span style={{fontSize:12,color:"#1A1535"}}>{phase.label}</span>
                    <span style={{fontSize:11,color:phaseDone===phase.tasks.length?"#7C5CFC":"#6B6880"}}>{phaseDone}/{phase.tasks.length}</span>
                  </button>
                );
              })}
            </Card>
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
                <Card key={phase.label} id={"phase-"+phase.label.toLowerCase().replace(/\s+/g,"-")} style={{marginBottom:12,scrollMarginTop:90}}>
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
                        <button onClick={()=>toggleTask(active.id,task.id)}
                          style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:task.done?"#7C5CFC":"#E8E0D0",background:task.done?"#7C5CFC":"none",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                          {task.done&&<CheckIcon size={10} color="#fff" />}
                        </button>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:task.done?"#9B9098":"#1C1820",textDecoration:task.done?"line-through":"none",marginBottom:3}}>{task.task}</div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:ownerColor,flexShrink:0}}/>
                              <select value={task.owner} onChange={e=>reassignTaskOwner(active.id,task.id,e.target.value)}
                                style={{fontSize:10,color:"#6B6880",background:"none",border:"none",outline:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>
                                {Object.keys(ownerColors).map(o=><option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            {task.source==="ai"&&<Badge color="#7C5CFC">AI</Badge>}
                            {task.dueDate&&<span style={{fontSize:10,color:isOverdue?"#E8622A":"#444",fontFamily:"JetBrains Mono,monospace"}}>{task.dueDate}{isOverdue?" (overdue)":""}</span>}
                            {task.done&&task.doneAt&&<span style={{fontSize:10,color:"#7C5CFC"}}>Done {new Date(task.doneAt).toLocaleDateString("en-GB")}</span>}
                          </div>
                          {task.note&&<div style={{fontSize:11,color:"#6B6375",marginTop:4,fontStyle:"italic"}}>{task.note}</div>}
                        </div>
                        <input placeholder="Add note..." value={task.note||""} onChange={e=>updateTaskNote(active.id,task.id,e.target.value)}
                          style={{background:"none",border:"none",borderBottom:"1px solid #E8E0D0",color:"#6B6880",fontSize:11,outline:"none",width:140,padding:"2px 4px"}}/>
                        <button onClick={()=>removeTask(active.id,task.id)} title="Remove task"
                          style={{background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontSize:14,padding:"0 2px",flexShrink:0,marginTop:2}}>×</button>
                      </div>
                    );
                  })}
                  <div style={{display:"flex",gap:8,paddingTop:10,alignItems:"center"}}>
                    <input placeholder="+ Add task..." value={newTaskText[phase.label]||""}
                      onChange={e=>setNewTaskText(p=>({...p,[phase.label]:e.target.value}))}
                      onKeyDown={e=>{ if(e.key==="Enter"&&newTaskText[phase.label]?.trim()){ addTask(active.id,phase.label,newTaskText[phase.label]); setNewTaskText(p=>({...p,[phase.label]:""})); } }}
                      style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 10px",fontSize:12,outline:"none",color:"#1A1535"}}/>
                    <Btn variant="ghost" style={{fontSize:11,padding:"6px 12px"}} onClick={()=>{ if(newTaskText[phase.label]?.trim()){ addTask(active.id,phase.label,newTaskText[phase.label]); setNewTaskText(p=>({...p,[phase.label]:""})); } }}>Add</Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
