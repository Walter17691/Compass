// 10/10 pass — this file's own colours/radii were the one hardcoded
// system running in parallel to styles/tokens.js's COLOR/RADIUS/SPACE
// (tokens.js's own comment named this file as "a candidate for migrating
// onto these same tokens in a later phase, once its own consumers are in
// scope" — that phase is now, across Settings/Redundancy/Wellbeing/Tasks/
// DSAR/etc.). Every hex/px value below is byte-identical to what it
// replaces (COLOR.surface===#FFFFFF, COLOR.border===#E8E0D0, etc.) except
// two real fixes: `ghost` had the exact same border and text colour as
// `secondary` (background:none vs "#FFFFFF" is invisible against a paper
// background), so a 5-action row (e.g. Overview's Unanswered Questions
// cards) rendered as 5 equal-weight buttons with no hierarchy at all —
// ghost is now genuinely borderless/quieter, a real tertiary tier below
// secondary. Card's 0.3-alpha drop shadow and radius 14 (vs every other
// surface's flat border + radius 8) read as a visibly different, heavier
// design language wherever it's used — now a flat bordered surface
// matching the rest of the product.
import { COLOR, RADIUS, SPACE, FONT } from '../styles/tokens';

export function Badge({ children, color=COLOR.purple }) {
  return <span style={{fontSize:9, fontWeight:700, letterSpacing:1, color, background:color+"18", border:`1px solid ${color}33`, borderRadius:4, padding:"2px 7px"}}>{children}</span>;
}

export function Btn({ children, onClick, variant="primary", disabled, style={} }) {
  const base = { border:"none", borderRadius:RADIUS.surface, padding:"10px 20px", fontSize:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", opacity:disabled?0.4:1, letterSpacing:0.2, fontFamily:FONT.sans, ...style };
  const vars = {
    primary: { background:COLOR.purple, color:"#fff" },
    secondary: { background:COLOR.surface, border:`1px solid ${COLOR.border}`, color:COLOR.inkSoft },
    ghost: { background:"none", border:"none", color:COLOR.inkSoft },
    danger: { background:"none", border:`1px solid ${COLOR.red}44`, color:COLOR.red },
    blue: { background:"#1C5AA0", color:"#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{...base,...vars[variant]}}>{children}</button>;
}

export function Card({ children, style={}, ...rest }) {
  return <div style={{background:COLOR.surface, border:`1px solid ${COLOR.border}`, borderRadius:RADIUS.surface, padding:SPACE.xl, ...style}} {...rest}>{children}</div>;
}

export function SectionTitle({ children }) {
  return <div style={{fontSize:10, fontWeight:700, letterSpacing:1.5, color:COLOR.purple, background:COLOR.purple+"18", border:`1px solid ${COLOR.purple}33`, borderRadius:4, padding:"3px 8px", display:"inline-block", marginBottom:14}}>{children}</div>;
}
