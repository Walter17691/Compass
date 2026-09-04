import { COLOR, FONT } from '../styles/tokens';
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
// 10/10 pass, item 7 — every item used to get the same solid red-tinted
// alarm box regardless of category or count, which overstated certainty
// for what the panel's own subtitle already says is "not a legal
// conclusion." No severity field exists on individual risk items (see
// caseRisk.js — deliberately not fabricated here), so the one honest
// lever available is overall visual weight: a small red dot per row
// instead of a filled alarm box, same restrained language Home's own
// "Needs attention" rows already use for real urgency. No longer its
// own card — composes as a quiet Layer 3 subsection. Every item,
// category, and "Ask why" source is unchanged.
export function CaseRiskPanel({ riskItems = [], onAskWhy }) {
  if (!riskItems.length) return null;
  const grouped = RISK_CATEGORIES.map(c => ({ ...c, items: riskItems.filter(i => i.category === c.id) })).filter(c => c.items.length);

  return (
    <div>
      <div style={{fontSize:11,color:COLOR.inkFaint,marginBottom:12}}>A list of things worth a second look — not a legal conclusion or a compliance score.</div>
      {grouped.map(c => (
        <div key={c.id} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:COLOR.inkSoft,marginBottom:2}}>{c.label} ({c.items.length})</div>
          {c.items.map((item,i) => (
            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"7px 0",borderBottom:i<c.items.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:COLOR.red,flexShrink:0,marginTop:6}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:600,color:COLOR.ink}}>{item.label}</div>
                {item.detail && <div style={{marginTop:2,fontSize:12,color:COLOR.inkSoft}}>{item.detail}</div>}
                {onAskWhy && item.sourceRefs?.length>0 && (
                  <button onClick={()=>onAskWhy({title:item.label, reasoning:item.detail, sourceRefs:item.sourceRefs})} style={{marginTop:4,fontSize:11,background:"none",border:"none",padding:0,color:COLOR.red,cursor:"pointer",fontFamily:FONT.sans}}>Ask why</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
