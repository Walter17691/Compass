export function MDRenderer({ text, light }) {
  const base = light ? "#1C1820" : "#1A1535";
  const accent = "#7C5CFC";
  if(!text) return null;
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,6} /g, '');
  const lns = clean.split(String.fromCharCode(10));
  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",lineHeight:1.75,color:base}}>
      {lns.map((line,i)=>{
        const t = line.trim();
        if(!t) return <div key={i} style={{height:8}}/>;
        if(t==="---"||t==="***") return <hr key={i} style={{border:"none",borderTop:"1px solid #E8E0D0",margin:"10px 0"}}/>;
        if(t.startsWith("- ")||t.startsWith("• ")||t.startsWith("* ")) return <div key={i} style={{display:"flex",gap:8,marginBottom:5,color:base,alignItems:"flex-start"}}><span style={{color:accent,flexShrink:0,fontSize:16,lineHeight:"1.4"}}>·</span><span>{t.startsWith("* ")?t.slice(2):t.slice(2)}</span></div>;
        if(/^\d+\.\s/.test(t)) return <div key={i} style={{marginBottom:5,paddingLeft:10,borderLeft:"2px solid #EDE8FF",color:base}}>{t}</div>;
        return <p key={i} style={{margin:"0 0 8px",color:base}}>{t}</p>;
      })}
    </div>
  );
}
