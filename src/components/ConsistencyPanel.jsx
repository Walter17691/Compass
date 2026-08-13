import { useState } from 'react';

// Process Intelligence (P14, §11+§12 — one phase, §12 is a hard
// constraint on §11's design, not separable). Extends the sanction/
// finding distribution AllegationsPanel already shows per-allegation
// with three case-level additions: a distribution bucketed by the
// actual SANCTION issued (not just the finding), an AI-generated
// similarity/distinguishing-features review, and an expandable list of
// anonymised comparable cases (case type + finding + reasoning excerpt
// — never an employee name). Rendered once per case, not per
// allegation, since none of this is allegation-specific.
export function ConsistencyPanel({ cs, sanctionDistribution, comparableCases, consistencyReview, consistencyReviewLoading, onGenerateReview }) {
  const [expandedKey, setExpandedKey] = useState(null);
  if (!sanctionDistribution.applicable && !comparableCases.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:0.5,textTransform:"uppercase"}}>Consistency check</div>
        {comparableCases.length>=3 && (
          <button onClick={()=>onGenerateReview(cs)} disabled={consistencyReviewLoading} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:consistencyReviewLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            {consistencyReviewLoading?"Reviewing…":"Generate consistency review"}
          </button>
        )}
      </div>

      {sanctionDistribution.applicable && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#9B9098",marginBottom:8}}>How {sanctionDistribution.total} closed {cs.caseType} case{sanctionDistribution.total===1?"":"s"} at this organisation were sanctioned. For context only — every case turns on its own facts.</div>
          {sanctionDistribution.distribution.map(d=>(
            <div key={d.outcome} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <div style={{width:160,fontSize:11,color:"#1A1535",flexShrink:0}}>{d.outcome}</div>
              <div style={{flex:1,background:"#EDE5D8",borderRadius:4,height:6,overflow:"hidden"}}>
                <div style={{width:d.pct+"%",background:"#7C5CFC",height:"100%"}}/>
              </div>
              <div style={{width:64,fontSize:11,color:"#6B6375",textAlign:"right",flexShrink:0}}>{d.pct}% ({d.count})</div>
            </div>
          ))}
        </div>
      )}

      {consistencyReview && (consistencyReview.similarityReasoning || consistencyReview.distinguishingFeatures) && (
        <div style={{marginBottom:14,background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:12}}>
          {consistencyReview.similarityReasoning && (
            <div style={{marginBottom:consistencyReview.distinguishingFeatures?10:0}}>
              <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>Why these cases are comparable</div>
              <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6}}>{consistencyReview.similarityReasoning}</div>
            </div>
          )}
          {consistencyReview.distinguishingFeatures && (
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#B87520",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>What&rsquo;s different about this case</div>
              <div style={{fontSize:13,color:"#6B5218",lineHeight:1.6}}>{consistencyReview.distinguishingFeatures}</div>
            </div>
          )}
        </div>
      )}

      {comparableCases.length>0 && (
        <div>
          <div style={{fontSize:11,color:"#9B9098",marginBottom:6}}>Comparable closed cases ({comparableCases.length}) — anonymised, no employee names</div>
          {comparableCases.map(c=>(
            <div key={c.key} style={{border:"1px solid #EDE5D8",borderRadius:6,marginBottom:6,overflow:"hidden"}}>
              <div onClick={()=>setExpandedKey(k=>k===c.key?null:c.key)} style={{padding:"8px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"#1A1535"}}>
                <span>{cs.caseType} — {c.outcome||"No recorded outcome"}</span>
                <span style={{color:"#7C5CFC",fontSize:11}}>{expandedKey===c.key?"Hide":"View"}</span>
              </div>
              {expandedKey===c.key && (
                <div style={{padding:"8px 10px",borderTop:"1px solid #EDE5D8",background:"#FDFAF5"}}>
                  {c.findings.map((f,i)=>(
                    <div key={i} style={{fontSize:12,color:"#3D3560",marginBottom:6}}>
                      <span style={{fontWeight:600}}>{f.label}</span>{f.reasoningExcerpt?" — "+f.reasoningExcerpt:""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
