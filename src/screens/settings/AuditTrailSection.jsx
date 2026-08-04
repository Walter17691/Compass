import { Card } from '../../components/Primitives';

export function AuditTrailSection({ auditLog }) {
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Audit trail</h3><p style={{fontSize:12,color:"#6B6375",margin:0}}>Every action timestamped and logged.</p></div>
        <span style={{fontSize:11,color:"#6B6880"}}>{auditLog.length} entries</span>
      </div>
      <div style={{maxHeight:420,overflowY:"auto"}}>
        {auditLog.slice(0,50).map((e,i)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
            <span style={{fontSize:10,color:"#5A5570",fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:1}}>{new Date(e.ts).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
            <div>
              <span style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{e.action}</span>
              {e.detail&&<span style={{fontSize:11,color:"#6B6880",marginLeft:6}}>{e.detail}</span>}
              {e.user&&e.user!=="HR Manager"&&<span style={{fontSize:10,color:"#7C5CFC",marginLeft:6}}>· {e.user}</span>}
            </div>
          </div>
        ))}
        {auditLog.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No actions logged yet</div>}
      </div>
    </Card>
  );
}
