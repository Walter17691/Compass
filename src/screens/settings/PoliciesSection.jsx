import { useState } from 'react';
import { Btn, Card, Badge } from '../../components/Primitives';
import { CheckIcon } from '../../components/Icons';
import { POLICY_CATEGORIES } from '../../constants';

export function PoliciesSection({ policies, setPolicies, policyFileRef, handlePolicyUpload, policyProcessing, lsSet, changePolicyCategory }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Company policies</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload HR policies (.docx, .txt). Compass indexes each into quotable clauses and references them in all AI outputs.</p></div>
        <Badge color="#7C5CFC">AI</Badge>
      </div>
      {policies.length>0&&(
        <div style={{marginBottom:14}}>
          {policies.map(p=>{
            const clauses = p.clauses||[];
            const isExpanded = expandedId===p.id;
            return (
              <div key={p.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:7,marginBottom:7,overflow:"hidden"}}>
                <div style={{padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:12,color:"#1A1535",fontWeight:600}}>{p.name}</span>
                    <span style={{fontSize:10,color:"#5A5570",marginLeft:8,fontFamily:"JetBrains Mono,monospace"}}>{p.size}</span>
                    {clauses.length>0&&(
                      <button onClick={()=>setExpandedId(isExpanded?null:p.id)} style={{fontSize:10,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0,marginLeft:8}}>
                        {clauses.length} clause{clauses.length!==1?"s":""} indexed — {isExpanded?"hide":"view"}
                      </button>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <select aria-label={`Category for ${p.name}`} value={p.category||"other"} onChange={e=>changePolicyCategory(p.id, e.target.value)} style={{fontSize:11,border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 6px",color:"#6B6375"}}>
                      {POLICY_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <Btn variant="danger" onClick={()=>{const u=policies.filter(x=>x.id!==p.id);setPolicies(u);lsSet("compass_policies",u);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn>
                  </div>
                </div>
                {isExpanded&&(
                  <div style={{padding:"0 12px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    {clauses.map((c,i)=>(
                      <div key={i} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px"}}>
                        <div style={{fontSize:10,fontWeight:700,color:"#9B9098",textTransform:"uppercase",letterSpacing:0.4,marginBottom:3}}>{c.heading}</div>
                        <div style={{fontSize:12,color:"#1A1535",fontStyle:"italic",lineHeight:1.6}}>&ldquo;{c.text}&rdquo;</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {policies.length===0&&<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:14,fontSize:12,color:"#5A5570"}}>No policies uploaded</div>}
      <input ref={policyFileRef} type="file" multiple accept=".txt,.md,.docx" onChange={handlePolicyUpload} style={{display:"none"}} />
      <Btn onClick={()=>policyFileRef.current?.click()} disabled={policyProcessing}>{policyProcessing?"Processing...":"+ Upload policies →"}</Btn>
      {policies.length>0&&<div style={{marginTop:12,fontSize:11,color:"#7C5CFC",display:"flex",alignItems:"center",gap:5}}><CheckIcon size={11} />Active in: prep, note structuring, letter drafting, risk scoring</div>}
    </Card>
  );
}
