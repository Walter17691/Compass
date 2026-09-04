import { COLOR, FONT } from '../../styles/tokens';

// Left-hand rail of settings sections — replaces the old scroll-to-anchor
// pill row with real sub-navigation: only the active section renders, so
// the page is one short screen instead of one long scroll. Collapses to a
// <select> on mobile, where a sidebar has nowhere to go.
//
// Phase 7.5B (P0 polish) — optional `groups` prop
// ([{label, sectionIds:[...]}, ...]) lets a caller with a long flat
// `sections` list (Settings' own ~17 items) render them under category
// headers instead. Strictly additive and opt-in: when `groups` is
// omitted (InsightsScreen's own call site, unchanged), rendering is
// byte-for-byte identical to before — same button markup, same active/
// hover styling, same click handler. No id, label, or route in
// `sections` itself is ever touched by grouping; a group is just a
// presentation-time partition of the same array. A section whose id
// isn't listed in any group (or when `groups` is omitted) still renders,
// ungrouped, after the grouped ones — so a role-gated section simply
// disappearing from `sections` (today's existing isHR filtering) never
// produces an empty visible group or a silently-dropped item.
export function SettingsNav({ sections, active, onChange, isMobile, groups }) {
  const groupedSections = groups
    ? groups
        .map(g => ({ label: g.label, items: sections.filter(s => g.sectionIds.includes(s.id)) }))
        .filter(g => g.items.length > 0)
    : null;
  const groupedIds = new Set((groupedSections||[]).flatMap(g => g.items.map(s => s.id)));
  const ungrouped = groups ? sections.filter(s => !groupedIds.has(s.id)) : sections;

  if(isMobile) return (
    <select aria-label="Settings section" value={active} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:20,fontFamily:FONT.sans}}>
      {groupedSections
        ? <>
            {groupedSections.map(g=>(
              <optgroup key={g.label} label={g.label}>
                {g.items.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            ))}
            {ungrouped.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </>
        : sections.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );

  const navButton = s => (
    <button key={s.id} onClick={()=>onChange(s.id)}
      style={{textAlign:"left",background:active===s.id?COLOR.purpleTint:"none",border:"none",color:active===s.id?COLOR.purple:"#6B6375",padding:"9px 12px",borderRadius:7,fontSize:13,fontWeight:active===s.id?600:400,cursor:"pointer",fontFamily:FONT.sans}}>
      {s.label}
    </button>
  );

  if(!groupedSections) return (
    <nav style={{display:"flex",flexDirection:"column",gap:2,width:190,flexShrink:0}}>
      {sections.map(navButton)}
    </nav>
  );

  return (
    <nav style={{display:"flex",flexDirection:"column",gap:14,width:190,flexShrink:0}}>
      {groupedSections.map(g=>(
        <div key={g.label}>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",padding:"0 12px",marginBottom:4}}>{g.label}</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {g.items.map(navButton)}
          </div>
        </div>
      ))}
      {ungrouped.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {ungrouped.map(navButton)}
        </div>
      )}
    </nav>
  );
}
