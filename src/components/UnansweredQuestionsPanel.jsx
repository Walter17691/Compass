import { COLOR, SPACE, TYPE } from '../styles/tokens';
import { CheckIcon } from './Icons';
import { SignalCard } from './SignalCard';

// Phase 2 of the AI-copilot reasoning-layer build-out — reads
// openSignalsForCase(caseSignals, cs.id, "unanswered_question") from the
// caller, same as Next Best Action reads its own signal type. "Covered"
// topics are session-local (see App.jsx's unansweredCovered state) since
// they're informational only, not actionable the way an open question is.
// 10/10 pass, Part A — no longer its own bordered card with a tinted
// header bar; composes as a subsection of OverviewTab's shared "Case
// readiness" surface, and each open question is a queue row (SignalCard)
// rather than its own card. Same data, same Refresh/Review-the-case
// trigger, same three-state content (empty prompt / Covered / Still to
// explore) — presentation only.
export function UnansweredQuestionsPanel({ cs, covered = [], stillToExplore, loading, onGenerate, createCaseTask, changeSignalStatus, onAskWhy }) {
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:SPACE.sm}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Unanswered questions</div>
        <button onClick={()=>onGenerate(cs)} disabled={loading}
          style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"4px 10px",color:COLOR.inkSoft,cursor:loading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          {loading?"Reviewing the case…":(covered.length||stillToExplore.length)?"Refresh":"Review the case"}
        </button>
      </div>
      {!loading && covered.length===0 && stillToExplore.length===0 && (
        <div style={{fontSize:13,color:COLOR.inkFaint}}>Ask Compass to review what's been covered in this case and what hasn't.</div>
      )}

      {covered.length>0 && (
        <div style={{marginBottom:stillToExplore.length>0?16:0}}>
          <div style={{fontSize:10,fontWeight:700,color:COLOR.green,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Covered</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {covered.map((topic,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:COLOR.ink}}>
                <CheckIcon size={12} color={COLOR.green}/>
                <span>{topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stillToExplore.length>0 && (
        <div>
          <div style={{fontSize:10,fontWeight:700,color:COLOR.amber,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Still to explore</div>
          <div style={{display:"flex",flexDirection:"column"}}>
            {stillToExplore.map((signal,i)=>(
              <SignalCard key={signal.id} signal={signal} last={i===stillToExplore.length-1}
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
  );
}
