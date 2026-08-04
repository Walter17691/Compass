// Left-hand rail of settings sections — replaces the old scroll-to-anchor
// pill row with real sub-navigation: only the active section renders, so
// the page is one short screen instead of one long scroll. Collapses to a
// <select> on mobile, where a sidebar has nowhere to go.
export function SettingsNav({ sections, active, onChange, isMobile }) {
  if(isMobile) return (
    <select value={active} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:20,fontFamily:"DM Sans,system-ui,sans-serif"}}>
      {sections.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
  return (
    <nav style={{display:"flex",flexDirection:"column",gap:2,width:190,flexShrink:0}}>
      {sections.map(s=>(
        <button key={s.id} onClick={()=>onChange(s.id)}
          style={{textAlign:"left",background:active===s.id?"#F5F3FF":"none",border:"none",color:active===s.id?"#7C5CFC":"#6B6375",padding:"9px 12px",borderRadius:7,fontSize:13,fontWeight:active===s.id?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
