import { CheckIcon } from './Icons';
import { SignalCard } from './SignalCard';

// Phase 2 of the AI-copilot reasoning-layer build-out — reads
// openSignalsForCase(caseSignals, cs.id, "unanswered_question") from the
// caller, same as Next Best Action reads its own signal type. "Covered"
// topics are session-local (see App.jsx's unansweredCovered state) since
// they're informational only, not actionable the way an open question is.
export function UnansweredQuestionsPanel({ cs, covered = [], stillToExplore, loading, onGenerate, createCaseTask, changeSignalStatus, onAskWhy }) {
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Unanswered questions</div>
        <button onClick={()=>onGenerate(cs)} disabled={loading}
          style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:loading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          {loading?"Reviewing the case…":(covered.length||stillToExplore.length)?"Refresh":"Review the case"}
        </button>
      </div>
      <div style={{padding:"16px"}}>
        {!loading && covered.length===0 && stillToExplore.length===0 && (
          <div style={{fontSize:13,color:"#9B9098"}}>Ask Compass to review what's been covered in this case and what hasn't.</div>
        )}

        {covered.length>0 && (
          <div style={{marginBottom:stillToExplore.length>0?16:0}}>
            <div style={{fontSize:10,fontWeight:700,color:"#1A7A4A",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Covered</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {covered.map((topic,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#1A1535"}}>
                  <CheckIcon size={12} color="#1A7A4A"/>
                  <span>{topic}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stillToExplore.length>0 && (
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#B87520",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Still to explore</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {stillToExplore.map(signal=>(
                <SignalCard key={signal.id} signal={signal}
                  onMarkNotRelevant={()=>changeSignalStatus(signal.id, "not_relevant")}
                  onMarkResolved={()=>changeSignalStatus(signal.id, "resolved")}
                  onAskWhy={()=>onAskWhy(signal)}
                  extraActions={[
                    {label:"Create task", onClick:()=>{createCaseTask(cs.id, {name:signal.title}); changeSignalStatus(signal.id, "accepted", "Converted to a task");}},
                    {label:"Create evidence request", onClick:()=>{createCaseTask(cs.id, {name:"Obtain evidence: "+signal.title}); changeSignalStatus(signal.id, "accepted", "Converted to an evidence request");}},
                  ]}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
