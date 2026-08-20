import { useState } from 'react';

// Organisational ER Intelligence (Phase 6, OP21, §17) — actions from
// insights. A small, reusable "Create action" control wired into every
// genuine insight-producing card (TrendsPanel, EarlySignalsPanel,
// RiskMapPanel, RootCauseExplorationPanel). Generalises case_tasks
// (previously always case-scoped, supabase/case_structure_2026-08-09.sql)
// to org-level actions via createCaseTask(null, fields) — the exact same
// pure caseTasks.js helpers and Supabase persistence path as every
// case-scoped task, not a second system. insightRef is a short, honest
// free-text label naming which insight this action came from (there's
// no shared insight-id space across the panels this spans); it's shown
// back in TasksScreen in place of a case link for these rows.
//
// "Link to Improvement Initiative" — the plan's third capability
// alongside Create Action / Assign Owner / Set Due Date — is deferred to
// OP22, which introduces the improvement_initiatives table this would
// reference; it can't be wired before that table exists.
export function CreateActionButton({ insightRef, createCaseTask }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");

  if (created) {
    return <div style={{fontSize:11,color:"#3C8C5C",marginTop:6}}>Action created ✓ — see Tasks</div>;
  }

  if (!open) {
    return (
      <button onClick={()=>setOpen(true)} style={{fontSize:11,background:"none",border:"1px solid #E0D8FF",borderRadius:6,padding:"3px 10px",color:"#7C5CFC",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Create action</button>
    );
  }

  const submit = () => {
    if (!name.trim()) return;
    createCaseTask(null, { name, owner, dueDate, priority, insightRef });
    setCreated(true);
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E0D8FF",borderRadius:8,padding:"10px 12px",marginTop:8}}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Action to take…" style={{width:"100%",fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 8px",boxSizing:"border-box",color:"#1A1535",marginBottom:6,fontFamily:"DM Sans,system-ui,sans-serif"}}/>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Owner" style={{flex:1,minWidth:90,fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 8px",boxSizing:"border-box",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
        <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{flex:1,minWidth:120,fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 8px",boxSizing:"border-box",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
        <select value={priority} onChange={e=>setPriority(e.target.value)} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 8px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={submit} disabled={!name.trim()} style={{fontSize:11,background:name.trim()?"#7C5CFC":"#E8E0D0",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",cursor:name.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif"}}>Save action</button>
        <button onClick={()=>setOpen(false)} style={{fontSize:11,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
      </div>
    </div>
  );
}
