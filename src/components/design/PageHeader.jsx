import { TYPE, COLOR, SPACE } from '../../styles/tokens';

// Phase 2B — shared plain page-title treatment (Cases/People/Insights/
// Settings), distinct from the editorial TYPE.identity used for a
// person's own name on Home/Case Workspace. `identity` opts into that
// serif treatment for the one or two screens (currently none in Phase
// 2B — Settings/Insights explicitly stay plain) that still want it.
//
// Design System Convergence pass, Phase 2 — extended (not replaced) with
// two optional slots so every screen can express the same five-part
// header (eyebrow / title / description / primary action / status line)
// through one component rather than each screen hand-rolling its own
// subset: `eyebrow` (a small caps context label — SaveEmailScreen's own
// "Groundwork" was already doing this ad hoc) and `meta` (a trailing
// status/count line below the subtitle, e.g. DSAR's "3 overdue"). Both
// default to nothing, so every existing caller is unaffected.
export function PageHeader({ eyebrow, title, subtitle, meta, identity = false, actions }) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:SPACE.xl,flexWrap:"wrap"}}>
      <div style={{minWidth:0}}>
        {eyebrow && <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:6}}>{eyebrow}</div>}
        <h1 style={identity
          ? {...TYPE.identity,color:COLOR.ink,margin:"0 0 4px"}
          : {...TYPE.pageTitle,color:COLOR.ink,margin:"0 0 4px"}}>{title}</h1>
        {subtitle && <div style={{...TYPE.metadata,color:COLOR.inkFaint}}>{subtitle}</div>}
        {meta && <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginTop:6}}>{meta}</div>}
      </div>
      {actions && <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>{actions}</div>}
    </div>
  );
}
