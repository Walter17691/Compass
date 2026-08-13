import { RISK_CATEGORIES } from '../lib/caseRisk';

// Process Intelligence (P15, §13) — the aggregated view over what P6
// (procedural signals), P7 (policy deviation audit entries), P8 (role
// conflicts), and P13 (appeal grounds) already compute, plus a few new
// deterministic checks (evidence gap, delay, outstanding grievance,
// missing medical info/reasonable adjustments) — see caseRisk.js for
// the full derivation. Explicitly not a legal conclusion or compliance
// score, same disclaimer discipline as runRiskScore/CaseReadinessBadge:
// a named list of things worth a second look, with a source for each,
// never a verdict.
export function CaseRiskPanel({ riskItems = [], onAskWhy }) {
  if (!riskItems.length) return null;
  const grouped = RISK_CATEGORIES.map(c => ({ ...c, items: riskItems.filter(i => i.category === c.id) })).filter(c => c.items.length);

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#C84B2F",letterSpacing:0.5,textTransform:"uppercase",marginBottom:4}}>Case risk</div>
      <div style={{fontSize:11,color:"#9B9098",marginBottom:12}}>A list of things worth a second look — not a legal conclusion or a compliance score.</div>
      {grouped.map(c => (
        <div key={c.id} style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:600,color:"#1A1535",marginBottom:6}}>{c.label} ({c.items.length})</div>
          {c.items.map((item,i) => (
            <div key={i} style={{background:"#FEF0EB",border:"1px solid #F5CFC0",borderRadius:8,padding:"8px 10px",marginBottom:6,fontSize:12,color:"#8A3420"}}>
              <div style={{fontWeight:600}}>{item.label}</div>
              {item.detail && <div style={{marginTop:2,color:"#6B6375"}}>{item.detail}</div>}
              {onAskWhy && item.sourceRefs?.length>0 && (
                <button onClick={()=>onAskWhy({title:item.label, reasoning:item.detail, sourceRefs:item.sourceRefs})} style={{marginTop:6,fontSize:11,background:"none",border:"1px solid #F5CFC0",borderRadius:5,padding:"2px 8px",color:"#C84B2F",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ask why</button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
