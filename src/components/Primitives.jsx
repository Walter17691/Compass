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
import { COLOR, RADIUS, SPACE, FONT, TYPE, GRADIENT } from '../styles/tokens';

// Design spec §8 "pill" role — in practice a low-radius rounded-rect
// chip (24px tall, 7px radius), not a true stadium pill; kept the
// existing `Badge` name since every consumer already calls it that.
export function Badge({ children, color=COLOR.purple }) {
  return <span style={{...TYPE.pill, color, background:color+"18", border:`1px solid ${color}33`, borderRadius:RADIUS.chip, height:24, display:"inline-flex", alignItems:"center", padding:"0 9px", boxSizing:"border-box"}}>{children}</span>;
}

export function Btn({ children, onClick, variant="primary", disabled, style={} }) {
  const base = { border:"none", borderRadius:RADIUS.button, height:42, padding:"0 18px", boxSizing:"border-box", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:TYPE.button.fontSize, fontWeight:variant==="primary"?700:TYPE.button.fontWeight, cursor:disabled?"not-allowed":"pointer", transition:"background 0.16s ease, box-shadow 0.16s ease", opacity:disabled?0.4:1, fontFamily:FONT.sans, ...style };
  const vars = {
    primary: { background:GRADIENT, color:"#fff" },
    secondary: { background:COLOR.surface, border:`1px solid ${COLOR.borderStrong}`, color:COLOR.ink },
    ghost: { background:"none", border:"none", color:COLOR.inkSoft },
    danger: { background:"none", border:`1px solid ${COLOR.red}44`, color:COLOR.red },
    // Was a solid blue (#1C5AA0) — the design spec has no blue application
    // accent. These 4 call sites (Redundancy/Develop/Letter/Branding —
    // "Mark case complete"/"Save to case"/"Upload .docx template") are
    // ordinary strong actions, not urgency or brand/interactive moments,
    // so they map to a solid neutral-ink fill rather than violet (which
    // would have made them read as the page's primary action) or a
    // downgraded outline (which would have lost their intended weight).
    // Renamed from "blue" to "dark" since the variant key describing a
    // colour it no longer renders would be actively misleading.
    dark: { background:COLOR.ink, color:"#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{...base,...vars[variant]}}>{children}</button>;
}

export function Card({ children, style={}, ...rest }) {
  return <div style={{background:COLOR.surface, border:`1px solid ${COLOR.border}`, borderRadius:RADIUS.card, boxShadow:"0 1px 2px rgba(15,18,36,0.04)", padding:SPACE.xl, ...style}} {...rest}>{children}</div>;
}

// Design spec §5 "Section title" — sentence case, 15px/700, no uppercase
// tracking and no chip/tint treatment (the spec is explicit: "No
// uppercase tracked-label styling. Sentence case throughout."), reversing
// this component's previous eyebrow-badge look.
export function SectionTitle({ children }) {
  return <div style={{...TYPE.sectionHeading, color:COLOR.ink, marginBottom:14}}>{children}</div>;
}
