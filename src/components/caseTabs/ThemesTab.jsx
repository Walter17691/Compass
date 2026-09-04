import { useState } from 'react';
import { themesForCase, activeThemes, matchExistingTheme } from '../../lib/themes';
import { FONT } from '../../styles/tokens';

// Organisational ER Intelligence (Phase 6, OP6, §3) — per-case theme
// tagging. Confirmed themes (case_themes rows) render as removable
// chips; "Suggest themes" runs a real AI call (App.jsx's
// suggestThemesForCase) and shows each suggestion with Confirm/Dismiss,
// mirroring the AI-finding/HR-approval shape used throughout the app.
// A suggested name that doesn't match the existing taxonomy can only be
// confirmed by HR (matches organisation_themes' own RLS) — anyone else
// sees it disabled with a note to ask HR, rather than a button that
// would just fail silently against the database.
export function ThemesTab({ cs, organisationThemes, caseThemes, suggestions, suggesting, isHR, onSuggest, onConfirmSuggestion, onDismissSuggestion, onAssignExisting, onRemove }) {
  const [pickerValue, setPickerValue] = useState("");
  const applied = themesForCase(caseThemes, cs.id);
  const appliedThemeIds = new Set(applied.map(t => t.themeId));
  const themeById = id => (organisationThemes || []).find(t => t.id === id);
  const available = activeThemes(organisationThemes).filter(t => !appliedThemeIds.has(t.id));
  const pendingSuggestions = (suggestions || []).filter(name => !applied.some(t => themeById(t.themeId)?.name.toLowerCase() === name.toLowerCase()));

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Themes ({applied.length})</div>
        <button onClick={()=>onSuggest(cs)} disabled={suggesting} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:8,padding:"6px 14px",color:"#fff",fontWeight:600,cursor:suggesting?"default":"pointer",opacity:suggesting?0.6:1,fontFamily:FONT.sans}}>
          {suggesting?"Suggesting…":"Suggest themes"}
        </button>
      </div>

      <div style={{padding:"16px"}}>
        {applied.length===0 && <div style={{fontSize:13,color:"#9B9098",marginBottom:14}}>No themes applied to this case yet.</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {applied.map(t => {
            const theme = themeById(t.themeId);
            if(!theme) return null;
            return (
              <span key={t.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#1A1535",background:"#F5F3FF",border:"1px solid #E0D8FF",borderRadius:20,padding:"4px 6px 4px 12px"}}>
                {theme.name}
                <button onClick={()=>onRemove(t.id)} aria-label={"Remove "+theme.name} style={{background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontSize:13,padding:"0 4px",fontFamily:FONT.sans}}>×</button>
              </span>
            );
          })}
        </div>

        {pendingSuggestions.length>0 && (
          <div style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid #F5F1EA"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#9B9098",marginBottom:8}}>AI-suggested themes</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pendingSuggestions.map(name => {
                const matches = !!matchExistingTheme(organisationThemes, name);
                const canConfirm = matches || isHR;
                return (
                  <div key={name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 12px"}}>
                    <span style={{fontSize:13,color:"#1A1535"}}>{name}{!matches&&<span style={{color:"#9B9098",fontSize:11}}> · new theme{!isHR?" — ask HR to add it":""}</span>}</span>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>onConfirmSuggestion(cs, name)} disabled={!canConfirm} style={{fontSize:11,background:canConfirm?"#1A7A4A":"#E8E0D0",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontWeight:600,cursor:canConfirm?"pointer":"default",fontFamily:FONT.sans}}>Confirm</button>
                      <button onClick={()=>onDismissSuggestion(cs, name)} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:FONT.sans}}>Dismiss</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {available.length>0 && (
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <select aria-label="Add existing theme" value={pickerValue} onChange={e=>setPickerValue(e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"6px 10px",fontFamily:FONT.sans,color:"#1A1535"}}>
              <option value="">Add an existing theme…</option>
              {available.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={()=>{ if(pickerValue){ onAssignExisting(cs, pickerValue); setPickerValue(""); } }} disabled={!pickerValue} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"6px 12px",color:"#1A1535",cursor:pickerValue?"pointer":"default",opacity:pickerValue?1:0.5,fontFamily:FONT.sans}}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}
