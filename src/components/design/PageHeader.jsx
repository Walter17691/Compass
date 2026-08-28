import { TYPE, COLOR, SPACE } from '../../styles/tokens';

// Phase 2B — shared plain page-title treatment (Cases/People/Insights/
// Settings), distinct from the editorial TYPE.identity used for a
// person's own name on Home/Case Workspace. `identity` opts into that
// serif treatment for the one or two screens (currently none in Phase
// 2B — Settings/Insights explicitly stay plain) that still want it.
export function PageHeader({ title, subtitle, identity = false, actions }) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:SPACE.xl,flexWrap:"wrap"}}>
      <div style={{minWidth:0}}>
        <h1 style={identity
          ? {...TYPE.identity,color:COLOR.ink,margin:"0 0 4px"}
          : {...TYPE.pageTitle,color:COLOR.ink,margin:"0 0 4px"}}>{title}</h1>
        {subtitle && <div style={{...TYPE.metadata,color:COLOR.inkFaint}}>{subtitle}</div>}
      </div>
      {actions && <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>{actions}</div>}
    </div>
  );
}
