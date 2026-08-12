import { Btn } from './Primitives';

const KIND_LABEL = { meeting: "Meeting", evidence: "Evidence", allegation: "Allegation", document: "Document", transcript: "Meeting record", context: "Context" };

// Explainability drill-down — resolves a signal's source_refs back to the
// case content that produced it. resolveRef is supplied by the caller
// (rather than this component reading case/allegations state itself)
// since different call sites — a single case's signals today, an org-wide
// assistant's later — have different data available to resolve against.
export function WhySourcesModal({ title, reasoning, sourceRefs = [], resolveRef, onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="why-sources-title"
      onKeyDown={e=>{ if(e.key==="Escape") onClose(); }}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:520,maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Why Compass is saying this</div>
        <h3 id="why-sources-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",marginBottom:10,fontWeight:400}}>{title}</h3>
        {reasoning && <p style={{fontSize:13,color:"#6B6375",lineHeight:1.7,marginBottom:18}}>{reasoning}</p>}

        {sourceRefs.length === 0 && (
          <p style={{fontSize:12,color:"#9B9098",marginBottom:20}}>No specific source recorded for this observation.</p>
        )}
        {sourceRefs.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {sourceRefs.map((ref, i) => {
              const resolved = resolveRef ? resolveRef(ref) : null;
              return (
                <div key={i} style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#9B9098",textTransform:"uppercase",letterSpacing:0.5}}>{KIND_LABEL[ref.kind] || ref.kind}</div>
                  <div style={{fontSize:13,color:"#1A1535",marginTop:2}}>{resolved?.label || ref.label || "Source no longer available"}</div>
                  {resolved?.detail && <div style={{fontSize:12,color:"#6B6375",marginTop:2}}>{resolved.detail}</div>}
                  {resolved?.date && <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{resolved.date}</div>}
                </div>
              );
            })}
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}
