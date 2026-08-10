import { useState } from 'react';
import { CheckIcon, WarningIcon } from './Icons';

// Case-quality-and-completeness indicator, not a compliance gate — the
// wording and the fact that "Progress anyway" is always available on the
// existing Copilot action button (unchanged, not touched by this
// component) are both deliberate: this only ever informs, never blocks.
export function CaseReadinessBadge({ readiness }) {
  const [expanded, setExpanded] = useState(false);
  if (!readiness.applicable) return null;
  const { status, score, checks, gaps } = readiness;

  return (
    <div style={{marginTop:8}}>
      <button onClick={()=>setExpanded(v=>!v)}
        style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:status.color,background:status.bg,border:"none",borderRadius:20,padding:"4px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
        {status.label} · {score}%
        <span style={{fontSize:10,opacity:0.7}}>{expanded?"▴":"▾"}</span>
      </button>

      {expanded && (
        <div style={{marginTop:8,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:14,maxWidth:480}}>
          {gaps.length>0 ? (
            <div style={{fontSize:12,color:"#6B6375",marginBottom:10}}>
              Compass has identified {gaps.length} {gaps.length===1?"matter":"matters"} that may require consideration before this case progresses.
            </div>
          ) : (
            <div style={{fontSize:12,color:"#1A7A4A",marginBottom:10}}>Nothing outstanding — this is a case quality indicator only, not a legal compliance guarantee.</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {checks.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"flex-start",gap:8}}>
                {c.met ? <CheckIcon size={13} color="#1A7A4A" style={{marginTop:2,flexShrink:0}}/> : <WarningIcon size={13} color="#B87520" style={{marginTop:1,flexShrink:0}}/>}
                <div>
                  <div style={{fontSize:13,color:"#1A1535"}}>{c.label}</div>
                  {!c.met && <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{c.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
