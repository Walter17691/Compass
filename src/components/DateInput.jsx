export function DateInput({ id, value, onChange, style={} }) {
  return (
    <div className="date-wrap">
      <input id={id} type="date" value={value} onChange={onChange}
        onClick={e=>e.currentTarget.showPicker?.()}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 36px 9px 12px",fontSize:13,outline:"none",color:"#1A1535",boxSizing:"border-box",...style,colorScheme:"light",cursor:"pointer"}} />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </div>
  );
}
