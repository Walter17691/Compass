import { useState } from 'react';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

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
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"18px 20px"}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.md}}>Theme taxonomy</div>

      {sorted.length===0 && <div style={{fontSize:13,color:COLOR.inkFaint,marginBottom:14}}>No themes defined yet{isHR?" — add the first one below.":"."}</div>}
      <div style={{marginBottom:isHR?16:0}}>
        {sorted.map(t => (
          <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 4px",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:t.active?COLOR.ink:COLOR.inkFaint}}>{t.name}</div>
              {t.description && <div style={{fontSize:11,color:COLOR.inkFaint}}>{t.description}</div>}
            </div>
            {isHR && (
              <button onClick={()=>onUpdate(t.id,{active:!t.active})} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"4px 10px",color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>
                {t.active?"Deactivate":"Reactivate"}
              </button>
            )}
          </div>
        ))}
      </div>

      {isHR && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:16,borderTop:sorted.length?`1px solid ${COLOR.borderFaint}`:"none"}}>
          <input aria-label="New theme name" value={name} onChange={e=>setName(e.target.value)} placeholder="New theme name" style={{fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",flex:"1 1 160px",fontFamily:FONT.sans}}/>
          <input aria-label="Theme description" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" style={{fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",flex:"2 1 220px",fontFamily:FONT.sans}}/>
          <button onClick={()=>{ if(name.trim()){ onAdd(name, description); setName(""); setDescription(""); } }} disabled={!name.trim()} style={{fontSize:12,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:name.trim()?"pointer":"default",opacity:name.trim()?1:0.5,fontFamily:FONT.sans}}>Add theme</button>
        </div>
      )}
    </div>
  );
}
