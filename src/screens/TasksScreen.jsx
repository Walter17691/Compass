import { useState, useMemo, useEffect } from 'react';
import { SCREENS } from '../constants';
import { Btn, Card, Badge } from '../components/Primitives';
import { useLoadMore } from '../hooks/useLoadMore';
import { PageHeader } from '../components/design/PageHeader';
import { DataRow, RowPrimary, RowSecondary } from '../components/design/DataRow';
import { COLOR, FONT, RADIUS, CONTENT_MAX_WIDTH } from '../styles/tokens';

const PRIORITY_COLOR = { low: COLOR.inkSoft, normal: COLOR.purple, high: COLOR.red };

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
export function TasksScreen({ caseTasks, cases, createCaseTask, toggleCaseTaskDone, deleteCaseTask, setScreen, setActiveCaseId, setActiveCaseStage, fmtDate, autoOpenForm, clearAutoOpenForm }) {
  // IA & User Journey pass, §7 — same autoOpenForm/clearAutoOpenForm shape
  // ConcernsScreen already uses for the universal Create menu's "Raise a
  // concern" action; lets "New task" jump straight to this screen with
  // the form already open instead of requiring a second click here.
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  useEffect(() => () => clearAutoOpenForm?.(), []);
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
    // Both-undated must return 0, not 1 — returning 1 unconditionally
    // whenever a has no due date (regardless of b) made this comparator
    // inconsistent for two undated tasks (comparator(a,b) and
    // comparator(b,a) both evaluated to 1), which left their relative
    // order effectively undefined once there were enough of them for the
    // sort algorithm's internal merging to become order-sensitive.
    if(!a.dueDate && !b.dueDate) return 0;
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
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans}}>
      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 32px 0"}}>
        {/* Design System Convergence pass, Phase 2 — was a bespoke serif
            h2 + p pair with its own bordered header strip, one of eight
            screens each inventing a slightly different title treatment
            (some purple, some ink; 18–28px). PageHeader is the same
            plain-title component Cases/People/Insights/Settings already
            use — Tasks is an operational register like those, not an
            editorial moment, so it gets the same non-serif, non-purple
            treatment they do. */}
        <PageHeader title="Tasks" subtitle={`${openTasks} open across all cases`}
          actions={<Btn onClick={()=>setShowForm(s=>!s)}>{showForm?"Cancel":"+ New task"}</Btn>}/>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"0 24px 28px"}}>
        {showForm&&(
          <Card style={{marginBottom:20}}>
            <div style={{marginBottom:12}}>
              <label htmlFor="new-task-case" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Case</label>
              <select id="new-task-case" value={form.caseId} onChange={e=>setForm(f=>({...f,caseId:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}>
                <option value="">Select a case…</option>
                {cases.map(c=><option key={c.id} value={c.id}>{c.employeeName}{c.caseType?" — "+c.caseType:""}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <label htmlFor="new-task-name" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Task</label>
              <input id="new-task-name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Chase signed witness statement" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:16}}>
              <div style={{flex:1}}>
                <label htmlFor="new-task-owner" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Owner</label>
                <input id="new-task-owner" value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} placeholder="Name" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              </div>
              <div style={{flex:1}}>
                <label htmlFor="new-task-due-date" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Due date</label>
                <input id="new-task-due-date" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              </div>
              <div style={{flex:1}}>
                <label htmlFor="new-task-priority" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Priority</label>
                <select id="new-task-priority" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}>
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
          <select aria-label="Filter by case" value={filterCaseId} onChange={e=>setFilterCaseId(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
            <option value="">All cases</option>
            {cases.map(c=><option key={c.id} value={c.id}>{c.employeeName}</option>)}
          </select>
          <select aria-label="Filter by owner" value={filterOwner} onChange={e=>setFilterOwner(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
            <option value="">All owners</option>
            {owners.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
          <select aria-label="Filter by priority" value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
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

        {/* Design System Convergence pass, Phase 3 — was one bordered
            Card per task (a scanned-and-compared list, exactly the case
            Phase 3 calls out for row treatment, not one-card-per-record).
            Now one shared bordered list with a divider between rows,
            same rhythm as Cases/People. Every field, control, and
            handler is unchanged — RowPrimary's own overflow:hidden/
            ellipsis (already used by Cases/People for long employee
            names) is the actual fix for the reported problem: a task
            named from a long AI-generated signal title (e.g. a full
            unanswered-question sentence) used to wrap across 2–3 lines
            and made rows an inconsistent height, hard to scan at 100
            tasks. It's now one line with the full text still reachable
            via the native title tooltip — nothing hidden, not
            discarded, just not forced onto the row at full length. */}
        {visible.length>0&&(
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,overflow:"hidden"}}>
            {visible.map(t => {
              const cs = caseById[t.caseId];
              const overdue = t.status!=="done" && isOverdue(t.dueDate);
              return (
                <DataRow key={t.id}>
                  <input type="checkbox" aria-label={`Mark "${t.name}" done`} checked={t.status==="done"} onChange={()=>toggleCaseTaskDone(t.id)} style={{cursor:"pointer",flexShrink:0,marginLeft:14}}/>
                  <div style={{flex:1,minWidth:0,padding:"11px 12px 11px 0"}}>
                    <RowPrimary title={t.name} muted={t.status==="done"}>{t.name}</RowPrimary>
                    <RowSecondary>
                      {cs&&<button onClick={()=>openCase(cs.id)} style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:FONT.sans}}>{cs.employeeName}</button>}
                      {/* Organisational ER Intelligence (Phase 6, OP21, §17) — an
                          action created from an Insights card has no case (t.caseId
                          is null); insightRef names which insight prompted it in
                          place of the case link every other row shows. */}
                      {!cs&&t.insightRef&&<span style={{color:COLOR.purple}}>{t.insightRef}</span>}
                      {t.owner&&<span>· {t.owner}</span>}
                      {t.dueDate&&<span style={{color:overdue?COLOR.red:COLOR.inkFaint}}>· Due {fmtDate(t.dueDate)}{overdue?" (overdue)":""}</span>}
                    </RowSecondary>
                  </div>
                  <Badge color={PRIORITY_COLOR[t.priority]||PRIORITY_COLOR.normal}>{(t.priority||"normal").toUpperCase()}</Badge>
                  <button onClick={()=>deleteCaseTask(t.id)} style={{fontSize:11,color:COLOR.red,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,marginRight:14,flexShrink:0}}>Remove</button>
                </DataRow>
              );
            })}
          </div>
        )}
        {hasMore && (
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,cursor:"pointer",fontSize:13,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            Load more ({total-visible.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
