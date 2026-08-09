import { useState, useMemo } from 'react';
import { SCREENS } from '../constants';
import { Btn, Card, Badge } from '../components/Primitives';
import { useLoadMore } from '../hooks/useLoadMore';

const PRIORITY_COLOR = { low: "#6B6375", normal: "#7C5CFC", high: "#C84B2F" };

function isOverdue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return due < today;
}

// Cross-case Tasks — every open case_tasks row across every case the
// user can access, filterable and inline-completable, modeled on
// DsarScreen.jsx's list-plus-filter layout. The per-case Tasks panel in
// the case workspace shows the same underlying data scoped to one case.
export function TasksScreen({ caseTasks, cases, createCaseTask, toggleCaseTaskDone, deleteCaseTask, setScreen, setActiveCaseId, setActiveCaseStage, fmtDate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ caseId: "", name: "", owner: "", dueDate: "", priority: "normal" });
  const [filterOwner, setFilterOwner] = useState("");
  const [filterCaseId, setFilterCaseId] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showDone, setShowDone] = useState(false);

  const caseById = useMemo(() => Object.fromEntries(cases.map(c=>[c.id,c])), [cases]);
  const owners = useMemo(() => [...new Set(caseTasks.map(t=>t.owner).filter(Boolean))].sort(), [caseTasks]);

  const filtered = caseTasks.filter(t => {
    if(!showDone && t.status==="done") return false;
    if(filterOwner && t.owner!==filterOwner) return false;
    if(filterCaseId && t.caseId!==filterCaseId) return false;
    if(filterPriority && t.priority!==filterPriority) return false;
    return true;
  }).sort((a,b) => {
    if((a.status==="done")!==(b.status==="done")) return a.status==="done"?1:-1;
    const aOver = isOverdue(a.dueDate), bOver = isOverdue(b.dueDate);
    if(aOver!==bOver) return aOver?-1:1;
    if(!a.dueDate) return 1;
    if(!b.dueDate) return -1;
    return new Date(a.dueDate)-new Date(b.dueDate);
  });

  const { visible, hasMore, loadMore, total } = useLoadMore(filtered, 20);

  const submit = () => {
    if(!form.caseId || !form.name.trim()) return;
    createCaseTask(form.caseId, form);
    setForm({ caseId: "", name: "", owner: "", dueDate: "", priority: "normal" });
    setShowForm(false);
  };

  const openCase = (caseId) => {
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(SCREENS.CASE_VIEW);
  };

  const openTasks = caseTasks.filter(t=>t.status!=="done").length;

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",margin:0,fontWeight:400}}>Tasks</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:"2px 0 0"}}>{openTasks} open across all cases</p>
        </div>
        <Btn onClick={()=>setShowForm(s=>!s)}>{showForm?"Cancel":"+ New task"}</Btn>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"28px 24px"}}>
        {showForm&&(
          <Card style={{marginBottom:20}}>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Case</label>
              <select value={form.caseId} onChange={e=>setForm(f=>({...f,caseId:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}>
                <option value="">Select a case…</option>
                {cases.map(c=><option key={c.id} value={c.id}>{c.employeeName}{c.caseType?" — "+c.caseType:""}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Task</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Chase signed witness statement" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:16}}>
              <div style={{flex:1}}>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Owner</label>
                <input value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} placeholder="Name" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Due date</label>
                <input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Priority</label>
                <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <Btn onClick={submit} disabled={!form.caseId||!form.name.trim()}>Add task</Btn>
          </Card>
        )}

        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
          <select value={filterCaseId} onChange={e=>setFilterCaseId(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
            <option value="">All cases</option>
            {cases.map(c=><option key={c.id} value={c.id}>{c.employeeName}</option>)}
          </select>
          <select value={filterOwner} onChange={e=>setFilterOwner(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
            <option value="">All owners</option>
            {owners.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <label style={{fontSize:12,color:"#6B6375",display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginLeft:"auto"}}>
            <input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/> Show completed
          </label>
        </div>

        {total===0 && <div style={{textAlign:"center",padding:40,color:"#9B9098",fontSize:13}}>No tasks match these filters.</div>}

        {visible.map(t => {
          const cs = caseById[t.caseId];
          const overdue = t.status!=="done" && isOverdue(t.dueDate);
          return (
            <Card key={t.id} style={{marginBottom:10,padding:16}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <input type="checkbox" checked={t.status==="done"} onChange={()=>toggleCaseTaskDone(t.id)} style={{marginTop:3,cursor:"pointer"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,color:"#1A1535",textDecoration:t.status==="done"?"line-through":"none",opacity:t.status==="done"?0.6:1}}>{t.name}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
                    {cs&&<button onClick={()=>openCase(cs.id)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"DM Sans,system-ui,sans-serif"}}>{cs.employeeName}</button>}
                    {t.owner&&<span style={{fontSize:11,color:"#9B9098"}}>· {t.owner}</span>}
                    {t.dueDate&&<span style={{fontSize:11,color:overdue?"#C84B2F":"#9B9098"}}>· Due {fmtDate(t.dueDate)}{overdue?" (overdue)":""}</span>}
                  </div>
                </div>
                <Badge color={PRIORITY_COLOR[t.priority]||PRIORITY_COLOR.normal}>{(t.priority||"normal").toUpperCase()}</Badge>
                <button onClick={()=>deleteCaseTask(t.id)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
              </div>
            </Card>
          );
        })}

        {hasMore && (
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,cursor:"pointer",fontSize:13,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            Load more ({total-visible.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
