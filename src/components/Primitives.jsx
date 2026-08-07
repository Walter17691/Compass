export function Badge({ children, color="#7C5CFC" }) {
  return <span style={{fontSize:9, fontWeight:700, letterSpacing:1, color, background:color+"18", border:`1px solid ${color}33`, borderRadius:4, padding:"2px 7px"}}>{children}</span>;
}

export function Btn({ children, onClick, variant="primary", disabled, style={} }) {
  const base = { border:"none", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", opacity:disabled?0.4:1, letterSpacing:0.2, ...style };
  const vars = {
    primary: { background:"#7C5CFC", color:"#fff", boxShadow:"0 2px 8px rgba(124,92,252,0.3)" },
    secondary: { background:"#FFFFFF", border:"1px solid #E8E0D0", color:"#6B6375" },
    ghost: { background:"none", border:"1px solid #E8E0D0", color:"#6B6375" },
    danger: { background:"none", border:"1px solid #E8622A33", color:"#C84B2F" },
    blue: { background:"#1C5AA0", color:"#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{...base,...vars[variant]}}>{children}</button>;
}

export function Card({ children, style={}, ...rest }) {
  return <div style={{background:"#FFFFFF", border:"1px solid #E8E0D0", borderRadius:14, padding:24, boxShadow:"0 1px 3px rgba(0,0,0,0.3)", ...style}} {...rest}>{children}</div>;
}

export function SectionTitle({ children }) {
  return <div style={{fontSize:10, fontWeight:700, letterSpacing:1.5, color:"#7C5CFC", background:"#7C5CFC18", border:"1px solid #7C5CFC33", borderRadius:4, padding:"3px 8px", display:"inline-block", marginBottom:14}}>{children}</div>;
}
