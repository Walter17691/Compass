import { useState } from 'react';

// Organisational ER Intelligence (Phase 6, OP6, §3) — the HR-editable
// theme taxonomy, rendered in the Insights workspace's "Trends & Themes"
// tab. Viewing the list is open to everyone who reaches this tab (same
// as Reports); creating/editing a theme is only wired up for HR here,
// matching organisation_themes' own RLS (only HR can INSERT/UPDATE) —
// a non-HR user sees the same list, read-only, rather than controls
// that would just fail against the database.
export function ThemeTaxonomyManager({ organisationThemes, isHR, onAdd, onUpdate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const sorted = [...(organisationThemes || [])].sort((a,b)=>a.name.localeCompare(b.name));

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:14}}>Theme taxonomy</div>

      {sorted.length===0 && <div style={{fontSize:13,color:"#6B6375",marginBottom:14}}>No themes defined yet{isHR?" — add the first one below.":"."}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:isHR?16:0}}>
        {sorted.map(t => (
          <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 12px",background:t.active?"#FDFAF5":"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:8}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:t.active?"#1A1535":"#9B9098"}}>{t.name}</div>
              {t.description && <div style={{fontSize:11,color:"#9B9098"}}>{t.description}</div>}
            </div>
            {isHR && (
              <button onClick={()=>onUpdate(t.id,{active:!t.active})} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",flexShrink:0}}>
                {t.active?"Deactivate":"Reactivate"}
              </button>
            )}
          </div>
        ))}
      </div>

      {isHR && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:16,borderTop:sorted.length?"1px solid #F5F1EA":"none"}}>
          <input aria-label="New theme name" value={name} onChange={e=>setName(e.target.value)} placeholder="New theme name" style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",flex:"1 1 160px",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
          <input aria-label="Theme description" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",flex:"2 1 220px",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
          <button onClick={()=>{ if(name.trim()){ onAdd(name, description); setName(""); setDescription(""); } }} disabled={!name.trim()} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:name.trim()?"pointer":"default",opacity:name.trim()?1:0.5,fontFamily:"DM Sans,system-ui,sans-serif"}}>Add theme</button>
        </div>
      )}
    </div>
  );
}
