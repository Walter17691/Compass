import { Btn, Card, Badge } from '../../components/Primitives';

export function PoliciesSection({ policies, setPolicies, policyFileRef, handlePolicyUpload, policyProcessing, lsSet }) {
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Company policies</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload HR policies (.docx, .txt). Compass references them in all AI outputs.</p></div>
        <Badge color="#7C5CFC">AI</Badge>
      </div>
      {policies.length>0&&(
        <div style={{marginBottom:14}}>
          {policies.map(p=>(
            <div key={p.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:7,padding:"9px 12px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{fontSize:12,color:"#1A1535",fontWeight:600}}>{p.name}</span>
                <span style={{fontSize:10,color:"#5A5570",marginLeft:8,fontFamily:"JetBrains Mono,monospace"}}>{p.size}</span>
              </div>
              <Btn variant="danger" onClick={()=>{const u=policies.filter(x=>x.id!==p.id);setPolicies(u);lsSet("compass_policies",u);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn>
            </div>
          ))}
        </div>
      )}
      {policies.length===0&&<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:14,fontSize:12,color:"#5A5570"}}>No policies uploaded</div>}
      <input ref={policyFileRef} type="file" multiple accept=".txt,.md,.docx" onChange={handlePolicyUpload} style={{display:"none"}} />
      <Btn onClick={()=>policyFileRef.current?.click()} disabled={policyProcessing}>{policyProcessing?"Processing...":"+ Upload policies →"}</Btn>
      {policies.length>0&&<div style={{marginTop:12,fontSize:11,color:"#7C5CFC"}}>✓ Active in: prep, note structuring, letter drafting, risk scoring</div>}
    </Card>
  );
}
