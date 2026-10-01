import { useState } from 'react';

const PRIORITY_COLOR = { low: "#4A4E63", normal: "#7A2FD8", high: "#C84B2F" };

// Per-case view over the same case_tasks rows the cross-case Tasks
// screen (src/screens/TasksScreen.jsx) lists — same data, scoped to one
// case, so a task added here shows up there immediately and vice versa.
export function CaseTasksPanel({ cs, tasks, createCaseTask, toggleCaseTaskDone, deleteCaseTask, fmtDate, isHR, onGeneratePlan, planLoading }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", owner: "", dueDate: "", priority: "normal" });

  const submit = () => {
    if(!form.name.trim()) return;
    createCaseTask(cs.id, form);
    setForm({ name: "", owner: "", dueDate: "", priority: "normal" });
    setShowNew(false);
  };

  const sorted = [...tasks].sort((a,b) => {
    if((a.status==="done")!==(b.status==="done")) return a.status==="done"?1:-1;
    if(!a.dueDate) return 1;
    if(!b.dueDate) return -1;
    return new Date(a.dueDate)-new Date(b.dueDate);
  });

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7A2FD8",letterSpacing:"0.5px",textTransform:"uppercase"}}>Tasks ({tasks.filter(t=>t.status!=="done").length} open)</div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          {/* Manager Enablement (Phase 4, MP8, §9) — case-specific plan,
              distinct from the fixed generic checklist assignInvestigator
              already seeds; reachable from HR here, and from the
              investigator's own restricted view (InvestigatorChecklistView). */}
          {isHR&&onGeneratePlan&&(
            <button onClick={onGeneratePlan} disabled={planLoading} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#7A2FD8",cursor:planLoading?"default":"pointer",fontFamily:"DM Sans,system-ui,sans-serif",opacity:planLoading?0.6:1}}>{planLoading?"Compass is drafting a plan…":"Generate investigation plan"}</button>
          )}
          <button onClick={()=>setShowNew(v=>!v)} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{showNew?"Cancel":"+ Add task"}</button>
        </div>
      </div>
      <div style={{padding:"16px"}}>
        {showNew && (
          <div style={{background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:8,padding:14,marginBottom:tasks.length>0?14:0}}>
            <div style={{marginBottom:10}}>
              <input aria-label="Task" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Task" style={{width:"100%",fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"8px 10px",color:"#0F1224",boxSizing:"border-box",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input aria-label="Owner" value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} placeholder="Owner" style={{flex:1,fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"8px 10px",color:"#0F1224",boxSizing:"border-box",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
              <input aria-label="Due date" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{flex:1,fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"8px 10px",color:"#0F1224",boxSizing:"border-box",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
              <select aria-label="Priority" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"8px 10px",color:"#0F1224"}}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <button onClick={submit} disabled={!form.name.trim()} style={{fontSize:12,background:"#7A2FD8",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",fontWeight:600,cursor:form.name.trim()?"pointer":"not-allowed",opacity:form.name.trim()?1:0.5,fontFamily:"DM Sans,system-ui,sans-serif"}}>Add task</button>
          </div>
        )}
        {tasks.length===0 && !showNew && <div style={{fontSize:13,color:"#8A8EA3"}}>No tasks yet.</div>}
        {sorted.map(t => (
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #F0F1F7"}}>
            <input aria-label={`Mark "${t.name}" done`} type="checkbox" checked={t.status==="done"} onChange={()=>toggleCaseTaskDone(t.id)} style={{cursor:"pointer"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:"#0F1224",textDecoration:t.status==="done"?"line-through":"none",opacity:t.status==="done"?0.6:1}}>
                {t.name}
                {t.source==="investigation_plan"&&<span style={{fontSize:9,fontWeight:700,color:"#7A2FD8",background:"#F3EDFD",borderRadius:4,padding:"1px 6px",marginLeft:8,textTransform:"uppercase",letterSpacing:"0.3px"}}>Plan</span>}
              </div>
              <div style={{fontSize:11,color:"#8A8EA3",marginTop:1}}>{t.owner||"Unassigned"}{t.dueDate?" · Due "+fmtDate(t.dueDate):""}</div>
            </div>
            <span style={{fontSize:9,fontWeight:700,color:PRIORITY_COLOR[t.priority]||PRIORITY_COLOR.normal,textTransform:"uppercase"}}>{t.priority}</span>
            <button onClick={()=>deleteCaseTask(t.id)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
