import { useState } from 'react';
import { Card } from '../../components/Primitives';
import { useLoadMore } from '../../hooks/useLoadMore';

export function AuditTrailSection({ auditLog }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? auditLog.filter(e=>e.action?.toLowerCase().includes(search.toLowerCase())||e.detail?.toLowerCase().includes(search.toLowerCase())||e.user?.toLowerCase().includes(search.toLowerCase()))
    : auditLog;
  const { visible, hasMore, loadMore, total } = useLoadMore(filtered, 50);
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:12,flexWrap:"wrap"}}>
        <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Audit trail</h3><p style={{fontSize:12,color:"#6B6375",margin:0}}>Every action timestamped and logged.</p></div>
        <span style={{fontSize:11,color:"#6B6880"}}>{auditLog.length} entries</span>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search audit trail…"
        style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:12,border:"1px solid #E8E0D0",borderRadius:8,background:"#FDFAF5",color:"#1A1535",outline:"none",marginBottom:12}}/>
      <div style={{maxHeight:420,overflowY:"auto"}}>
        {visible.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
            <span style={{fontSize:10,color:"#5A5570",fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:1}}>{new Date(e.ts).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
            <div>
              <span style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{e.action}</span>
              {e.detail&&<span style={{fontSize:11,color:"#6B6880",marginLeft:6}}>{e.detail}</span>}
              {e.user&&e.user!=="HR Manager"&&<span style={{fontSize:10,color:"#7C5CFC",marginLeft:6}}>· {e.user}</span>}
            </div>
          </div>
        ))}
        {filtered.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>{search?"No matching entries.":"No actions logged yet"}</div>}
      </div>
      {hasMore&&(
        <button onClick={loadMore} style={{width:"100%",marginTop:10,padding:"10px",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,cursor:"pointer",fontSize:12,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
          Load more ({visible.length} of {total})
        </button>
      )}
    </Card>
  );
}
